from database import SessionLocal
import models
from datetime import timedelta

def update_order_times():
    db = SessionLocal()
    try:
        orders = db.query(models.Order).all()
        for order in orders:
            # 기존 시간이 UTC(9시간 전)로 저장되어 있다면 9시간 더해주기
            # 만약 이미 수정된 이후의 데이터라면 중복 더하기가 될 수 있으므로 주의
            # 여기서는 오늘(4월 21일) 데이터 중 시간이 너무 이른 것들만 보정
            if order.created_at and order.created_at.hour < 15: # 오전/오후 3시 이전 데이터는 보정 대상
                order.created_at += timedelta(hours=9)
                order.updated_at += timedelta(hours=9)
        db.commit()
        print(f"Updated {len(orders)} orders.")
    except Exception as e:
        print(f"Error: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    update_order_times()
