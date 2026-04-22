from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from config import settings

DATABASE_URL = settings.DATABASE_URL

engine = create_engine(
    DATABASE_URL,
    # 커넥션 풀 설정
    pool_size=5,           # 기본 커넥션 수
    max_overflow=10,        # 초과 허용 커넥션 수
    pool_recycle=300,      # 커넥션 재사용 주기 (초, 30분)
    pool_pre_ping=True      # 연결 유효성 체크 활성화
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
