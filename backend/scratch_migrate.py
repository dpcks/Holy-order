import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from config import settings
from sqlalchemy import create_engine, text

def alter_db():
    engine = create_engine(settings.DATABASE_URL)
    with engine.begin() as conn:
        print("Checking if is_pwa column exists...")
        result = conn.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='orders' AND column_name='is_pwa';")).fetchone()
        if not result:
            print("Adding is_pwa column to orders...")
            conn.execute(text("ALTER TABLE orders ADD COLUMN is_pwa BOOLEAN DEFAULT FALSE;"))
            print("Added.")
        else:
            print("Already exists.")

if __name__ == "__main__":
    alter_db()
