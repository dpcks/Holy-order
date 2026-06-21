import sys
sys.path.append('.')

from database import SessionLocal
import models
from datetime import datetime, timedelta
import random

db = SessionLocal()

try:
    # 1. 기존 PREPARING 상태의 모든 주문 삭제 (초기화)
    # 외래키 제약조건이 있으므로 OrderItem 먼저 삭제 후 Order 삭제
    preparing_orders = db.query(models.Order).filter(models.Order.status == 'PREPARING').all()
    preparing_order_ids = [o.id for o in preparing_orders]
    
    if preparing_order_ids:
        db.query(models.OrderItem).filter(models.OrderItem.order_id.in_(preparing_order_ids)).delete(synchronize_session=False)
        db.query(models.PaymentLog).filter(models.PaymentLog.order_id.in_(preparing_order_ids)).delete(synchronize_session=False)
        db.query(models.Order).filter(models.Order.id.in_(preparing_order_ids)).delete(synchronize_session=False)
        print(f"🗑️ 기존 제조 중(PREPARING) 주문 {len(preparing_order_ids)}건 삭제 완료")

    # 2. 정확히 3개의 새로운 PREPARING 주문 생성
    menus = db.query(models.Menu).filter(models.Menu.is_available == True).all()
    if not menus:
        print("❌ 사용 가능한 메뉴가 없습니다.")
        sys.exit(1)

    print("\n🚀 제조 중(PREPARING) 딱 3건 삽입 시작...")

    for i in range(3):
        menu = random.choice(menus)
        qty = random.randint(1, 2)
        total = menu.price * qty

        options_list = ["ICE", "HOT"]
        selected_option = random.choice(options_list)

        created_time = datetime.now() - timedelta(minutes=random.randint(1, 10))
        today = datetime.now().date()
        
        last_order = db.query(models.Order).filter(models.Order.order_date == today).order_by(models.Order.order_number.desc()).first()
        order_num = (last_order.order_number + 1) if last_order else 1
        
        order = models.Order(
            user_id=None,
            user_name_snapshot=f"3건테스트_{i+1}",
            user_duty_snapshot="성도",
            user_phone_snapshot="010-3333-4444",
            order_number=order_num,
            order_date=today,
            total_price=total,
            original_price=total,
            payment_method="BANK_TRANSFER",
            status="PREPARING",
            is_active=True,
            created_at=created_time,
            updated_at=created_time
        )
        db.add(order)
        db.flush()

        item = models.OrderItem(
            order_id=order.id,
            menu_id=menu.id,
            menu_name_snapshot=menu.name,
            menu_price_snapshot=menu.price,
            quantity=qty,
            sub_total=total,
            options_text=selected_option
        )
        db.add(item)

    db.commit()
    print("✅ 제조 중(PREPARING) 3건 삽입 완료! 이제 버튼이 노출되어야 합니다.")

except Exception as e:
    db.rollback()
    print(f"❌ 에러 발생: {e}")
finally:
    db.close()
