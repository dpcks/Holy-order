"""
이벤트(골든벨) 더미 데이터 삽입 스크립트 - 섬김 통계 테스트용
오늘 날짜에 FREE/VOLUNTEER 주문 20건을 생성합니다.
실행: venv/bin/python3 seed_event_data.py
"""
import sys
sys.path.append('.')

from database import SessionLocal
import models
from datetime import datetime, date

db = SessionLocal()

MENU_NAMES_SAMPLE = ['아메리카노', '카페라떼', '바닐라라떼']
NAME_LIST = ['김집사', '이권사', '박성도', '최장로', '정집사', '한성도', '윤목사', '조사모']

try:
    # 메뉴 확인
    menus = db.query(models.Menu).filter(models.Menu.is_available == True).limit(3).all()
    if not menus:
        print("❌ 사용 가능한 메뉴가 없습니다.")
        sys.exit(1)

    menu = menus[0]
    menu2 = menus[1] if len(menus) > 1 else menus[0]
    today = date.today()
    
    print(f"📅 기준 날짜: {today}")
    print(f"🍵 메뉴: {menu.name}(₩{menu.price}), {menu2.name}(₩{menu2.price})")

    # 이벤트 공지 확인 (있으면 연결)
    event = db.query(models.Announcement).filter(
        models.Announcement.is_event_mode == True
    ).first()
    announcement_id = event.id if event else None
    print(f"🎉 이벤트: {event.title if event else '없음 (연결 없이 생성)'}")

    created_count = 0
    base_order_num = 8000  # 충돌 방지용 큰 번호

    # FREE(사역자) 주문 10건
    for i in range(10):
        qty = (i % 2) + 1
        m = menu if i % 2 == 0 else menu2
        original = m.price * qty
        order_num = base_order_num + i

        order = models.Order(
            user_id=None,
            user_name_snapshot=f"섬김_{NAME_LIST[i % len(NAME_LIST)]}",
            user_duty_snapshot='사역자',
            order_number=order_num,
            order_date=today,
            total_price=0,         # 이벤트: 실제 결제 0원
            original_price=original,  # 정산용 원래 금액
            payment_method='FREE',
            status='COMPLETED',
            announcement_id=announcement_id,
            is_active=True,
        )
        db.add(order)
        db.flush()

        item = models.OrderItem(
            order_id=order.id,
            menu_id=m.id,
            menu_name_snapshot=m.name,
            menu_price_snapshot=m.price,
            quantity=qty,
            sub_total=0,  # 이벤트 0원
        )
        db.add(item)

        # 결제 로그도 추가
        log = models.PaymentLog(
            order_id=order.id,
            log_type='CALLBACK',
            amount=0,
            sender_name=f"섬김_{NAME_LIST[i % len(NAME_LIST)]}",
            raw_data={"method": "FREE", "event": True, "original_price": original}
        )
        db.add(log)
        created_count += 1

    # VOLUNTEER(식당봉사) 주문 10건
    for i in range(10):
        qty = (i % 3) + 1
        m = menu2 if i % 2 == 0 else menu
        original = m.price * qty
        order_num = base_order_num + 10 + i

        order = models.Order(
            user_id=None,
            user_name_snapshot='식당 봉사',
            user_duty_snapshot='식당봉사',
            order_number=order_num,
            order_date=today,
            total_price=0,
            original_price=original,
            payment_method='VOLUNTEER',
            status='COMPLETED',
            announcement_id=announcement_id,
            is_active=True,
        )
        db.add(order)
        db.flush()

        item = models.OrderItem(
            order_id=order.id,
            menu_id=m.id,
            menu_name_snapshot=m.name,
            menu_price_snapshot=m.price,
            quantity=qty,
            sub_total=0,
        )
        db.add(item)

        log = models.PaymentLog(
            order_id=order.id,
            log_type='CALLBACK',
            amount=0,
            sender_name='식당 봉사',
            raw_data={"method": "VOLUNTEER", "event": True, "original_price": original}
        )
        db.add(log)
        created_count += 1

    db.commit()
    print(f"\n✅ 이벤트(섬김) 주문 {created_count}건 삽입 완료!")
    print(f"  - FREE(사역자): 10건")
    print(f"  - VOLUNTEER(식당봉사): 10건")

    # 오늘의 이벤트 매출 계산
    today_event = db.query(models.Order).filter(
        models.Order.order_date == today,
        models.Order.payment_method.in_(['FREE', 'VOLUNTEER']),
        models.Order.is_active == True
    ).all()
    total_event_value = sum(o.original_price or 0 for o in today_event)
    print(f"\n📊 오늘({today}) 섬김 총 금액: ₩{total_event_value:,}원")
    print(f"\n👉 관리자 > 정산 및 매출 통계 > 주일 탭에서 오늘 날짜로 확인하세요!")

except Exception as e:
    db.rollback()
    print(f"❌ 오류 발생: {e}")
    import traceback
    traceback.print_exc()
    raise
finally:
    db.close()
