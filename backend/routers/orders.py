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
        
        # [중요] 이벤트 모드(DB 확인 또는 요청 기반)가 아닐 때만 금액 미달 검증 수행
        if not is_event_mode and item_total < base_total:
            raise HTTPException(
                status_code=400, 
                detail=f"'{menu.name}' 메뉴의 금액이 기본가({base_total}원)보다 낮게 요청되었습니다."
            )
            
        # [중요] 이벤트 모드라도 통계(TOP 5)를 위해 개별 아이템의 원래 가치는 보존
        calculated_total += item_total
        order_items_prepared.append({
            "menu_id": item.menu_id,
            "menu_name_snapshot": menu.name,
            "menu_price_snapshot": menu.price,
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

@router.get("/orders/status/{order_id}", response_model=schemas.StandardResponse[schemas.OrderResponse])
def get_order_status(order_id: int, db: Session = Depends(get_db)):
    order = db.query(models.Order).filter(models.Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return schemas.StandardResponse(success=True, data=order, message="주문 상세 정보를 조회했습니다.")
