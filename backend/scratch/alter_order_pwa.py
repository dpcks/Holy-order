import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))
from database import SessionLocal
from sqlalchemy import text

def add_is_pwa_column():
    db = SessionLocal()
    try:
        # Check if the column exists first
        result = db.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='orders' AND column_name='is_pwa';")).fetchone()
        if not result:
            print("Adding is_pwa column to orders table...")
            db.execute(text("ALTER TABLE orders ADD COLUMN is_pwa BOOLEAN DEFAULT FALSE;"))
            db.commit()
            print("Column added successfully.")
        else:
            print("Column is_pwa already exists.")
    except Exception as e:
        print(f"Error: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    add_is_pwa_column()
