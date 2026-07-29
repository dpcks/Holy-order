import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# pyrefly: ignore [missing-import]
from database import get_db
# pyrefly: ignore [missing-import]
from models import Base
# pyrefly: ignore [missing-import]
from main import app

# 테스트용 SQLite 인메모리 DB 설정
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

@pytest.fixture(scope="function", autouse=True)
def setup_test_db():
    # 각 테스트 함수 실행 전에 테이블 생성
    Base.metadata.create_all(bind=engine)
    yield
    # 각 테스트 함수 종료 후 테이블 삭제 (초기화)
    Base.metadata.drop_all(bind=engine)

@pytest.fixture
def db_session():
    db = TestingSessionLocal(expire_on_commit=False)
    try:
        yield db
    finally:
        db.close()

@pytest.fixture
def mock_admin(db_session):
    # pyrefly: ignore [missing-import]
    import models
    admin = models.Admin(
        login_id="testadmin",
        password_hash="test",
        name="테스트어드민",
        role="MASTER",
        is_active=True
    )
    db_session.add(admin)
    db_session.commit()
    db_session.refresh(admin)
    return admin

@pytest.fixture
def client(db_session, mock_admin):
    # pyrefly: ignore [missing-import]
    from auth import get_current_admin, get_current_master
    # 의존성 오버라이드: 실제 DB 연결 대신 테스트 DB 사용
    def override_get_db():
        try:
            yield db_session
        finally:
            db_session.close()

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_admin] = lambda: mock_admin
    app.dependency_overrides[get_current_master] = lambda: mock_admin
    yield TestClient(app)
    del app.dependency_overrides[get_db]
    if get_current_admin in app.dependency_overrides:
        del app.dependency_overrides[get_current_admin]
    if get_current_master in app.dependency_overrides:
        del app.dependency_overrides[get_current_master]

