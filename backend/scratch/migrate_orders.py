from database import engine
from sqlalchemy import text

def migrate():
    with engine.connect() as conn:
        print("Starting migration...")
        try:
            # PostgreSQL syntax to add columns if they don't exist
            conn.execute(text("ALTER TABLE orders ADD COLUMN IF NOT EXISTS user_phone_snapshot VARCHAR;"))
            conn.execute(text("ALTER TABLE orders ADD COLUMN IF NOT EXISTS request VARCHAR;"))
            conn.commit()
            print("Migration successful: added user_phone_snapshot and request to orders table.")
        except Exception as e:
            print(f"Migration failed: {e}")
            conn.rollback()

if __name__ == "__main__":
    migrate()
