from sqlalchemy import create_engine, text
import os
from dotenv import load_dotenv

# .env 파일 로드 (루트 디렉토리)
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), ".env"))

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    print("❌ DATABASE_URL을 찾을 수 없습니다.")
    exit(1)

engine = create_engine(DATABASE_URL)

def add_column():
    sql = text("ALTER TABLE order_items ADD COLUMN menu_image_url_snapshot VARCHAR;")
    try:
        with engine.connect() as conn:
            conn.execute(sql)
            conn.commit()
        print("✅ order_items 테이블에 menu_image_url_snapshot 컬럼이 성공적으로 추가되었습니다!")
    except Exception as e:
        if "already exists" in str(e).lower():
            print("ℹ️ 이미 컬럼이 존재합니다.")
        else:
            print(f"❌ 오류 발생: {e}")

if __name__ == "__main__":
    add_column()
