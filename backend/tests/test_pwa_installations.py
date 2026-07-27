"""
PWA 익명 설치 기기 추적 및 통계 API 단위/통합 테스트
"""

import pytest
import uuid
import models


def test_user_pwa_heartbeat_creation_and_upsert(client, db_session):
    inst_id = str(uuid.uuid4())
    payload = {
        "installation_id": inst_id,
        "platform": "IOS",
        "browser_family": "SAFARI",
        "is_running_standalone": True,
        "detection_method": "STANDALONE_LAUNCH",
        "push_permission": "GRANTED",
        "related_app_installed": None
    }
    
    # 1. 최초 등록
    res = client.post("/api/v1/pwa/installations/heartbeat", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert data["data"]["app_type"] == "USER"
    
    # 2. DB 검증
    record = db_session.query(models.PwaInstallation).filter_by(installation_id=inst_id, app_type="USER").first()
    assert record is not None
    assert record.platform == "IOS"
    assert record.first_standalone_at is not None
    assert record.last_standalone_at is not None
    
    # 3. 재호출 시 upsert (중복 생성 없이 갱신)
    res2 = client.post("/api/v1/pwa/installations/heartbeat", json=payload)
    assert res2.status_code == 200
    count = db_session.query(models.PwaInstallation).filter_by(installation_id=inst_id, app_type="USER").count()
    assert count == 1


def test_admin_pwa_heartbeat(client, db_session, mock_admin):
    inst_id = str(uuid.uuid4())
    payload = {
        "installation_id": inst_id,
        "platform": "DESKTOP",
        "browser_family": "CHROME",
        "is_running_standalone": True,
        "detection_method": "STANDALONE_LAUNCH"
    }
    
    res = client.post("/api/v1/admin/pwa/installations/heartbeat", json=payload)
    assert res.status_code == 200
    assert res.json()["data"]["app_type"] == "ADMIN"
    assert res.json()["data"]["admin_id"] == mock_admin.id


def test_invalid_uuid_rejected(client):
    payload = {
        "installation_id": "invalid-uuid-string-1234",
        "platform": "IOS"
    }
    res = client.post("/api/v1/pwa/installations/heartbeat", json=payload)
    assert res.status_code == 422


def test_order_creation_with_pwa_installation_key(client, db_session):
    cat = models.Category(name="커피", display_order=1)
    db_session.add(cat)
    db_session.commit()
    
    menu = models.Menu(category_id=cat.id, name="아메리카노", price=3000, is_available=True)
    setting = models.Setting(is_open=True, toss_enabled=False)
    user = models.User(name="홍길동", phone="010-1234-5678", duty="성도")
    db_session.add_all([menu, setting, user])
    db_session.commit()
    
    target_user_id = user.id
    target_menu_id = menu.id
    inst_id = str(uuid.uuid4())
    
    # 1. USER PWA installation heartbeat 등록
    client.post("/api/v1/pwa/installations/heartbeat", json={
        "installation_id": inst_id,
        "platform": "ANDROID",
        "browser_family": "CHROME",
        "is_running_standalone": True,
        "detection_method": "STANDALONE_LAUNCH"
    })
    
    # 2. 유효한 USER installation_key를 포함하여 주문 생성
    order_payload = {
        "user_id": target_user_id,
        "total_price": 3000,
        "payment_method": "BANK_TRANSFER",
        "request": "따뜻하게 부탁드립니다",
        "items": [
            {"menu_id": target_menu_id, "quantity": 1, "sub_total": 3000, "tumbler_discount": 0}
        ],
        "is_pwa": True,
        "pwa_installation_key": inst_id
    }
    res = client.post("/api/v1/orders", json=order_payload)
    assert res.status_code == 200
    order_id = res.json()["data"]["id"]
    
    # 3. Order DB 검증: pwa_installation_id가 연결되었는지 확인
    order_db = db_session.query(models.Order).filter_by(id=order_id).first()
    assert order_db is not None
    assert order_db.is_pwa is True  # 기존 is_pwa는 그대로 유지
    assert order_db.pwa_installation_id is not None
    assert order_db.pwa_installation.installation_id == inst_id


def test_order_creation_with_admin_key_rejected_from_linking(client, db_session, mock_admin):
    cat = models.Category(name="커피", display_order=1)
    db_session.add(cat)
    db_session.commit()
    
    menu = models.Menu(category_id=cat.id, name="아메리카노", price=3000, is_available=True)
    setting = models.Setting(is_open=True, toss_enabled=False)
    user = models.User(name="홍길동", phone="010-1234-5678", duty="성도")
    db_session.add_all([menu, setting, user])
    db_session.commit()

    target_user_id = user.id
    target_menu_id = menu.id
    admin_inst_id = str(uuid.uuid4())
    
    # ADMIN installation 생성
    client.post(
        "/api/v1/admin/pwa/installations/heartbeat",
        json={"installation_id": admin_inst_id, "platform": "DESKTOP", "is_running_standalone": True}
    )
    
    # ADMIN installation key를 일반 주문에 전달
    order_payload = {
        "user_id": target_user_id,
        "total_price": 3000,
        "payment_method": "BANK_TRANSFER",
        "items": [{"menu_id": target_menu_id, "quantity": 1, "sub_total": 3000, "tumbler_discount": 0}],
        "is_pwa": True,
        "pwa_installation_key": admin_inst_id
    }
    res = client.post("/api/v1/orders", json=order_payload)
    assert res.status_code == 200
    order_id = res.json()["data"]["id"]
    
    # 주문은 성공하지만 pwa_installation_id는 None (USER installation만 연결 허용)
    order_db = db_session.query(models.Order).filter_by(id=order_id).first()
    assert order_db.pwa_installation_id is None


def test_pwa_stats_api(client):
    res = client.get("/api/v1/admin/pwa/installations/stats")
    assert res.status_code == 200
    data = res.json()["data"]
    assert "detected_total" in data
    assert "active_7d" in data
    assert "active_30d" in data
    assert "by_app_type" in data
    assert "by_platform" in data
