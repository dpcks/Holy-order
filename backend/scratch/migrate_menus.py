from database import engine
from sqlalchemy import text

def migrate():
    with engine.connect() as conn:
        print("Migrating database...")
        try:
            # 1. display_order 컬럼 추가
            conn.execute(text("ALTER TABLE menus ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0;"))
            print("Added 'display_order' column to 'menus' table.")
            
            # 2. is_active 컬럼 추가
            conn.execute(text("ALTER TABLE menus ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;"))
            print("Added 'is_active' column to 'menus' table.")
            
            conn.commit()
            print("Migration successful!")
        except Exception as e:
            print(f"Migration failed: {e}")

if __name__ == "__main__":
    migrate()
