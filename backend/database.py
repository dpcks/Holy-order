import os
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

# 환경 변수에서 데이터베이스 URL 가져오기 (기본값 설정)
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://holy_user:holy_password@localhost:5432/holy_order")

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
