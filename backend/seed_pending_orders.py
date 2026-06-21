import sys
sys.path.append('.')

from database import SessionLocal
import models
from datetime import datetime, timedelta
import random

db = SessionLocal()

MENU_NAMES = ['아메리카노', '카페라떼', '바닐라라떼', '카푸치노', '에스프레소', '레몬에이드', '딸기주스', '녹차라떼']
DUTY_LIST = ['학생', '청년', '성도', '집사', '안수집사', '권사', '장로', '목사']
NAME_LIST = ['테스트입금', '현금확인', '계좌이체테스트', '펜딩테스트', '승인대기', '빠른승인바람', '현금결제자']
METHODS = ['BANK_TRANSFER', 'CASH']
STATUS = 'PENDING'

try:
    menus = db.query(models.Menu).filter(models.Menu.is_available == True).all()
    if not menus:
        print("❌ 사용 가능한 메뉴가 없습니다.")
        sys.exit(1)

    print("\n🚀 입금 확인대기(PENDING) 7건 삽입 시작...")

    for i in range(7):
        menu = random.choice(menus)
        name = NAME_LIST[i]
        duty = random.choice(DUTY_LIST)
        method = random.choice(METHODS)
        qty = random.randint(1, 4)
        total = menu.price * qty

        # 현재 시간 기준으로 0~15분 전
        created_time = datetime.now() - timedelta(minutes=random.randint(0, 15))
        
        # order_number는 오늘 중 가장 큰 값 + 1
        today = datetime.now().date()
        last_order = db.query(models.Order).filter(models.Order.order_date == today).order_by(models.Order.order_number.desc()).first()
        order_num = (last_order.order_number + 1) if last_order else 1
        
        order = models.Order(
            user_id=None,
            user_name_snapshot=name,
            user_duty_snapshot=duty,
            user_phone_snapshot=f"010-{random.randint(1000,9999)}-{random.randint(1000,9999)}",
            order_number=order_num,
            order_date=today,
            total_price=total,
            original_price=total,
            payment_method=method,
            status=STATUS,
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
            options_text="ICE" if random.random() > 0.5 else "HOT"
        )
        db.add(item)

    db.commit()
    print("✅ 입금 확인대기(PENDING) 7건 삽입 완료!")

except Exception as e:
    db.rollback()
    print(f"❌ 에러 발생: {e}")
finally:
    db.close()
