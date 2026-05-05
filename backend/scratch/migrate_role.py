import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from database import engine

def run_migration():
    with engine.connect() as conn:
        try:
            # PostgreSQL syntax: Add column with a default value to fill existing rows
            conn.execute(text("ALTER TABLE admins ADD COLUMN role VARCHAR DEFAULT 'MASTER';"))
            print("Successfully added 'role' column to admins table and set existing accounts to MASTER.")
        except Exception as e:
            print(f"Migration failed or column already exists: {e}")
            
        conn.commit()
        print("Migration completed.")

if __name__ == "__main__":
    run_migration()
