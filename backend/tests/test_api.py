from models import Category, Menu, User, Order

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

    # 2. 주문 생성 API 호출
    order_payload = {
        "user_id": user.id,
        "total_price": 4000,
        "payment_method": "BANK_TRANSFER",
        "items": [
            {
                "menu_id": menu.id,
                "quantity": 2,
                "options_text": "ICE",
                "sub_total": 4000
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
    # 사용자가 버튼을 누르는 대신 관리자가 입금을 확인하고 상태를 '준비중'으로 변경하는 시나리오입니다.
    status_payload = {
        "status": "PREPARING"
    }
    pay_response = client.patch(f"/api/v1/admin/orders/{order_id}/status", json=status_payload)
    assert pay_response.status_code == 200
    assert pay_response.json()["success"] is True
    
    # 5. DB 검증: 주문 상태가 PREPARING으로 변경되었는지 및 결제 로그가 남았는지
    db_order = db_session.query(Order).filter(Order.id == order_id).first()
    assert db_order.status == "PREPARING"
    assert len(db_order.payment_logs) > 0 # PaymentLog가 정상적으로 생성되었는지 확인
    assert db_order.payment_logs[0].amount == 4000

def test_create_order_edge_case_invalid_menu(client, db_session):
    """
    [Edge Case] 
    존재하지 않는 유저 ID나 메뉴 ID로 주문을 시도했을 때, 404 에러가 정상적으로 반환되는지 검증합니다.
    (현재 라우터 로직상 유저가 없으면 바로 404를 반환하므로 이를 중점적으로 테스트합니다.)
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
    assert "User not found" in response.json()["detail"]

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
