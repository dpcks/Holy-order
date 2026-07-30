"""
[File Role] PWA 설치 통계 DB 제약조건 및 검증 함수 단위/통합 테스트
- verify_constraints 함수가 SQLite 및 PostgreSQL 환경을 올바르게 검증하는지 테스트
- ON DELETE SET NULL 동작 테스트 (Admin 삭제 시 PwaInstallation.admin_id -> NULL, PwaInstallation 삭제 시 Order.pwa_installation_id -> NULL)
- 고아 참조(Orphan records) 탐지 기능 테스트
"""

import pytest
from sqlalchemy import create_engine, text, event
from sqlalchemy.orm import sessionmaker

from database import Base
from models import Admin, PwaInstallation, Order
from scripts.verify_pwa_installation_constraints import verify_constraints


@pytest.fixture
def test_engine():
    """인메모리 SQLite 테스트 엔진 생성 (외래키 제약 활성화)"""
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})

    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    Base.metadata.create_all(bind=engine)
    yield engine
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def test_db_session(test_engine):
    """테스트 DB 세션 픽스처"""
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


def test_verify_constraints_on_valid_schema(test_engine):
    """정상적인 스키마가 구축된 DB 환경에서 verify_constraints가 PASS(True)를 반환하는지 검증"""
    is_passed, logs = verify_constraints(test_engine, verbose=False)
    assert is_passed is True
    assert any("[PASS] table pwa_installations exists" in log for log in logs)
    assert any("[PASS] pwa_installations.admin_id is nullable" in log for log in logs)
    assert any("[PASS] admin_id FK -> admins.id" in log for log in logs)
    assert any("[PASS] orders.pwa_installation_id exists" in log for log in logs)
    assert any("[PASS] order FK -> pwa_installations.id" in log for log in logs)
    assert any("[PASS] no orphan admin_id rows" in log for log in logs)


def test_orphan_admin_id_detection(test_engine):
    """존재하지 않는 admin_id를 가진 고아 PwaInstallation 레코드 탐지 테스트"""
    with test_engine.connect() as conn:
        conn.execute(text("PRAGMA foreign_keys=OFF;"))
        conn.execute(text("""
            INSERT INTO pwa_installations (installation_id, app_type, platform, browser_family, last_detection_method, push_permission, admin_id)
            VALUES ('orphan_admin_inst_123', 'ADMIN', 'DESKTOP', 'CHROME', 'UNKNOWN', 'UNKNOWN', 9999);
        """))
        conn.commit()

    is_passed, logs = verify_constraints(test_engine, verbose=False)
    assert is_passed is False
    assert any("[FAIL] 1 orphan admin_id values do not exist in admins" in log for log in logs)


def test_orphan_order_installation_id_detection(test_engine):
    """존재하지 않는 pwa_installation_id를 가진 고아 Order 레코드 탐지 테스트"""
    with test_engine.connect() as conn:
        conn.execute(text("PRAGMA foreign_keys=OFF;"))
        conn.execute(text("""
            INSERT INTO orders (order_number, order_date, is_pwa, pwa_installation_id, is_active)
            VALUES (99, '2026-07-30', 1, 8888, 1);
        """))
        conn.commit()

    is_passed, logs = verify_constraints(test_engine, verbose=False)
    assert is_passed is False
    assert any("[FAIL] 1 orphan pwa_installation_id values do not exist in pwa_installations" in log for log in logs)


def test_on_delete_set_null_relationships(test_db_session):
    """Admin 및 PwaInstallation 삭제 시 외래키 참조가 NULL로 처리되는지 모델 테스트"""
    # 1. Admin 및 PwaInstallation 생성
    admin = Admin(login_id="test_admin_fk", password_hash="hashed", name="테스트관리자")
    test_db_session.add(admin)
    test_db_session.commit()
    test_db_session.refresh(admin)

    inst = PwaInstallation(
        installation_id="inst_on_delete_test",
        app_type="ADMIN",
        admin_id=admin.id,
    )
    test_db_session.add(inst)
    test_db_session.commit()
    test_db_session.refresh(inst)

    order = Order(
        order_number=100,
        is_pwa=True,
        pwa_installation_id=inst.id,
    )
    test_db_session.add(order)
    test_db_session.commit()
    test_db_session.refresh(order)

    # 연결 상태 확인
    assert inst.admin_id == admin.id
    assert order.pwa_installation_id == inst.id

    # 2. Admin 삭제 -> inst.admin_id가 NULL로 처리되어야 함
    test_db_session.delete(admin)
    test_db_session.commit()
    test_db_session.refresh(inst)
    assert inst.admin_id is None

    # 3. PwaInstallation 삭제 -> order.pwa_installation_id가 NULL로 처리되어야 함
    test_db_session.delete(inst)
    test_db_session.commit()
    test_db_session.refresh(order)
    assert order.pwa_installation_id is None
