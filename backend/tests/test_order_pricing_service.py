"""
[File Role] 31번 서버 권위 주문 가격·옵션 재계산 및 유효성 검증 단위/통합 테스트
"""

import pytest
from datetime import datetime, timedelta
from fastapi import HTTPException
from models import Menu, MenuOption, Category, User, Setting, Order, OrderItem, Announcement
from services.order_pricing_service import calculate_order_quote, PRICING_VERSION, TUMBLER_DISCOUNT_PER_UNIT
from schemas import OrderItemCreate


def test_normal_order_pricing(db_session):
    """19.1. 정상 일반 주문: 메뉴 3000 + 샷추가 500, 수량 2 -> normal_total 7000"""
    cat = Category(name="커피", display_order=1)
    db_session.add(cat)
    db_session.commit()

    menu = Menu(category_id=cat.id, name="아메리카노", price=3000, is_available=True)
    db_session.add(menu)
    db_session.commit()

    opt_temp = MenuOption(menu_id=menu.id, name="ICE", extra_price=0, is_active=True)
    opt_cup = MenuOption(menu_id=menu.id, name="일회용컵", extra_price=0, is_active=True)
    opt_shot = MenuOption(menu_id=menu.id, name="샷 추가", extra_price=500, is_active=True)
    db_session.add_all([opt_temp, opt_cup, opt_shot])
    db_session.commit()

    item_req = OrderItemCreate(
        menu_id=menu.id,
        quantity=2,
        option_ids=[opt_temp.id, opt_cup.id, opt_shot.id]
    )

    quote = calculate_order_quote(db_session, [item_req], require_available=True)
    assert quote.pricing_version == 2
    assert quote.normal_total == 7000
    assert quote.discount_total == 0

    item_quote = quote.items[0]
    assert item_quote.menu_base_price == 3000
    assert item_quote.option_extra_price_per_unit == 500
    assert item_quote.discount_per_unit == 0
    assert item_quote.normal_unit_price == 3500
    assert item_quote.normal_line_total == 7000
    assert item_quote.options_text == "ICE / 일회용컵 / 샷 추가"


def test_tumbler_discount_pricing(db_session):
    """19.2. 텀블러 할인: 메뉴 3000 + 샷추가 500 - 텀블러 500, 수량 2 -> 단가 3000, 합계 6000"""
    cat = Category(name="커피", display_order=1)
    db_session.add(cat)
    db_session.commit()

    menu = Menu(category_id=cat.id, name="카페라떼", price=3000, is_available=True)
    db_session.add(menu)
    db_session.commit()

    opt_temp = MenuOption(menu_id=menu.id, name="ICE", extra_price=0, is_active=True)
    opt_tumbler = MenuOption(menu_id=menu.id, name="텀블러", extra_price=0, is_active=True)
    opt_shot = MenuOption(menu_id=menu.id, name="샷 추가", extra_price=500, is_active=True)
    db_session.add_all([opt_temp, opt_tumbler, opt_shot])
    db_session.commit()

    item_req = OrderItemCreate(
        menu_id=menu.id,
        quantity=2,
        option_ids=[opt_temp.id, opt_tumbler.id, opt_shot.id]
    )

    quote = calculate_order_quote(db_session, [item_req], require_available=True)
    assert quote.normal_total == 6000
    assert quote.discount_total == 1000

    item_quote = quote.items[0]
    assert item_quote.discount_per_unit == 500
    assert item_quote.normal_unit_price == 3000
    assert item_quote.normal_line_total == 6000


def test_ignore_client_price_manipulation(db_session):
    """19.3. 클라이언트 조작 무시: sub_total=1, tumbler_discount=999999 등 무시하고 서버 DB 가격으로 정직하게 계산"""
    cat = Category(name="커피", display_order=1)
    db_session.add(cat)
    db_session.commit()

    menu = Menu(category_id=cat.id, name="바닐라라떼", price=4000, is_available=True)
    db_session.add(menu)
    db_session.commit()

    opt_temp = MenuOption(menu_id=menu.id, name="ICE", extra_price=0, is_active=True)
    opt_cup = MenuOption(menu_id=menu.id, name="일회용컵", extra_price=0, is_active=True)
    db_session.add_all([opt_temp, opt_cup])
    db_session.commit()

    # 조작된 클라이언트 데이터
    item_req = OrderItemCreate(
        menu_id=menu.id,
        quantity=1,
        option_ids=[opt_temp.id, opt_cup.id],
        options_text="공짜커피",
        sub_total=1,
        tumbler_discount=999999
    )

    quote = calculate_order_quote(db_session, [item_req], require_available=True)
    assert quote.normal_total == 4000
    assert quote.items[0].normal_unit_price == 4000
    assert quote.items[0].options_text == "ICE / 일회용컵"


def test_other_menu_option_rejected(db_session):
    """19.4. 다른 메뉴 옵션: 메뉴 A 주문에 메뉴 B 옵션 ID 전달 시 400 OPTION_MENU_MISMATCH"""
    cat = Category(name="음료", display_order=1)
    db_session.add(cat)
    db_session.commit()

    menu_a = Menu(category_id=cat.id, name="메뉴A", price=3000, is_available=True)
    menu_b = Menu(category_id=cat.id, name="메뉴B", price=4000, is_available=True)
    db_session.add_all([menu_a, menu_b])
    db_session.commit()

    opt_b = MenuOption(menu_id=menu_b.id, name="메뉴B의 샷추가", extra_price=500, is_active=True)
    db_session.add(opt_b)
    db_session.commit()

    item_req = OrderItemCreate(menu_id=menu_a.id, quantity=1, option_ids=[opt_b.id])

    with pytest.raises(HTTPException) as exc_info:
        calculate_order_quote(db_session, [item_req])
    assert exc_info.value.status_code == 400
    assert exc_info.value.detail["code"] == "OPTION_MENU_MISMATCH"


def test_inactive_option_rejected(db_session):
    """19.5. 비활성 옵션: is_active=False 옵션 전달 시 400 OPTION_NOT_AVAILABLE"""
    cat = Category(name="음료", display_order=1)
    db_session.add(cat)
    db_session.commit()

    menu = Menu(category_id=cat.id, name="아메리카노", price=3000, is_available=True)
    db_session.add(menu)
    db_session.commit()

    opt_inactive = MenuOption(menu_id=menu.id, name="단종된 시럽", extra_price=500, is_active=False)
    db_session.add(opt_inactive)
    db_session.commit()

    item_req = OrderItemCreate(menu_id=menu.id, quantity=1, option_ids=[opt_inactive.id])

    with pytest.raises(HTTPException) as exc_info:
        calculate_order_quote(db_session, [item_req])
    assert exc_info.value.status_code == 400
    assert exc_info.value.detail["code"] == "OPTION_NOT_AVAILABLE"


def test_duplicate_option_rejected(db_session):
    """19.6. 중복 옵션: option_ids=[1, 1] 전달 시 400 DUPLICATE_OPTION"""
    cat = Category(name="음료", display_order=1)
    db_session.add(cat)
    db_session.commit()

    menu = Menu(category_id=cat.id, name="아메리카노", price=3000, is_available=True)
    db_session.add(menu)
    db_session.commit()

    opt = MenuOption(menu_id=menu.id, name="샷 추가", extra_price=500, is_active=True)
    db_session.add(opt)
    db_session.commit()

    item_req = OrderItemCreate(menu_id=menu.id, quantity=1, option_ids=[opt.id, opt.id])

    with pytest.raises(HTTPException) as exc_info:
        calculate_order_quote(db_session, [item_req])
    assert exc_info.value.status_code == 400
    assert exc_info.value.detail["code"] == "DUPLICATE_OPTION"


def test_temperature_and_cup_conflict_rejected(db_session):
    """19.7. 온도/컵 옵션 충돌: ICE + HOT 또는 텀블러 + 일회용컵 선택 시 400 에러"""
    cat = Category(name="음료", display_order=1)
    db_session.add(cat)
    db_session.commit()

    menu = Menu(category_id=cat.id, name="아메리카노", price=3000, is_available=True)
    db_session.add(menu)
    db_session.commit()

    opt_ice = MenuOption(menu_id=menu.id, name="ICE", extra_price=0, is_active=True)
    opt_hot = MenuOption(menu_id=menu.id, name="HOT", extra_price=0, is_active=True)
    opt_tumbler = MenuOption(menu_id=menu.id, name="텀블러", extra_price=0, is_active=True)
    opt_disposable = MenuOption(menu_id=menu.id, name="일회용컵", extra_price=0, is_active=True)
    db_session.add_all([opt_ice, opt_hot, opt_tumbler, opt_disposable])
    db_session.commit()

    # ICE + HOT 동시 선택
    item_conflict_temp = OrderItemCreate(menu_id=menu.id, quantity=1, option_ids=[opt_ice.id, opt_hot.id, opt_tumbler.id])
    with pytest.raises(HTTPException) as exc_info:
        calculate_order_quote(db_session, [item_conflict_temp])
    assert exc_info.value.detail["code"] == "TEMPERATURE_OPTION_CONFLICT"

    # 텀블러 + 일회용컵 동시 선택
    item_conflict_cup = OrderItemCreate(menu_id=menu.id, quantity=1, option_ids=[opt_ice.id, opt_tumbler.id, opt_disposable.id])
    with pytest.raises(HTTPException) as exc_info:
        calculate_order_quote(db_session, [item_conflict_cup])
    assert exc_info.value.detail["code"] == "CUP_OPTION_CONFLICT"


def test_temperature_and_cup_required_rejected(db_session):
    """19.8. 필수 그룹 누락: 옵션 그룹이 있는데 0개 선택한 경우 400 에러"""
    cat = Category(name="음료", display_order=1)
    db_session.add(cat)
    db_session.commit()

    menu = Menu(category_id=cat.id, name="아메리카노", price=3000, is_available=True)
    db_session.add(menu)
    db_session.commit()

    opt_ice = MenuOption(menu_id=menu.id, name="ICE", extra_price=0, is_active=True)
    opt_tumbler = MenuOption(menu_id=menu.id, name="텀블러", extra_price=0, is_active=True)
    db_session.add_all([opt_ice, opt_tumbler])
    db_session.commit()

    # 컵 옵션 누락
    item_missing_cup = OrderItemCreate(menu_id=menu.id, quantity=1, option_ids=[opt_ice.id])
    with pytest.raises(HTTPException) as exc_info:
        calculate_order_quote(db_session, [item_missing_cup])
    assert exc_info.value.detail["code"] == "CUP_OPTION_REQUIRED"


def test_price_changed_409_validation(client, db_session):
    """19.11. 가격 변경: 장바구니 예상치(3000원)와 서버 가격(3500원)이 다를 경우 409 ORDER_PRICE_CHANGED 반환"""
    cat = Category(name="커피", display_order=1)
    db_session.add(cat)
    db_session.commit()

    menu = Menu(category_id=cat.id, name="아메리카노", price=3500, is_available=True)
    user = User(name="김성도", phone="01011112222", duty="성도")
    setting = Setting(is_open=True)
    db_session.add_all([menu, user, setting])
    db_session.commit()

    payload = {
        "user_id": user.id,
        "total_price": 3000,  # 클라이언트는 구 가격 3000원으로 예상
        "payment_method": "BANK_TRANSFER",
        "pricing_version": 2,
        "items": [
            {
                "menu_id": menu.id,
                "quantity": 1,
                "option_ids": []
            }
        ]
    }

    res = client.post("/api/v1/orders", json=payload)
    assert res.status_code == 409
    err_detail = res.json()["detail"]
    assert err_detail["code"] == "ORDER_PRICE_CHANGED"
    assert err_detail["expected_total"] == 3000
    assert err_detail["current_total"] == 3500


def test_outdated_pricing_version_409(client, db_session):
    """pricing_version != 2 인 경우 409 CLIENT_PRICING_SCHEMA_OUTDATED 반환"""
    cat = Category(name="커피", display_order=1)
    db_session.add(cat)
    db_session.commit()

    menu = Menu(category_id=cat.id, name="아메리카노", price=3000, is_available=True)
    user = User(name="김성도", phone="01011112222", duty="성도")
    setting = Setting(is_open=True)
    db_session.add_all([menu, user, setting])
    db_session.commit()

    payload = {
        "user_id": user.id,
        "total_price": 3000,
        "payment_method": "BANK_TRANSFER",
        "pricing_version": 1,  # 구버전
        "items": [{"menu_id": menu.id, "quantity": 1}]
    }

    res = client.post("/api/v1/orders", json=payload)
    assert res.status_code == 409
    assert res.json()["detail"]["code"] == "CLIENT_PRICING_SCHEMA_OUTDATED"


def test_quote_api_matches_create_order(client, db_session):
    """19.12. 견적 API와 실제 주문 생성 결과 일치성 확인"""
    cat = Category(name="커피", display_order=1)
    db_session.add(cat)
    db_session.commit()

    menu = Menu(category_id=cat.id, name="바닐라라떼", price=4500, is_available=True)
    user = User(name="김성도", phone="01011112222", duty="성도")
    setting = Setting(is_open=True)
    db_session.add_all([menu, user, setting])
    db_session.commit()

    opt_temp = MenuOption(menu_id=menu.id, name="ICE", extra_price=0, is_active=True)
    opt_tumbler = MenuOption(menu_id=menu.id, name="텀블러", extra_price=0, is_active=True)
    db_session.add_all([opt_temp, opt_tumbler])
    db_session.commit()

    # 1. Quote 요청
    quote_payload = {
        "pricing_version": 2,
        "items": [
            {
                "client_item_key": "key-1",
                "menu_id": menu.id,
                "quantity": 2,
                "option_ids": [opt_temp.id, opt_tumbler.id]
            }
        ]
    }

    q_res = client.post("/api/v1/orders/quote", json=quote_payload)
    assert q_res.status_code == 200
    q_data = q_res.json()["data"]
    # 4500 - 500(텀블러) = 4000 * 2 = 8000
    assert q_data["normal_total"] == 8000
    assert q_data["final_total"] == 8000

    # 2. Quote 결과로 Order 생성 요청
    order_payload = {
        "user_id": user.id,
        "total_price": q_data["final_total"],
        "payment_method": "BANK_TRANSFER",
        "pricing_version": 2,
        "items": [
            {
                "client_item_key": "key-1",
                "menu_id": menu.id,
                "quantity": 2,
                "option_ids": [opt_temp.id, opt_tumbler.id]
            }
        ]
    }

    o_res = client.post("/api/v1/orders", json=order_payload)
    assert o_res.status_code == 200
    o_data = o_res.json()["data"]
    assert o_data["total_price"] == q_data["final_total"]

    # 3. OrderItem 스냅샷 검증
    item = o_data["items"][0]
    assert item["pricing_version"] == 2
    assert item["option_price_snapshot"] == 0
    assert item["discount_per_unit_snapshot"] == 500
    assert item["discount_total_snapshot"] == 1000
    assert item["unit_price_snapshot"] == 4000
    assert len(item["selected_options_snapshot"]) == 2
