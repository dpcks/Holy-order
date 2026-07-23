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
