import pytest
from datetime import datetime, timedelta
from models import Category, Menu, User, Order, Announcement, Setting, get_seoul_time
from services.announcement_service import (
    get_announcement_status,
    get_effective_free_event,
    get_effective_notices,
    validate_announcement_period,
    validate_free_event_overlap,
)


def _now_naive():
    return get_seoul_time().replace(tzinfo=None)


def test_12_1_status_computation(db_session):
    """12-1. 상태 계산 test"""
    now = _now_naive()

    # DRAFT: is_active=False
    draft = Announcement(title="초안", is_event_mode=True, is_active=False)

    # SCHEDULED: is_active=True, starts_at 미래
    scheduled = Announcement(
        title="예약",
        is_event_mode=True,
        is_active=True,
        starts_at=now + timedelta(hours=1),
        ends_at=now + timedelta(hours=5),
    )

    # LIVE: is_active=True, starts_at 과거, ends_at 미래
    live = Announcement(
        title="진행중",
        is_event_mode=True,
        is_active=True,
        starts_at=now - timedelta(hours=1),
        ends_at=now + timedelta(hours=1),
    )

    # ENDED: ends_at <= now
    ended = Announcement(
        title="종료",
        is_event_mode=True,
        is_active=True,
        starts_at=now - timedelta(hours=5),
        ends_at=now - timedelta(hours=1),
    )

    assert get_announcement_status(draft, now) == "DRAFT"
    assert get_announcement_status(scheduled, now) == "SCHEDULED"
    assert get_announcement_status(live, now) == "LIVE"
    assert get_announcement_status(ended, now) == "ENDED"


def test_12_2_public_current_api(client, db_session):
    """12-2. 공개 현재 API: free_event 1개, notices N개 반환"""
    now = _now_naive()

    live_event = Announcement(
        title="무료 이벤트",
        is_event_mode=True,
        is_active=True,
        sponsor_name="홍길동",
        event_type="칠순감사",
        starts_at=now - timedelta(hours=1),
        ends_at=now + timedelta(hours=1),
    )
    notice1 = Announcement(
        title="공지 1",
        is_event_mode=False,
        is_active=True,
        starts_at=now - timedelta(hours=1),
        ends_at=now + timedelta(hours=1),
    )
    notice2 = Announcement(
        title="공지 2",
        is_event_mode=False,
        is_active=True,
        starts_at=now - timedelta(hours=1),
        ends_at=now + timedelta(hours=1),
    )
    ended_event = Announcement(
        title="종료 이벤트",
        is_event_mode=True,
        is_active=True,
        starts_at=now - timedelta(hours=5),
        ends_at=now - timedelta(hours=1),
    )

    db_session.add_all([live_event, notice1, notice2, ended_event])
    db_session.commit()

    res = client.get("/api/v1/announcements/current")
    assert res.status_code == 200
    data = res.json()["data"]

    assert data["free_event"] is not None
    assert data["free_event"]["id"] == live_event.id
    assert len(data["notices"]) == 2


def test_12_3_notice_does_not_affect_price(client, db_session):
    """12-3. LIVE 일반 공지만 존재할 때 공개 주문은 정상 가격으로 처리됨"""
    now = _now_naive()
    notice = Announcement(title="일반 공지", is_event_mode=False, is_active=True)
    db_session.add(notice)

    cat = Category(name="음료", display_order=1)
    db_session.add(cat)
    db_session.commit()

    menu = Menu(category_id=cat.id, name="아메리카노", price=3000)
    user = User(name="김성도", phone="01011112222", duty="성도")
    setting = Setting(is_open=True)
    db_session.add_all([menu, user, setting])
    db_session.commit()

    payload = {
        "user_id": user.id,
        "total_price": 3000,
        "payment_method": "BANK_TRANSFER",
        "items": [
            {
                "menu_id": menu.id,
                "quantity": 1,
                "options_text": None,
                "sub_total": 3000,
                "tumbler_discount": 0,
            }
        ],
    }
    res = client.post("/api/v1/orders", json=payload)
    assert res.status_code == 200
    order_data = res.json()["data"]
    assert order_data["total_price"] == 3000
    assert order_data["announcement_id"] is None
    assert order_data["payment_method"] == "BANK_TRANSFER"


def test_12_4_block_client_free_payment_method(client, db_session):
    """12-4. 유효 이벤트 없이 클라이언트가 FREE 요청 시 차단 (400 또는 422)"""
    cat = Category(name="음료", display_order=1)
    db_session.add(cat)
    db_session.commit()

    menu = Menu(category_id=cat.id, name="아메리카노", price=3000)
    user = User(name="김성도", phone="01011112222", duty="성도")
    setting = Setting(is_open=True)
    db_session.add_all([menu, user, setting])
    db_session.commit()

    payload = {
        "user_id": user.id,
        "total_price": 0,
        "payment_method": "FREE",  # PublicPaymentMethodEnum에 미포함 → FastAPI Schema Validation (422) 또는 400
        "items": [
            {
                "menu_id": menu.id,
                "quantity": 1,
                "options_text": None,
                "sub_total": 0,
                "tumbler_discount": 0,
            }
        ],
    }
    res = client.post("/api/v1/orders", json=payload)
    assert res.status_code in [400, 422]


def test_12_5_block_client_zero_price(client, db_session):
    """12-5. 유효 이벤트 없이 클라이언트가 total_price=0 요청 시 차단 (400)"""
    cat = Category(name="음료", display_order=1)
    db_session.add(cat)
    db_session.commit()

    menu = Menu(category_id=cat.id, name="아메리카노", price=3000)
    user = User(name="김성도", phone="01011112222", duty="성도")
    setting = Setting(is_open=True)
    db_session.add_all([menu, user, setting])
    db_session.commit()

    payload = {
        "user_id": user.id,
        "total_price": 0,
        "payment_method": "BANK_TRANSFER",
        "items": [
            {
                "menu_id": menu.id,
                "quantity": 1,
                "options_text": None,
                "sub_total": 0,
                "tumbler_discount": 0,
            }
        ],
    }
    res = client.post("/api/v1/orders", json=payload)
    assert res.status_code == 400


def test_12_6_auto_apply_valid_free_event(client, db_session):
    """12-6. LIVE 무료 이벤트 존재 시 서버가 total_price=0, FREE, announcement_id 적용"""
    now = _now_naive()
    event = Announcement(
        title="골든벨",
        is_event_mode=True,
        is_active=True,
        sponsor_name="박장로",
        event_type="칠순감사",
        starts_at=now - timedelta(hours=1),
        ends_at=now + timedelta(hours=1),
    )
    db_session.add(event)

    cat = Category(name="음료", display_order=1)
    db_session.add(cat)
    db_session.commit()

    menu = Menu(category_id=cat.id, name="아메리카노", price=3000)
    user = User(name="김성도", phone="01011112222", duty="성도")
    setting = Setting(is_open=True)
    db_session.add_all([menu, user, setting])
    db_session.commit()

    # 프론트는 정상 가격(3000원)을 보냄
    payload = {
        "user_id": user.id,
        "total_price": 3000,
        "payment_method": "BANK_TRANSFER",
        "expected_announcement_id": event.id,
        "items": [
            {
                "menu_id": menu.id,
                "quantity": 1,
                "options_text": None,
                "sub_total": 3000,
                "tumbler_discount": 0,
            }
        ],
    }
    res = client.post("/api/v1/orders", json=payload)
    assert res.status_code == 200
    order_data = res.json()["data"]

    assert order_data["total_price"] == 0
    assert order_data["payment_method"] == "FREE"
    assert order_data["announcement_id"] == event.id
    assert order_data["original_price"] == 3000


def test_12_7_expired_event_not_applied(client, db_session):
    """12-7. is_active=True 이지만 ends_at이 지난 이벤트는 적용되지 않고 일반 주문 처리"""
    now = _now_naive()
    expired_event = Announcement(
        title="만료된 이벤트",
        is_event_mode=True,
        is_active=True,
        starts_at=now - timedelta(hours=5),
        ends_at=now - timedelta(minutes=10),
    )
    db_session.add(expired_event)

    cat = Category(name="음료", display_order=1)
    db_session.add(cat)
    db_session.commit()

    menu = Menu(category_id=cat.id, name="아메리카노", price=3000)
    user = User(name="김성도", phone="01011112222", duty="성도")
    setting = Setting(is_open=True)
    db_session.add_all([menu, user, setting])
    db_session.commit()

    payload = {
        "user_id": user.id,
        "total_price": 3000,
        "payment_method": "BANK_TRANSFER",
        "items": [
            {
                "menu_id": menu.id,
                "quantity": 1,
                "options_text": None,
                "sub_total": 3000,
                "tumbler_discount": 0,
            }
        ],
    }
    res = client.post("/api/v1/orders", json=payload)
    assert res.status_code == 200
    order_data = res.json()["data"]
    assert order_data["total_price"] == 3000
    assert order_data["payment_method"] == "BANK_TRANSFER"
    assert order_data["announcement_id"] is None


def test_12_8_stale_expected_event(client, db_session):
    """12-8. expected_announcement_id 와 서버 effective event 불일치 시 409 Conflict"""
    now = _now_naive()
    event1 = Announcement(
        title="이벤트 1",
        is_event_mode=True,
        is_active=True,
        sponsor_name="A",
        event_type="감사",
        starts_at=now - timedelta(hours=1),
        ends_at=now + timedelta(hours=1),
    )
    db_session.add(event1)

    cat = Category(name="음료", display_order=1)
    db_session.add(cat)
    db_session.commit()

    menu = Menu(category_id=cat.id, name="아메리카노", price=3000)
    user = User(name="김성도", phone="01011112222", duty="성도")
    setting = Setting(is_open=True)
    db_session.add_all([menu, user, setting])
    db_session.commit()

    # expected_announcement_id = 9999 (없는 ID)
    payload = {
        "user_id": user.id,
        "total_price": 0,
        "payment_method": "BANK_TRANSFER",
        "expected_announcement_id": 9999,
        "items": [
            {
                "menu_id": menu.id,
                "quantity": 1,
                "options_text": None,
                "sub_total": 3000,
                "tumbler_discount": 0,
            }
        ],
    }
    res = client.post("/api/v1/orders", json=payload)
    assert res.status_code == 409


def test_12_9_overlapping_free_events_blocked(client, db_session):
    """12-9. 시간 범위가 겹치는 무료 이벤트 게시 시도 시 409 Conflict"""
    now = _now_naive()
    event_a = Announcement(
        title="이벤트 A",
        is_event_mode=True,
        is_active=True,
        sponsor_name="A",
        event_type="칠순",
        starts_at=now,
        ends_at=now + timedelta(hours=4),
    )
    db_session.add(event_a)
    db_session.commit()

    event_b = Announcement(
        title="이벤트 B",
        is_event_mode=True,
        is_active=False,
        sponsor_name="B",
        event_type="결혼",
        starts_at=now + timedelta(hours=2),
        ends_at=now + timedelta(hours=5),
    )
    db_session.add(event_b)
    db_session.commit()

    res = client.post(f"/api/v1/admin/announcements/{event_b.id}/activate")
    assert res.status_code == 409


def test_12_10_multiple_notices_live_allowed(client, db_session):
    """12-10. 일반 공지는 여러 개가 동시에 LIVE 가능"""
    now = _now_naive()
    notice_a = Announcement(title="공지 A", is_event_mode=False, is_active=True)
    notice_b = Announcement(title="공지 B", is_event_mode=False, is_active=False)
    db_session.add_all([notice_a, notice_b])
    db_session.commit()

    res = client.post(f"/api/v1/admin/announcements/{notice_b.id}/activate")
    assert res.status_code == 200

    notices = get_effective_notices(db_session, now)
    assert len(notices) == 2


def test_12_11_protect_linked_announcement_deletion(client, db_session):
    """12-11. 연결된 주문이 있는 이벤트는 물리 삭제 거부 (409)"""
    event = Announcement(title="주문 연결 이벤트", is_event_mode=True, is_active=False)
    db_session.add(event)
    db_session.commit()

    user = User(name="김성도", phone="01011112222", duty="성도")
    db_session.add(user)
    db_session.commit()

    order = Order(
        user_id=user.id,
        user_duty_snapshot="성도",
        user_name_snapshot="김성도",
        total_price=0,
        original_price=3000,
        announcement_id=event.id,
        payment_method="FREE",
        status="COMPLETED",
        order_number=1,
        order_date=get_seoul_time().date(),
        is_active=True,
    )
    db_session.add(order)
    db_session.commit()

    res = client.delete(f"/api/v1/admin/announcements/{event.id}")
    assert res.status_code == 409


def test_12_12_admin_manual_free_order(client, db_session):
    """12-12. 유효 이벤트 없어도 관리자는 수동 무료/봉사자 주문을 생성할 수 있음"""
    cat = Category(name="음료", display_order=1)
    db_session.add(cat)
    db_session.commit()

    menu = Menu(category_id=cat.id, name="아메리카노", price=3000)
    db_session.add(menu)
    db_session.commit()

    payload = {
        "user_name_snapshot": "사역자A",
        "user_duty_snapshot": "목사",
        "total_price": 3000,
        "payment_method": "FREE",
        "items": [
            {
                "menu_id": menu.id,
                "quantity": 1,
                "options_text": None,
                "sub_total": 3000,
                "tumbler_discount": 0,
            }
        ],
        "status": "PREPARING",
    }
    res = client.post("/api/v1/orders/admin", json=payload)
    assert res.status_code == 200
    order_data = res.json()["data"]
    assert order_data["total_price"] == 0
    assert order_data["original_price"] == 3000
    assert order_data["announcement_id"] is None
    assert order_data["payment_method"] == "FREE"
