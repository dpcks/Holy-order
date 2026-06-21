import sys
sys.path.append('.')

from database import SessionLocal
import models
from datetime import datetime, timedelta
import random

db = SessionLocal()

# 우리가 직접 옵션을 제어하여 요약이 잘 되는지 테스트하기 위해 특정 메뉴를 선택
TARGET_MENUS = ['아메리카노', '카페라떼', '바닐라라떼', '딸기스무디']

try:
    menus = db.query(models.Menu).filter(models.Menu.is_available == True).all()
    if not menus:
        print("❌ 사용 가능한 메뉴가 없습니다.")
        sys.exit(1)

    print("\n🚀 제조 중(PREPARING) 10건 삽입 시작...")

    for i in range(10):
        menu = random.choice(menus)
        qty = random.randint(1, 3)
        total = menu.price * qty

        # 요약 기능(옵션 구분)을 테스트하기 위해 옵션 임의 할당
        options_list = ["ICE", "HOT", "ICE / 샷 추가", "HOT / 텀블러"]
        selected_option = random.choice(options_list)

        created_time = datetime.now() - timedelta(minutes=random.randint(1, 20))
        today = datetime.now().date()
        
        last_order = db.query(models.Order).filter(models.Order.order_date == today).order_by(models.Order.order_number.desc()).first()
        order_num = (last_order.order_number + 1) if last_order else 1
        
        order = models.Order(
            user_id=None,
            user_name_snapshot=f"제조요약테스트_{i+1}",
            user_duty_snapshot="테스터",
            user_phone_snapshot="010-1111-2222",
            order_number=order_num,
            order_date=today,
            total_price=total,
            original_price=total,
            payment_method="BANK_TRANSFER",
            status="PREPARING", # 제조 중 상태로 강제 배정
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
    print("✅ 제조 중(PREPARING) 10건 삽입 완료! 프론트엔드에서 확인해보세요.")

except Exception as e:
    db.rollback()
    print(f"❌ 에러 발생: {e}")
finally:
    db.close()
