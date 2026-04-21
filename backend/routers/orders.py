from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime, date

import models, schemas
from database import get_db

router = APIRouter(prefix="/api/v1", tags=["orders"])

from websocket import manager

@router.post("/orders", response_model=schemas.StandardResponse[schemas.OrderResponse])
async def create_order(order: schemas.OrderCreate, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.id == order.user_id, models.User.is_active == True).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found or inactive")
        
    # 당일 주문 번호 계산 (간단한 구현)
    today = models.get_seoul_time().date()
    last_order = db.query(models.Order).filter(models.Order.order_date == today).order_by(models.Order.id.desc()).first()
    next_order_number = 1 if not last_order else (last_order.order_number or 0) + 1

    new_order = models.Order(
        user_id=order.user_id,
        user_duty_snapshot=user.duty,
        user_name_snapshot=user.name,
        total_price=order.total_price,
        payment_method=order.payment_method.value,
        status=schemas.OrderStatusEnum.PENDING.value,
        order_number=next_order_number,
        order_date=today
    )
    db.add(new_order)
    db.flush() # 아이디를 얻기 위해 flush
    
    for item in order.items:
        menu = db.query(models.Menu).filter(models.Menu.id == item.menu_id).first()
        if not menu:
            continue
        order_item = models.OrderItem(
            order_id=new_order.id,
            menu_id=item.menu_id,
            menu_name_snapshot=menu.name,
            menu_price_snapshot=menu.price,
            quantity=item.quantity,
            options_text=item.options_text,
            sub_total=item.sub_total
        )
        db.add(order_item)
        
    db.commit()
    db.refresh(new_order)
    
    # 실시간 알림 전송
    await manager.broadcast("ORDER_UPDATED")
    
    return schemas.StandardResponse(success=True, data=new_order, message="주문이 성공적으로 생성되었습니다.")

@router.get("/orders/status/{order_id}", response_model=schemas.StandardResponse[schemas.OrderResponse])
def get_order_status(order_id: int, db: Session = Depends(get_db)):
    order = db.query(models.Order).filter(models.Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return schemas.StandardResponse(success=True, data=order, message="주문 상세 정보를 조회했습니다.")

@router.post("/payments/bank-transfer")
def bank_transfer_callback(payment: schemas.PaymentLogCreate, db: Session = Depends(get_db)):
    order = db.query(models.Order).filter(models.Order.id == payment.order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
        
    # 로그 남기기
    log = models.PaymentLog(
        order_id=payment.order_id,
        log_type="REQUEST",
        amount=payment.amount,
        sender_name=payment.sender_name
    )
    db.add(log)
    
    # 상태 업데이트
    order.status = schemas.OrderStatusEnum.PAID.value
    db.commit()
    return {"success": True, "data": None, "message": "Payment logged successfully"}
