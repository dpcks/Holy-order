from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from datetime import datetime, date

import models, schemas
from database import get_db

router = APIRouter(prefix="/api/v1", tags=["orders"])

from websocket import manager

@router.post("/orders", response_model=schemas.StandardResponse[schemas.OrderResponse])
async def create_order(order: schemas.OrderCreate, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.id == order.user_id, models.User.is_active == True).first()
    if not user:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없거나 활성화되지 않았습니다.")
        
    # 0. 영업 상태 확인
    setting = db.query(models.Setting).first()
    if setting and not setting.is_open:
        raise HTTPException(status_code=403, detail="현재 영업 시간이 아닙니다. 주문을 생성할 수 없습니다.")
        
    # 1. 활성 이벤트(골든벨) 모드 확인 (시간 범위 포함)
    from sqlalchemy import or_
    now = models.get_seoul_time().replace(tzinfo=None)
    active_event = db.query(models.Announcement).filter(
        models.Announcement.is_active == True,
        models.Announcement.is_event_mode == True,
        or_(models.Announcement.starts_at == None, models.Announcement.starts_at <= now),
        or_(models.Announcement.ends_at == None, models.Announcement.ends_at >= now)
    ).first()

    # 2. 이벤트 주문 여부 판단 (DB 조회 결과 또는 요청 데이터를 모두 고려)
    # 프론트엔드에서 결제 수단을 FREE로 보냈거나 총액을 0으로 보냈다면 이벤트 주문으로 간주
    is_event_request = (order.payment_method == schemas.PaymentMethodEnum.FREE or order.total_price == 0)
    is_event_mode = active_event is not None or is_event_request

    # 3. 메뉴 데이터 일괄 조회 및 금액 검증
    menu_ids = [item.menu_id for item in order.items]
    menus = db.query(models.Menu).filter(models.Menu.id.in_(menu_ids)).all()
    menu_dict = {m.id: m for m in menus}
    
    calculated_total = 0
    order_items_prepared = []
    
    for item in order.items:
        menu = menu_dict.get(item.menu_id)
        if not menu:
            raise HTTPException(status_code=400, detail=f"존재하지 않는 메뉴(ID: {item.menu_id})가 포함되어 있습니다.")
        
        if not menu.is_available:
            raise HTTPException(status_code=400, detail=f"'{menu.name}' 메뉴는 현재 품절입니다.")
        
        base_total = menu.price * item.quantity
        item_total = item.sub_total
        
        # 텀블러 할인이 적용된 경우 허용 최소 금액 = 기본가 - (tumbler_discount × 수량)
        # max(0, ...)로 음수 방지
        allowed_discount = item.tumbler_discount * item.quantity
        min_allowed_total = max(0, base_total - allowed_discount)
        
        # [중요] 이벤트 모드가 아닐 때만 금액 미달 검증 수행
        if not is_event_mode and item_total < min_allowed_total:
            raise HTTPException(
                status_code=400, 
                detail=f"'{menu.name}' 메뉴의 금액이 허용 최소가({min_allowed_total}원)보다 낮게 요청되었습니다."
            )
            
        # [중요] 이벤트 모드라도 통계(TOP 5)를 위해 개별 아이템의 원래 가치는 보존
        calculated_total += item_total
        order_items_prepared.append({
            "menu_id": item.menu_id,
            "menu_name_snapshot": menu.name,
            "menu_price_snapshot": menu.price,
            "menu_image_url_snapshot": menu.image_url,
            "quantity": item.quantity,
            "options_text": item.options_text,
            "sub_total": item_total  # 이벤트 모드라도 프론트에서 넘어온 원래 금액을 저장
        })

    is_event_order = False
    if is_event_mode:
        # 이벤트 모드: 원래 금액을 보관하고 실제 결제는 0원
        is_event_order = True
        final_price = 0
        # 정산용 원래 가격 계산 (계산된 값이 0이면 메뉴가를 기준으로 합산)
        original_price = calculated_total if calculated_total > 0 else sum(m.price * i.quantity for i, m in [(item, menu_dict[item.menu_id]) for item in order.items])
        announcement_id = active_event.id if active_event else None
        payment_method = "FREE"
    else:
        # 일반 모드: 기존 금액 검증 로직 유지
        if calculated_total != order.total_price:
            raise HTTPException(
                status_code=400, 
                detail=f"결제 금액이 올바르지 않습니다. (요청: {order.total_price}, 실제: {calculated_total})"
            )
        final_price = calculated_total
        original_price = None
        announcement_id = None
        payment_method = order.payment_method.value

    # 3. 당일 주문 번호 계산
    today = models.get_seoul_time().date()
    last_order = db.query(models.Order)\
        .filter(models.Order.order_date == today)\
        .order_by(models.Order.order_number.desc())\
        .first()
    next_order_number = 1 if not last_order else (last_order.order_number or 0) + 1

    # 4. 주문 및 상세 내역 저장
    new_order = models.Order(
        user_id=order.user_id,
        user_duty_snapshot=user.duty,
        user_name_snapshot=user.name,
        user_phone_snapshot=user.phone,
        request=order.request,
        total_price=final_price,
        original_price=original_price,
        announcement_id=announcement_id,
        payment_method=payment_method,
        status=schemas.OrderStatusEnum.PENDING.value,
        order_number=next_order_number,
        order_date=today
    )
    
    try:
        db.add(new_order)
        db.flush() # ID 생성을 위해 flush
        
        for item_data in order_items_prepared:
            order_item = models.OrderItem(
                order_id=new_order.id,
                **item_data
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
    
    # 실시간 알림 전송 (새 주문 전용 타입 NEW_ORDER 사용)
    await manager.broadcast({
        "type": "NEW_ORDER",
        "order_id": new_order.id,
        "is_event_order": is_event_order,
        "announcement_id": announcement_id,
        "status": new_order.status,
        "timestamp": datetime.now().isoformat()
    })
    
    return schemas.StandardResponse(success=True, data=new_order, message="주문이 성공적으로 생성되었습니다.")

@router.post("/orders/admin", response_model=schemas.StandardResponse[schemas.OrderResponse])
async def create_admin_order(order: schemas.AdminOrderCreate, db: Session = Depends(get_db)):
    menu_ids = [item.menu_id for item in order.items]
    menus = db.query(models.Menu).filter(models.Menu.id.in_(menu_ids)).all()
    menu_dict = {m.id: m for m in menus}
    
    active_event = db.query(models.Announcement)\
        .filter(models.Announcement.is_active == True, models.Announcement.is_event_mode == True)\
        .first()
    is_event_mode = active_event is not None
    is_free_order = (order.payment_method in [schemas.PaymentMethodEnum.FREE, schemas.PaymentMethodEnum.VOLUNTEER])

    calculated_total = 0
    order_items_prepared = []
    
    for item in order.items:
        menu = menu_dict.get(item.menu_id)
        if not menu:
            raise HTTPException(status_code=400, detail=f"존재하지 않는 메뉴(ID: {item.menu_id})가 포함되어 있습니다.")
            
        base_total = menu.price * item.quantity
        item_total = item.sub_total
        allowed_discount = item.tumbler_discount * item.quantity
        min_allowed_total = max(0, base_total - allowed_discount)
        
        # 이벤트 모드나 관리자 수동 무료 주문이 아닌 경우에만 금액 검증 수행
        if not is_event_mode and not is_free_order:
            if item_total < min_allowed_total:
                raise HTTPException(
                    status_code=400, 
                    detail=f"'{menu.name}' 메뉴의 금액이 허용 최소가({min_allowed_total}원)보다 낮게 요청되었습니다."
                )
            
        calculated_total += item_total
        order_items_prepared.append({
            "menu_id": item.menu_id,
            "menu_name_snapshot": menu.name,
            "menu_price_snapshot": menu.price,
            "menu_image_url_snapshot": menu.image_url,
            "quantity": item.quantity,
            "options_text": item.options_text,
            "sub_total": item_total
        })

    is_event_order = False
    if is_event_mode:
        is_event_order = True
        final_price = 0
        original_price = order.total_price # 이벤트 모드일 때는 요청받은 원래 합계를 보존
        announcement_id = active_event.id
        payment_method = "FREE"
    elif is_free_order:
        # 관리자가 수동으로 무료(사역자 등) 처리한 경우
        final_price = 0
        original_price = order.total_price # 프론트에서 보낸 원래의 합계 금액
        announcement_id = None
        payment_method = order.payment_method.value
    else:
        if calculated_total != order.total_price:
            raise HTTPException(
                status_code=400, 
                detail=f"결제 금액이 올바르지 않습니다. (요청: {order.total_price}, 실제: {calculated_total})"
            )
        final_price = calculated_total
        original_price = None
        announcement_id = None
        payment_method = order.payment_method.value

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
        total_price=final_price,
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
        
        for item_data in order_items_prepared:
            order_item = models.OrderItem(order_id=new_order.id, **item_data)
            db.add(order_item)
            
        if not is_event_mode and order.status in ["PREPARING", "COMPLETED"] and order.payment_method in [schemas.PaymentMethodEnum.CASH, schemas.PaymentMethodEnum.BANK_TRANSFER]:
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
