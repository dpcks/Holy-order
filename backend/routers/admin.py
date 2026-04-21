from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from datetime import date

import models, schemas
from database import get_db

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])

@router.get("/orders/active", response_model=schemas.StandardResponse[List[schemas.OrderResponse]])
def get_active_orders(db: Session = Depends(get_db)):
    today = date.today()
    # 진행 중인 주문 목록 조회 (취소 및 초기 대기 제외)
    orders = db.query(models.Order).filter(
        models.Order.order_date == today,
        models.Order.status.in_(["PAID", "PREPARING", "READY"])
    ).order_by(models.Order.id.asc()).all()
    return schemas.StandardResponse(success=True, data=orders, message="진행 중인 주문을 조회했습니다.")

@router.patch("/orders/{order_id}/status")
def update_order_status(order_id: int, status_update: schemas.OrderStatusUpdate, db: Session = Depends(get_db)):
    order = db.query(models.Order).filter(models.Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    order.status = status_update.status.value
    db.commit()
    return {"success": True, "data": {"status": order.status}, "message": "Status updated successfully"}

@router.get("/settings", response_model=schemas.StandardResponse[schemas.SettingResponse])
def get_settings(db: Session = Depends(get_db)):
    setting = db.query(models.Setting).first()
    if not setting:
        return schemas.StandardResponse(success=True, data={"is_open": False, "notice": None, "open_time": None, "close_time": None}, message="기본 설정값입니다.")
    return schemas.StandardResponse(success=True, data=setting, message="설정을 불러왔습니다.")

@router.patch("/settings")
def update_settings(setting_update: schemas.SettingUpdate, db: Session = Depends(get_db)):
    setting = db.query(models.Setting).first()
    if not setting:
        setting = models.Setting(
            is_open=setting_update.is_open or False, 
            notice=setting_update.notice,
            open_time=setting_update.open_time,
            close_time=setting_update.close_time
        )
        db.add(setting)
    else:
        if setting_update.is_open is not None:
            setting.is_open = setting_update.is_open
        if setting_update.notice is not None:
            setting.notice = setting_update.notice
        if setting_update.open_time is not None:
            setting.open_time = setting_update.open_time
        if setting_update.close_time is not None:
            setting.close_time = setting_update.close_time
    db.commit()
    return {"success": True, "data": None, "message": "Settings updated successfully"}
