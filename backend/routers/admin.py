from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from datetime import date

import models, schemas
from database import get_db

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])

@router.get("/orders/active", response_model=List[schemas.OrderResponse])
def get_active_orders(db: Session = Depends(get_db)):
    today = date.today()
    # 진행 중인 주문 목록 조회 (취소 및 초기 대기 제외)
    orders = db.query(models.Order).filter(
        models.Order.created_at >= today,
        models.Order.status.in_(["PAID", "PREPARING", "READY"])
    ).order_by(models.Order.id.asc()).all()
    return orders

@router.patch("/orders/{order_id}/status")
def update_order_status(order_id: int, status_update: schemas.OrderStatusUpdate, db: Session = Depends(get_db)):
    order = db.query(models.Order).filter(models.Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    order.status = status_update.status
    db.commit()
    return {"message": "Status updated successfully", "status": order.status}

@router.get("/settings", response_model=schemas.SettingResponse)
def get_settings(db: Session = Depends(get_db)):
    setting = db.query(models.Setting).first()
    if not setting:
        return {"is_open": False, "notice": None}
    return setting

@router.patch("/settings")
def update_settings(setting_update: schemas.SettingUpdate, db: Session = Depends(get_db)):
    setting = db.query(models.Setting).first()
    if not setting:
        setting = models.Setting(is_open=setting_update.is_open or False, notice=setting_update.notice)
        db.add(setting)
    else:
        if setting_update.is_open is not None:
            setting.is_open = setting_update.is_open
        if setting_update.notice is not None:
            setting.notice = setting_update.notice
    db.commit()
    return {"message": "Settings updated successfully"}
