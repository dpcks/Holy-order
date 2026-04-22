from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List
from datetime import date, datetime

import models, schemas
from database import get_db

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])


# ────────────────────────────────────────
# 주문 관리 (Order Management)
# ────────────────────────────────────────

@router.get("/orders/board", response_model=schemas.StandardResponse[List[schemas.OrderResponse]])
def get_orders_board(db: Session = Depends(get_db)):
    """칸반 보드용: 오늘 PENDING/PREPARING/READY 주문 전체 조회"""
    today = models.get_seoul_time().date()
    orders = db.query(models.Order).filter(
        models.Order.order_date == today,
        models.Order.status.in_(["PENDING", "PREPARING", "READY"])
    ).order_by(models.Order.id.asc()).all()
    return schemas.StandardResponse(success=True, data=orders, message="주문 현황을 조회했습니다.")


from typing import List, Optional

@router.get("/orders/history", response_model=schemas.StandardResponse[List[schemas.OrderResponse]])
def get_orders_history(
    page: int = 1, 
    limit: int = 20, 
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """주문 내역 히스토리: 필터링 및 페이징 지원"""
    query = db.query(models.Order)
    
    if start_date:
        query = query.filter(models.Order.order_date >= start_date)
    if end_date:
        query = query.filter(models.Order.order_date <= end_date)
    if status:
        query = query.filter(models.Order.status == status)
        
    offset = (page - 1) * limit
    orders = query.order_by(models.Order.id.desc()).offset(offset).limit(limit).all()
    return schemas.StandardResponse(success=True, data=orders, message="주문 내역을 조회했습니다.")



from websocket import manager

@router.patch("/orders/{order_id}/status")
async def update_order_status(order_id: int, status_update: schemas.OrderStatusUpdate, db: Session = Depends(get_db)):
    """주문 상태 변경 (입금승인, 준비완료, 수령완료, 취소)"""
    order = db.query(models.Order).filter(models.Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="주문을 찾을 수 없습니다.")
    
    # 입금 승인 시 (PENDING → PREPARING) PaymentLog 기록
    # 주문 상태 변경과 로그 생성을 단일 트랜잭션으로 처리하여 데이터 일관성 보장
    if order.status == "PENDING" and status_update.status == schemas.OrderStatusEnum.PREPARING:
        log = models.PaymentLog(
            order_id=order_id,
            log_type="APPROVED",
            amount=order.total_price,
            sender_name=order.user_name_snapshot,
            # 추후 정산을 위해 승인 당시의 주문 원본 데이터를 JSON으로 함께 저장
            raw_data={
                "order_number": order.order_number,
                "payment_method": order.payment_method,
                "user_duty": order.user_duty_snapshot,
                "item_count": len(order.items),
            }
        )
        db.add(log)
    
    order.status = status_update.status.value
    db.commit()
    
    # 실시간 알림 전송 (JSON 구조화)
    await manager.broadcast({
        "type": "ORDER_UPDATED",
        "order_id": order_id,
        "status": order.status,
        "timestamp": datetime.now().isoformat()
    })
    
    return {"success": True, "data": {"status": order.status}, "message": "상태가 변경되었습니다."}


# ────────────────────────────────────────
# 메뉴 관리 (Menu Management)
# ────────────────────────────────────────

@router.patch("/menus/{menu_id}")
async def update_menu(menu_id: int, menu_data: schemas.MenuUpdate, db: Session = Depends(get_db)):
    """메뉴 정보 수정 (이름, 가격, 설명, 카테고리, 판매여부)"""
    menu = db.query(models.Menu).filter(models.Menu.id == menu_id).first()
    if not menu:
        raise HTTPException(status_code=404, detail="메뉴를 찾을 수 없습니다.")
    for field, value in menu_data.model_dump(exclude_none=True).items():
        setattr(menu, field, value)
    db.commit()
    db.refresh(menu)
    
    # 메뉴 변경 알림 전송 (JSON 구조화)
    await manager.broadcast({
        "type": "MENU_UPDATED",
        "menu_id": menu_id,
        "timestamp": datetime.now().isoformat()
    })
    
    return {"success": True, "data": None, "message": "메뉴가 수정되었습니다."}


# ────────────────────────────────────────
# 설정 관리 (Settings)
# ────────────────────────────────────────

@router.get("/settings", response_model=schemas.StandardResponse[schemas.SettingResponse])
def get_settings(db: Session = Depends(get_db)):
    setting = db.query(models.Setting).first()
    if not setting:
        return schemas.StandardResponse(success=False, data=None, message="설정이 없습니다.")
    return schemas.StandardResponse(success=True, data=setting, message="설정을 불러왔습니다.")


@router.patch("/settings")
def update_settings(setting_update: schemas.SettingUpdate, db: Session = Depends(get_db)):
    setting = db.query(models.Setting).first()
    if not setting:
        setting = models.Setting()
        db.add(setting)
    for field, value in setting_update.model_dump(exclude_none=True).items():
        setattr(setting, field, value)
    db.commit()
    return {"success": True, "data": None, "message": "설정이 저장되었습니다."}


# ────────────────────────────────────────
# 통계 (Statistics)
# ────────────────────────────────────────

@router.get("/stats/today")
def get_today_stats(db: Session = Depends(get_db)):
    """오늘의 매출/주문 통계 집계"""
    today = models.get_seoul_time().date()

    # 오늘 전체 주문
    all_orders = db.query(models.Order).filter(models.Order.order_date == today).all()

    total_orders = len(all_orders)
    # 매출: 취소 제외한 금액 합산
    revenue_orders = [o for o in all_orders if o.status not in ["PENDING", "CANCELLED"]]
    total_sales = sum(o.total_price for o in revenue_orders)
    avg_order_value = round(total_sales / len(revenue_orders)) if revenue_orders else 0

    # 상태별 카운트
    status_counts = {}
    for o in all_orders:
        status_counts[o.status] = status_counts.get(o.status, 0) + 1

    # 인기 메뉴 TOP 5 (order_items 기반)
    top_menus_raw = (
        db.query(
            models.OrderItem.menu_name_snapshot,
            func.sum(models.OrderItem.quantity).label("total_qty"),
            func.sum(models.OrderItem.sub_total).label("total_revenue"),
        )
        .join(models.Order, models.Order.id == models.OrderItem.order_id)
        .filter(
            models.Order.order_date == today,
            models.Order.status.notin_(["CANCELLED"])
        )
        .group_by(models.OrderItem.menu_name_snapshot)
        .order_by(func.sum(models.OrderItem.quantity).desc())
        .limit(5)
        .all()
    )
    top_menus = [
        {"name": r.menu_name_snapshot, "count": int(r.total_qty), "revenue": int(r.total_revenue)}
        for r in top_menus_raw
    ]

    # 직분별 이용 현황
    duty_counts_raw = (
        db.query(models.Order.user_duty_snapshot, func.count(models.Order.id).label("cnt"))
        .filter(models.Order.order_date == today, models.Order.status.notin_(["CANCELLED"]))
        .group_by(models.Order.user_duty_snapshot)
        .all()
    )
    duty_breakdown = {r.user_duty_snapshot: r.cnt for r in duty_counts_raw}

    # 시간대별 주문 현황
    hourly_raw = (
        db.query(func.extract("hour", models.Order.created_at).label("hour"), func.count(models.Order.id))
        .filter(models.Order.order_date == today)
        .group_by(func.extract("hour", models.Order.created_at))
        .all()
    )
    hourly_orders = {int(r.hour): r[1] for r in hourly_raw}

    return {
        "success": True,
        "data": {
            "total_orders": total_orders,
            "total_sales": total_sales,
            "avg_order_value": avg_order_value,
            "top_menu": top_menus[0]["name"] if top_menus else None,
            "status_counts": status_counts,
            "top_menus": top_menus,
            "duty_breakdown": duty_breakdown,
            "hourly_orders": hourly_orders,
        },
        "message": "통계를 조회했습니다.",
    }
