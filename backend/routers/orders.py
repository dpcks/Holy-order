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
        
    # 1. 메뉴 데이터 일괄 조회 및 금액 검증 (보안 및 성능 최적화)
    menu_ids = [item.menu_id for item in order.items]
    menus = db.query(models.Menu).filter(models.Menu.id.in_(menu_ids)).all()
    menu_dict = {m.id: m for m in menus}
    
    calculated_total = 0
    order_items_prepared = []
    
    for item in order.items:
        menu = menu_dict.get(item.menu_id)
        if not menu:
            raise HTTPException(status_code=400, detail=f"존재하지 않는 메뉴(ID: {item.menu_id})가 포함되어 있습니다.")
        
        item_total = menu.price * item.quantity
        calculated_total += item_total
        
        # OrderItem 생성을 위한 데이터 준비
        order_items_prepared.append({
            "menu_id": item.menu_id,
            "menu_name_snapshot": menu.name,
            "menu_price_snapshot": menu.price,
            "quantity": item.quantity,
            "options_text": item.options_text,
            "sub_total": item_total
        })

    if calculated_total != order.total_price:
        raise HTTPException(
            status_code=400, 
            detail=f"결제 금액이 올바르지 않습니다. (요청: {order.total_price}, 실제: {calculated_total})"
        )

    # 2. 당일 주문 번호 계산
    today = models.get_seoul_time().date()
    last_order = db.query(models.Order)\
        .filter(models.Order.order_date == today)\
        .order_by(models.Order.order_number.desc())\
        .first()
    next_order_number = 1 if not last_order else (last_order.order_number or 0) + 1

    # 3. 주문 및 상세 내역 저장
    new_order = models.Order(
        user_id=order.user_id,
        user_duty_snapshot=user.duty,
        user_name_snapshot=user.name,
        user_phone_snapshot=user.phone,
        request=order.request,
        total_price=calculated_total, # 검증된 금액 저장
        payment_method=order.payment_method.value,
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
