from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from datetime import datetime, date

import models, schemas
from database import get_db

router = APIRouter(prefix="/api/v1", tags=["orders"])

from websocket import manager

from services.order_pricing_service import (
    PRICING_VERSION,
    TUMBLER_DISCOUNT_PER_UNIT,
    calculate_order_quote
)
from services.announcement_service import get_effective_free_event

@router.get("/pricing-policy", response_model=schemas.StandardResponse[schemas.PricingPolicyResponse])
async def get_pricing_policy():
    """공개 가격 정책 조회 (텀블러 할인 단가 및 스키마 버전 제공)"""
    return schemas.StandardResponse(
        success=True,
        data=schemas.PricingPolicyResponse(
            pricing_version=PRICING_VERSION,
            tumbler_discount_per_unit=TUMBLER_DISCOUNT_PER_UNIT
        ),
        message="가격 정책을 조회했습니다."
    )

@router.post("/orders/quote", response_model=schemas.StandardResponse[schemas.OrderQuoteResponse])
async def get_order_quote(quote_req: schemas.OrderQuoteRequest, db: Session = Depends(get_db)):
    """서버 권위 주문 금액 견적 계산 API"""
    if quote_req.pricing_version != PRICING_VERSION:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "CLIENT_PRICING_SCHEMA_OUTDATED",
                "message": "주문 방식이 업데이트되었습니다. 앱을 새로고침한 뒤 장바구니를 다시 확인해 주세요.",
                "required_pricing_version": PRICING_VERSION
            }
        )

    active_event = get_effective_free_event(db)
    is_event_mode = active_event is not None
    free_event_id = active_event.id if active_event else None

    quote = calculate_order_quote(db, quote_req.items, require_available=True)
    final_total = 0 if is_event_mode else quote.normal_total

    quote_items_res = [
        schemas.OrderQuoteItemResponse(
            client_item_key=it.client_item_key,
            menu_id=it.menu_id,
            quantity=it.quantity,
            option_ids=list(it.selected_option_ids),
            options_text=it.options_text,
            menu_base_price=it.menu_base_price,
            option_extra_price_per_unit=it.option_extra_price_per_unit,
            discount_per_unit=it.discount_per_unit,
            normal_unit_price=it.normal_unit_price,
            normal_line_total=it.normal_line_total,
        )
        for it in quote.items
    ]

    return schemas.StandardResponse(
        success=True,
        data=schemas.OrderQuoteResponse(
            pricing_version=PRICING_VERSION,
            free_event_id=free_event_id,
            is_event_mode=is_event_mode,
            normal_total=quote.normal_total,
            final_total=final_total,
            discount_total=quote.discount_total,
            items=quote_items_res,
        ),
        message="주문 금액을 계산했습니다."
    )

@router.post("/orders", response_model=schemas.StandardResponse[schemas.OrderResponse])
async def create_order(order: schemas.OrderCreate, db: Session = Depends(get_db)):
    # 0. 구버전 클라이언트 차단
    if order.pricing_version != PRICING_VERSION:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "CLIENT_PRICING_SCHEMA_OUTDATED",
                "message": "주문 방식이 업데이트되었습니다. 앱을 새로고침한 뒤 장바구니를 다시 확인해 주세요.",
                "required_pricing_version": PRICING_VERSION
            }
        )

    user = db.query(models.User).filter(models.User.id == order.user_id, models.User.is_active == True).first()
    if not user:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없거나 활성화되지 않았습니다.")
        
    # 1. 영업 상태 확인
    setting = db.query(models.Setting).first()
    if setting and not setting.is_open:
        raise HTTPException(status_code=403, detail="현재 영업 시간이 아닙니다. 주문을 생성할 수 없습니다.")

    # 2. 공용 서비스를 통해 현재 유효한 무료 이벤트 확인
    active_event = get_effective_free_event(db)

    # 3. stale 이벤트 상태 불일치 감지 — 장바구니 입력 중 이벤트가 변경된 경우
    if order.expected_announcement_id is not None:
        server_event_id = active_event.id if active_event else None
        if order.expected_announcement_id != server_event_id:
            raise HTTPException(
                status_code=409,
                detail="이벤트 상태가 변경되었습니다. 결제 금액을 다시 확인해 주세요."
            )

    # 4. 서버 권위 가격 재계산
    quote = calculate_order_quote(db, order.items, require_available=True)

    is_event_mode = active_event is not None
    if is_event_mode:
        server_final_total = 0
        original_price = quote.normal_total
        payment_method = "FREE"
        announcement_id = active_event.id
    else:
        server_final_total = quote.normal_total
        original_price = None
        payment_method = order.payment_method.value
        announcement_id = None

    # 5. 예상 금액과 서버 계산 금액 일치 여부 검증 (409 ORDER_PRICE_CHANGED)
    if order.total_price != server_final_total:
        quote_items_info = [
            {
                "client_item_key": it.client_item_key,
                "normal_unit_price": it.normal_unit_price,
                "normal_line_total": it.normal_line_total,
                "options_text": it.options_text
            }
            for it in quote.items
        ]
        raise HTTPException(
            status_code=409,
            detail={
                "code": "ORDER_PRICE_CHANGED",
                "message": "메뉴 또는 옵션 가격이 변경되었습니다. 장바구니 금액을 다시 확인해 주세요.",
                "expected_total": order.total_price,
                "current_total": server_final_total,
                "normal_total": quote.normal_total,
                "free_event_id": active_event.id if active_event else None,
                "items": quote_items_info
            }
        )

    # 6. 당일 주문 번호 계산
    today = models.get_seoul_time().date()
    last_order = db.query(models.Order)\
        .filter(models.Order.order_date == today)\
        .order_by(models.Order.order_number.desc())\
        .first()
    next_order_number = 1 if not last_order else (last_order.order_number or 0) + 1

    # 7. PWA Installation Key 선택적 연결
    pwa_inst_id = None
    if order.pwa_installation_key:
        from services import pwa_installation_service
        inst_record = pwa_installation_service.get_user_installation_by_key(db, order.pwa_installation_key)
        if inst_record:
            pwa_inst_id = inst_record.id

    # 8. 주문 및 상세 내역(확장 스냅샷 포함) 저장
    new_order = models.Order(
        user_id=order.user_id,
        user_duty_snapshot=user.duty,
        user_name_snapshot=user.name,
        user_phone_snapshot=user.phone,
        request=order.request,
        total_price=server_final_total,
        original_price=original_price,
        announcement_id=announcement_id,
        payment_method=payment_method,
        status=schemas.OrderStatusEnum.PENDING.value,
        order_number=next_order_number,
        order_date=today,
        is_pwa=order.is_pwa,
        pwa_installation_id=pwa_inst_id
    )
    
    try:
        db.add(new_order)
        db.flush()
        
        for calc_item in quote.items:
            order_item = models.OrderItem(
                order_id=new_order.id,
                menu_id=calc_item.menu_id,
                menu_name_snapshot=calc_item.menu_name,
                menu_price_snapshot=calc_item.menu_base_price,
                menu_image_url_snapshot=calc_item.menu_image_url,
                quantity=calc_item.quantity,
                options_text=calc_item.options_text,
                sub_total=calc_item.normal_line_total,  # 이벤트 주문도 정산 가치 보존
                pricing_version=PRICING_VERSION,
                option_price_snapshot=calc_item.option_extra_price_per_unit,
                discount_per_unit_snapshot=calc_item.discount_per_unit,
                discount_total_snapshot=calc_item.discount_total,
                unit_price_snapshot=calc_item.normal_unit_price,
                selected_options_snapshot=list(calc_item.selected_options_snapshot)
            )
            db.add(order_item)
            
        db.commit()
        db.refresh(new_order)
    except IntegrityError:
        db.rollback()
        return schemas.StandardResponse(
            success=False, 
            data=None, 
            message="잠깐 주문이 겹쳤어요. 다시 시도해주시면 바로 접수됩니다 🙏"
        )
    
    # 실시간 알림 전송
    await manager.broadcast({
        "type": "NEW_ORDER",
        "order_id": new_order.id,
        "is_event_order": is_event_mode,
        "announcement_id": announcement_id,
        "status": new_order.status,
        "timestamp": datetime.now().isoformat()
    })
    
    return schemas.StandardResponse(success=True, data=new_order, message="주문이 성공적으로 생성되었습니다.")

@router.post("/orders/admin", response_model=schemas.StandardResponse[schemas.OrderResponse])
async def create_admin_order(order: schemas.AdminOrderCreate, db: Session = Depends(get_db)):
    # 0. 구버전 클라이언트 차단
    if order.pricing_version != PRICING_VERSION:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "CLIENT_PRICING_SCHEMA_OUTDATED",
                "message": "주문 방식이 업데이트되었습니다. 앱을 새로고침한 뒤 장바구니를 다시 확인해 주세요.",
                "required_pricing_version": PRICING_VERSION
            }
        )

    active_event = get_effective_free_event(db)
    is_event_mode = active_event is not None
    is_free_order = (order.payment_method in [schemas.PaymentMethodEnum.FREE, schemas.PaymentMethodEnum.VOLUNTEER])

    # 관리자는 품절 메뉴도 현장 주문 가능하도록 require_available=False
    quote = calculate_order_quote(db, order.items, require_available=False)

    is_event_order = False
    if is_event_mode:
        is_event_order = True
        server_final_total = 0
        original_price = quote.normal_total
        announcement_id = active_event.id
        payment_method = "FREE"
    elif is_free_order:
        server_final_total = 0
        original_price = quote.normal_total
        announcement_id = None
        payment_method = order.payment_method.value
    else:
        server_final_total = quote.normal_total
        original_price = None
        announcement_id = None
        payment_method = order.payment_method.value

    # 예상 금액 불일치 시 409 반환
    if order.total_price != server_final_total:
        quote_items_info = [
            {
                "client_item_key": it.client_item_key,
                "normal_unit_price": it.normal_unit_price,
                "normal_line_total": it.normal_line_total,
                "options_text": it.options_text
            }
            for it in quote.items
        ]
        raise HTTPException(
            status_code=409,
            detail={
                "code": "ORDER_PRICE_CHANGED",
                "message": "메뉴 또는 옵션 가격이 변경되었습니다. 금액을 다시 확인해 주세요.",
                "expected_total": order.total_price,
                "current_total": server_final_total,
                "normal_total": quote.normal_total,
                "free_event_id": active_event.id if active_event else None,
                "items": quote_items_info
            }
        )

    today = models.get_seoul_time().date()
    last_order = db.query(models.Order)\
        .filter(models.Order.order_date == today)\
        .order_by(models.Order.order_number.desc())\
        .first()
    next_order_number = 1 if not last_order else (last_order.order_number or 0) + 1

    new_order = models.Order(
        user_id=None,
        user_duty_snapshot=order.user_duty_snapshot,
        user_name_snapshot=order.user_name_snapshot,
        request=order.request,
        total_price=server_final_total,
        original_price=original_price,
        announcement_id=announcement_id,
        payment_method=payment_method,
        status=order.status,
        order_number=next_order_number,
        order_date=today
    )
    
    try:
        db.add(new_order)
        db.flush()
        
        for calc_item in quote.items:
            order_item = models.OrderItem(
                order_id=new_order.id,
                menu_id=calc_item.menu_id,
                menu_name_snapshot=calc_item.menu_name,
                menu_price_snapshot=calc_item.menu_base_price,
                menu_image_url_snapshot=calc_item.menu_image_url,
                quantity=calc_item.quantity,
                options_text=calc_item.options_text,
                sub_total=calc_item.normal_line_total,
                pricing_version=PRICING_VERSION,
                option_price_snapshot=calc_item.option_extra_price_per_unit,
                discount_per_unit_snapshot=calc_item.discount_per_unit,
                discount_total_snapshot=calc_item.discount_total,
                unit_price_snapshot=calc_item.normal_unit_price,
                selected_options_snapshot=list(calc_item.selected_options_snapshot)
            )
            db.add(order_item)
            
        if not is_event_mode and not is_free_order and order.status in ["PREPARING", "COMPLETED"] and order.payment_method in [schemas.PaymentMethodEnum.CASH, schemas.PaymentMethodEnum.BANK_TRANSFER]:
            payment_log = models.PaymentLog(
                order_id=new_order.id,
                log_type="CALLBACK",
                amount=calculated_total,
                sender_name=order.user_name_snapshot or "현장 결제",
                raw_data={"payment_method": order.payment_method.value, "type": "admin_direct"}
            )
            db.add(payment_log)
            
        db.commit()
        db.refresh(new_order)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="주문 번호 생성에 실패했습니다. 다시 시도해주세요.")

    await manager.broadcast({
        "type": "NEW_ORDER",
        "order_id": new_order.id,
        "is_event_order": is_event_order,
        "status": new_order.status,
        "timestamp": datetime.now().isoformat()
    })
    
    return schemas.StandardResponse(success=True, data=new_order, message="관리자 수동 주문이 성공적으로 생성되었습니다.")

@router.get("/orders/status/{order_id}", response_model=schemas.StandardResponse[schemas.OrderResponse])
def get_order_status(order_id: int, db: Session = Depends(get_db)):
    order = db.query(models.Order).filter(models.Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return schemas.StandardResponse(success=True, data=order, message="주문 상세 정보를 조회했습니다.")

@router.post("/orders/{order_id}/confirm-toss", response_model=schemas.StandardResponse)
async def confirm_toss_payment(order_id: int, db: Session = Depends(get_db)):
    """
    [토스 송금 완료 확인 API]
    사용자가 토스 앱에서 송금을 완료한 뒤 '송금 완료' 버튼을 클릭하면 호출됩니다.
    TOSS 결제 건에 한해 PENDING → PREPARING 으로 자동 전환하여
    관리자 수동 입금 승인 절차를 생략합니다.
    
    왜 자동 전환인가?
    - 교회 공동체 특성상 허위 송금 완료 가능성이 극히 낮음
    - 관리자가 필요시 주문을 취소할 수 있으므로 리스크 관리가 가능
    - 토스 결제 건마다 관리자가 수동 확인하는 것은 비효율적
    """
    order = db.query(models.Order).filter(models.Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="주문을 찾을 수 없습니다.")
    
    # 토스 결제 건만 자동 확인 허용
    if order.payment_method != schemas.PaymentMethodEnum.TOSS.value:
        raise HTTPException(status_code=400, detail="토스 송금 주문만 자동 확인이 가능합니다.")
    
    # 이미 진행된 주문은 중복 처리 방지
    if order.status != "PENDING":
        raise HTTPException(status_code=400, detail="이미 처리된 주문입니다.")
    
    order.status = "PREPARING"
    
    # 입금 확인 로그 자동 생성 (raw_data에 자동 확인 정보 기록)
    payment_log = models.PaymentLog(
        order_id=order.id,
        amount=order.total_price,
        log_type="TOSS_AUTO",
        sender_name=order.user_name_snapshot or "이름 없음",
        raw_data={"method": "TOSS", "auto_confirmed": True, "order_number": order.order_number, "payment_method": "TOSS", "note": "사용자가 송금 완료 버튼을 클릭하여 자동 확인 처리됨"}
    )
    db.add(payment_log)
    db.commit()
    db.refresh(order)
    
    # WebSocket으로 관리자에게 실시간 알림
    await manager.broadcast({
        "type": "ORDER_UPDATED",
        "order_id": order.id,
        "status": "PREPARING",
        "timestamp": datetime.now().isoformat()
    })
    
    return schemas.StandardResponse(success=True, data={"id": order.id, "status": order.status}, message="토스 송금이 확인되었습니다. 제조를 시작합니다.")


from config import settings

@router.get("/orders/vapid-key", response_model=schemas.StandardResponse[dict])
def get_vapid_key():
    """웹 푸시 구독 신청용 VAPID 퍼블릭 키를 조회합니다."""
    return schemas.StandardResponse(
        success=True,
        data={"publicKey": settings.VAPID_PUBLIC_KEY},
        message="VAPID 공개키를 조회했습니다."
    )

@router.post("/orders/{order_id}/push-subscribe", response_model=schemas.StandardResponse)
def subscribe_push(order_id: int, sub_data: schemas.PushSubscriptionCreate, db: Session = Depends(get_db)):
    """특정 주문 번호에 대해 완료 알림 수신을 위한 브라우저 푸시 구독을 등록합니다."""
    order = db.query(models.Order).filter(models.Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="주문을 찾을 수 없습니다.")
        
    subscription = sub_data.subscription
    
    # 중복 등록 방지: 엔드포인트가 이미 등록되어 있다면 해당 구독 레코드의 order_id만 업데이트
    existing = db.query(models.PushSubscription).filter(
        models.PushSubscription.endpoint == subscription.endpoint
    ).first()
    
    if existing:
        existing.order_id = order_id
        existing.p256dh = subscription.keys.p256dh
        existing.auth = subscription.keys.auth
    else:
        new_sub = models.PushSubscription(
            order_id=order_id,
            endpoint=subscription.endpoint,
            p256dh=subscription.keys.p256dh,
            auth=subscription.keys.auth
        )
        db.add(new_sub)
        
    db.commit()
    return schemas.StandardResponse(success=True, message="푸시 알림 구독이 등록되었습니다.")

