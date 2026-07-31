#!/usr/bin/env python3
"""
[File Role] order_items 스냅샷 컬럼 마이그레이션 실행 스크립트 (31번)
"""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import create_engine, text
from database import DATABASE_URL, Base
import models
from scripts.verify_pwa_installation_constraints import mask_url


def apply_migration(engine) -> bool:
    dialect_name = engine.dialect.name
    print(f"[INFO] Target DB: {mask_url(DATABASE_URL)} (dialect: {dialect_name})")

    if dialect_name == "postgresql":
        migration_file = os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            "migrations",
            "20260731_add_order_item_pricing_snapshots.sql"
        )
        if not os.path.exists(migration_file):
            print(f"[ERROR] Migration SQL file not found: {migration_file}")
            return False

        with open(migration_file, "r", encoding="utf-8") as f:
            sql_content = f.read()

        try:
            with engine.begin() as conn:
                conn.execute(text(sql_content))
            print("[INFO] Pricing Snapshot Migration SQL executed successfully.")
        except Exception as e:
            print(f"[ERROR] Migration execution failed: {e}")
            return False
    else:
        print(f"[INFO] Syncing schema via SQLAlchemy metadata for dialect '{dialect_name}'...")
        try:
            Base.metadata.create_all(bind=engine)
            print("[INFO] Schema synced via metadata successfully.")
        except Exception as e:
            print(f"[ERROR] Schema sync failed: {e}")
            return False

    return True


def main():
    engine = create_engine(DATABASE_URL)
    if apply_migration(engine):
        print("[SUCCESS] Pricing Snapshot Migration Completed Successfully.")
        sys.exit(0)
    else:
        print("[FAIL] Migration Failed.")
        sys.exit(1)


if __name__ == "__main__":
    main()
