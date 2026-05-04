import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from database import engine

def run_migration():
    with engine.connect() as conn:
        try:
            conn.execute(text("ALTER TABLE admins ADD COLUMN is_active BOOLEAN DEFAULT TRUE;"))
            print("Successfully added 'is_active' column.")
        except Exception as e:
            print(f"Column 'is_active' might already exist: {e}")
            
        try:
            conn.execute(text("ALTER TABLE admins ADD COLUMN last_login_at TIMESTAMP WITH TIME ZONE;"))
            print("Successfully added 'last_login_at' column.")
        except Exception as e:
            print(f"Column 'last_login_at' might already exist: {e}")
            
        conn.commit()
        print("Migration completed.")

if __name__ == "__main__":
    run_migration()
