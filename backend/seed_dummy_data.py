"""
더미 데이터 삽입 스크립트 - 페이지네이션 테스트용
로컬 DB에 주문 100건 + 입금 로그 100건을 생성합니다.
실행: python seed_dummy_data.py
"""
import sys
sys.path.append('.')

from database import SessionLocal
import models
from datetime import datetime, timedelta
import random

db = SessionLocal()

MENU_NAMES = ['아메리카노', '카페라떼', '바닐라라떼', '카푸치노', '에스프레소', '레몬에이드', '딸기주스', '녹차라떼']
DUTY_LIST = ['성도', '집사', '권사', '장로', '목사']
NAME_LIST = ['김철수', '이영희', '박민준', '최서연', '정다은', '한지민', '윤성호', '조혜린', '임재원', '강수진']
METHODS = ['BANK_TRANSFER', 'CASH', 'TOSS']
STATUSES = ['PENDING', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED']

try:
    # 첫 번째 메뉴가 있는지 확인
    menu = db.query(models.Menu).filter(models.Menu.is_available == True).first()
    if not menu:
        print("❌ 사용 가능한 메뉴가 없습니다. 먼저 메뉴를 등록해주세요.")
        sys.exit(1)

    # 첫 번째 유저 확인 (없으면 None으로 진행)
    user = db.query(models.User).first()

    print(f"✅ 메뉴 확인: {menu.name} (ID: {menu.id})")
    print(f"✅ 유저 확인: {user.id if user else '없음 (현장주문으로 처리)'}")

    # 기존 더미 데이터 확인
    existing = db.query(models.Order).filter(models.Order.user_name_snapshot.like('더미_%')).count()
    print(f"📊 기존 더미 데이터: {existing}건")

    DUMMY_COUNT = 100
    print(f"\n🚀 더미 주문 {DUMMY_COUNT}건 삽입 시작...")

    created_orders = []
    for i in range(DUMMY_COUNT):
        name = f"더미_{random.choice(NAME_LIST)}_{i+1}"
        duty = random.choice(DUTY_LIST)
        method = random.choice(METHODS)
        status = random.choice(STATUSES)
        qty = random.randint(1, 3)
        total = menu.price * qty
        # 각 주문은 서로 다른 날짜에 배치하여 (order_number, order_date) 유니크 제약 충돌 방지
        # i번째 주문 = i일 전, order_number = 9000+i (실제 운영 번호와 겹치지 않는 큰 값)
        days_ago = i  # 각 주문을 서로 다른 날짜에 배치
        created_time = datetime.now() - timedelta(days=days_ago)
        order_num = 9000 + i  # 9000번대 고유 번호

        order = models.Order(
            user_id=user.id if (user and random.random() > 0.4) else None,
            user_name_snapshot=name,
            user_duty_snapshot=duty,
            user_phone_snapshot=f"010-{random.randint(1000,9999)}-{random.randint(1000,9999)}",
            order_number=order_num,
            order_date=created_time.date(),
            total_price=total,
            original_price=total,
            payment_method=method,
            status=status,
            is_active=True,
        )
        db.add(order)
        db.flush()  # ID를 얻기 위해 flush

        # 주문 아이템 추가
        item = models.OrderItem(
            order_id=order.id,
            menu_id=menu.id,
            menu_name_snapshot=menu.name,
            menu_price_snapshot=menu.price,
            quantity=qty,
            sub_total=total,
        )
        db.add(item)

        # 입금 로그 추가 (COMPLETED 상태인 경우)
        if status in ('COMPLETED', 'PREPARING', 'READY'):
            log = models.PaymentLog(
                order_id=order.id,
                log_type='APPROVED' if user else 'CALLBACK',
                amount=total,
                sender_name=name,
                raw_data={"method": method, "dummy": True}
            )
            db.add(log)

        created_orders.append(order)

    db.commit()
    print(f"✅ 더미 주문 {DUMMY_COUNT}건 삽입 완료!")

    # 최종 카운트
    total_orders = db.query(models.Order).count()
    total_logs = db.query(models.PaymentLog).count()
    print(f"\n📊 현재 DB 상태:")
    print(f"  - 전체 주문: {total_orders}건")
    print(f"  - 전체 입금 로그: {total_logs}건")
    print(f"\n이제 관리자 화면에서 페이지네이션을 테스트해보세요!")

except Exception as e:
    db.rollback()
    print(f"❌ 오류 발생: {e}")
    raise
finally:
    db.close()
