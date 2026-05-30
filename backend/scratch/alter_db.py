import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))
from dotenv import load_dotenv
import os
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))
from database import SessionLocal
from sqlalchemy import text

def add_show_price_column():
    db = SessionLocal()
    try:
        # Check if the column exists first
        result = db.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='settings' AND column_name='show_price';")).fetchone()
        if not result:
            print("Adding show_price column to settings table...")
            db.execute(text("ALTER TABLE settings ADD COLUMN show_price BOOLEAN DEFAULT TRUE;"))
            db.commit()
            print("Column added successfully.")
        else:
            print("Column show_price already exists.")
    except Exception as e:
        print(f"Error: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    add_show_price_column()
