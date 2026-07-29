# pyrefly: ignore [missing-import]
from models import Category, Menu, User, Order, Setting
from unittest.mock import patch, MagicMock

def test_create_order_happy_path(client, db_session):
    """
    [Happy Path] 
    새로운 유저가 카테고리와 메뉴를 조회한 뒤 주문을 정상적으로 생성하고 결제까지 처리하는 시나리오입니다.
    이 과정을 통해 orders 테이블과 payment_logs 테이블에 올바르게 데이터가 쌓이는지 검증합니다.
    """
    # 1. 테스트용 데이터 준비 (메뉴 및 유저)
    cat = Category(name="커피", display_order=1)
    db_session.add(cat)
    db_session.commit()
    
    menu = Menu(category_id=cat.id, name="아메리카노", price=2000)
    db_session.add(menu)
    db_session.commit()

    user = User(name="김성도", phone="010-1111-2222", duty="성도")
    db_session.add(user)
    db_session.commit()

    # 2. 주문 생성 API 호출 (영업중인 상태 필요)
    setting = Setting(is_open=True)
    db_session.add(setting)
    db_session.commit()

    order_payload = {
        "user_id": user.id,
        "total_price": 4000,
        "payment_method": "BANK_TRANSFER",
        "items": [
            {
                "menu_id": menu.id,
                "quantity": 2,
                "options_text": "ICE",
                "sub_total": 4000,
                "tumbler_discount": 0
            }
        ]
    }
    response = client.post("/api/v1/orders", json=order_payload)
    
    # 3. 검증: HTTP 상태 코드가 200이며 반환된 데이터의 성공 여부 및 상태가 PENDING 인지
    assert response.status_code == 200
    res_json = response.json()
    assert res_json["success"] is True
    
    data = res_json["data"]
    assert data["status"] == "PENDING"
    assert data["total_price"] == 4000
    assert len(data["items"]) == 1
    
    order_id = data["id"]
    
    # 4. 관리자 승인(입금확인) 처리 API 호출 검증
    status_payload = {
        "status": "PREPARING"
    }
    pay_response = client.patch(f"/api/v1/admin/orders/{order_id}/status", json=status_payload)
    assert pay_response.status_code == 200
    assert pay_response.json()["success"] is True
    
    # 5. DB 검증: 주문 상태가 PREPARING으로 변경되었는지 및 결제 로그가 남았는지
    db_order = db_session.query(Order).filter(Order.id == order_id).first()
    assert db_order.status == "PREPARING"
    assert db_order.payment_log is not None # PaymentLog가 정상적으로 생성되었는지 확인
    assert db_order.payment_log.amount == 4000

def test_create_order_edge_case_invalid_menu(client, db_session):
    """
    [Edge Case] 
    존재하지 않는 유저 ID나 메뉴 ID로 주문을 시도했을 때, 404 에러가 정상적으로 반환되는지 검증합니다.
    """
    # 존재하지 않는 유저 ID(999)로 주문 시도
    order_payload = {
        "user_id": 999,
        "total_price": 2000,
        "payment_method": "BANK_TRANSFER",
        "items": [
            {
                "menu_id": 1,
                "quantity": 1,
                "sub_total": 2000
            }
        ]
    }
    response = client.post("/api/v1/orders", json=order_payload)
    
    # 404 에러 반환 검증
    assert response.status_code == 404
    assert "사용자를 찾을 수 없거나 활성화되지 않았습니다." in response.json()["detail"]

def test_data_integrity_menu_list(client, db_session):
    """
    [Data Integrity] 
    더미 데이터로 입력한 카테고리와 메뉴 구조가 실제 API 조회 시 기획서의 의도대로 정확하게 매핑되어 응답되는지 검증합니다.
    """
    # 1. 카테고리와 소속 메뉴 추가
    cat = Category(name="디저트", display_order=1)
    db_session.add(cat)
    db_session.commit()
    
    menu1 = Menu(category_id=cat.id, name="초코 쿠키", price=3000)
    menu2 = Menu(category_id=cat.id, name="치즈 케이크", price=5000)
    db_session.add_all([menu1, menu2])
    db_session.commit()

    # 2. 카테고리 목록 API 호출
    response = client.get("/api/v1/categories")
    assert response.status_code == 200
    res_json = response.json()
    assert res_json["success"] is True
    
    data = res_json["data"]
    assert len(data) == 1
    
    # 3. 데이터 구조(Integrity) 검증
    category_data = data[0]
    assert category_data["name"] == "디저트"
    assert len(category_data["menus"]) == 2
    
    menu_names = [m["name"] for m in category_data["menus"]]
    assert "초코 쿠키" in menu_names
    assert "치즈 케이크" in menu_names

def test_get_settings_cache_control_header(client, db_session):
    """
    GET /api/v1/settings 응답에 Cache-Control: no-store, max-age=0 헤더가 적용되어 있는지 검증합니다.
    """
    setting = Setting(is_open=True, notice="공지사항")
    db_session.add(setting)
    db_session.commit()

    response = client.get("/api/v1/settings")
    assert response.status_code == 200
    assert response.headers.get("cache-control") == "no-store, max-age=0"
    assert response.headers.get("pragma") == "no-cache"

def test_put_admin_settings_broadcast(client, db_session):
    """
    PUT /api/v1/admin/settings 요청 시 settings가 변경되고 websocket manager.broadcast가 background task로 예약되는지 검증합니다.
    """
    setting = Setting(is_open=True, notice="공지사항")
    db_session.add(setting)
    db_session.commit()

    # websocket manager.broadcast를 모킹
    with patch("websocket.manager.broadcast") as mock_broadcast:
        response = client.put("/api/v1/admin/settings", json={"is_open": False})
        assert response.status_code == 200
        # Background tasks 실행을 위해 TestClient의 context가 비워진 후 호출 여부 확인
        # FastAPI TestClient는 응답을 반환할 때 백그라운드 태스크를 동기적으로 실행시킵니다.
        assert mock_broadcast.called
        # 첫 번째 호출의 인자 검증
        called_payload = mock_broadcast.call_args[0][0]
        assert called_payload["type"] == "SETTINGS_UPDATED"
        assert called_payload["is_open"] is False
        assert "is_open" in called_payload["changed_fields"]

def test_create_order_fails_when_closed(client, db_session):
    """
    영업 상태가 False(영업 종료)일 때 주문 생성이 403 Forbidden 으로 차단되는지 검증합니다.
    """
    cat = Category(name="커피", display_order=1)
    db_session.add(cat)
    db_session.commit()
    
    menu = Menu(category_id=cat.id, name="아메리카노", price=2000)
    db_session.add(menu)
    db_session.commit()

    user = User(name="김성도", phone="010-1111-2222", duty="성도")
    db_session.add(user)

    # 영업 종료 상태로 설정
    setting = Setting(is_open=False)
    db_session.add(setting)
    db_session.commit()

    order_payload = {
        "user_id": user.id,
        "total_price": 2000,
        "payment_method": "BANK_TRANSFER",
        "items": [
            {
                "menu_id": menu.id,
                "quantity": 1,
                "options_text": "ICE",
                "sub_total": 2000
            }
        ]
    }
    response = client.post("/api/v1/orders", json=order_payload)
    assert response.status_code == 403
    assert "현재 영업 시간이 아닙니다." in response.json()["detail"]

def test_volunteer_schedule_sunday_validation(client, db_session):
    """
    POST /api/v1/admin/schedules 요청 시 sunday_date 검증 테스트:
    - 평일(월요일 등) 날짜로 요청하면 422 Unprocessable Entity 에러 반환 검증
    - 일요일 날짜로 요청하면 200 OK 성공 응답 검증
    """
    # 1. 평일(2026-07-27 월요일) 요청 -> 422
    weekday_payload = {
        "sunday_date": "2026-07-27",
        "volunteers": {"names": ["김성도"]},
        "memo": "평일 스케줄 시도"
    }
    res_weekday = client.post("/api/v1/admin/schedules", json=weekday_payload)
    assert res_weekday.status_code == 422

    # 2. 일요일(2026-07-26 일요일) 요청 -> 200
    sunday_payload = {
        "sunday_date": "2026-07-26",
        "volunteers": {"names": ["김성도", "이집사"]},
        "memo": "주일 정상 스케줄"
    }
    res_sunday = client.post("/api/v1/admin/schedules", json=sunday_payload)
    assert res_sunday.status_code == 200
    res_json = res_sunday.json()
    assert res_json["success"] is True
    assert res_json["data"]["sunday_date"] == "2026-07-26"
    assert res_json["data"]["volunteers"]["names"] == ["김성도", "이집사"]


# ==========================================
# 재고 관리 (Ingredient) 테스트
# ==========================================

def test_ingredient_crud_and_alerts(client, db_session):
    """
    재고 품목 CRUD 및 부족 알림 기준(current_stock <= alert_threshold) 검증
    """
    # 1. 품목 생성
    create_payload = {
        "name": "우유",
        "category": "재료",
        "unit": "팩",
        "current_stock": 3,
        "alert_threshold": 3,
        "memo": "교회 앞 마트",
        "display_order": 1
    }
    res = client.post("/api/v1/admin/ingredients", json=create_payload)
    assert res.status_code == 200
    data = res.json()["data"]
    ingredient_id = data["id"]
    assert data["name"] == "우유"
    assert data["current_stock"] == 3
    assert data["alert_threshold"] == 3

    # 2. 목록 조회
    res_list = client.get("/api/v1/admin/ingredients")
    assert res_list.status_code == 200
    items = res_list.json()["data"]
    assert any(i["id"] == ingredient_id for i in items)

    # 3. 부족 알림 — current_stock == alert_threshold → 포함
    res_alerts = client.get("/api/v1/admin/ingredients/alerts")
    assert res_alerts.status_code == 200
    alert_ids = [i["id"] for i in res_alerts.json()["data"]]
    assert ingredient_id in alert_ids

    # 4. 부분 PATCH: current_stock만 변경
    patch_payload = {"current_stock": 12}
    res_patch = client.patch(f"/api/v1/admin/ingredients/{ingredient_id}", json=patch_payload)
    assert res_patch.status_code == 200
    patched = res_patch.json()["data"]
    assert patched["current_stock"] == 12
    # 나머지 필드 유지 확인
    assert patched["name"] == "우유"
    assert patched["alert_threshold"] == 3
    assert patched["memo"] == "교회 앞 마트"

    # 5. 수정 후 부족 알림에서 제외 (current_stock > alert_threshold)
    res_alerts2 = client.get("/api/v1/admin/ingredients/alerts")
    alert_ids2 = [i["id"] for i in res_alerts2.json()["data"]]
    assert ingredient_id not in alert_ids2

    # 6. 소프트 삭제
    res_del = client.delete(f"/api/v1/admin/ingredients/{ingredient_id}")
    assert res_del.status_code == 200
    # 목록에서 제외 확인
    res_list2 = client.get("/api/v1/admin/ingredients")
    ids_after_delete = [i["id"] for i in res_list2.json()["data"]]
    assert ingredient_id not in ids_after_delete


def test_ingredient_negative_values_rejected(client, db_session):
    """
    음수 재고, 음수 임계값, 음수 정렬 순서는 422로 거부되어야 한다.
    """
    # 음수 current_stock
    res = client.post("/api/v1/admin/ingredients", json={
        "name": "테스트", "current_stock": -1, "alert_threshold": 0
    })
    assert res.status_code == 422

    # 음수 alert_threshold
    res2 = client.post("/api/v1/admin/ingredients", json={
        "name": "테스트", "current_stock": 0, "alert_threshold": -1
    })
    assert res2.status_code == 422

    # 음수 display_order
    res3 = client.post("/api/v1/admin/ingredients", json={
        "name": "테스트", "current_stock": 0, "alert_threshold": 0, "display_order": -1
    })
    assert res3.status_code == 422


def test_ingredient_stock_only_patch(client, db_session):
    """
    current_stock 단독 부분 PATCH — 이름, 단위, 메모, 임계값 유지 검증
    """
    create_payload = {
        "name": "일회용컵",
        "category": "소모품",
        "unit": "개",
        "current_stock": 100,
        "alert_threshold": 20,
        "memo": "대형마트 구매",
        "display_order": 2
    }
    res_create = client.post("/api/v1/admin/ingredients", json=create_payload)
    assert res_create.status_code == 200
    item_id = res_create.json()["data"]["id"]

    # current_stock 단독 PATCH
    res_patch = client.patch(f"/api/v1/admin/ingredients/{item_id}", json={"current_stock": 8})
    assert res_patch.status_code == 200
    data = res_patch.json()["data"]
    assert data["current_stock"] == 8
    assert data["name"] == "일회용컵"
    assert data["unit"] == "개"
    assert data["alert_threshold"] == 20
    assert data["memo"] == "대형마트 구매"
    assert data["display_order"] == 2
