#!/usr/bin/env python3
"""
[File Role] PWA 설치 통계 DB 제약조건 마이그레이션 전용 실행 스크립트 (Single Source of Truth)
- backend/migrations/20260730_fix_pwa_installation_constraints.sql 파일 로드 및 실행
- PostgreSQL advisory lock 및 단일 트랜잭션 보장
- 적용 직후 verify_pwa_installation_constraints 연계 검증
- Idempotency 보장 (여러 번 실행해도 안전)
"""

import sys
import os
from urllib.parse import urlparse

# backend 디렉토리를 sys.path에 추가
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import create_engine, text
from database import DATABASE_URL, Base
import models  # 테이블 메타데이터 로드
from scripts.verify_pwa_installation_constraints import verify_constraints, mask_url


def apply_migration(engine) -> bool:
    """마이그레이션 SQL을 실행하고 성공 여부를 반환"""
    dialect_name = engine.dialect.name
    print(f"[INFO] Target DB: {mask_url(DATABASE_URL)} (dialect: {dialect_name})")

    if dialect_name == "postgresql":
        migration_file = os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            "migrations",
            "20260730_fix_pwa_installation_constraints.sql"
        )
        if not os.path.exists(migration_file):
            print(f"[ERROR] Migration SQL file not found: {migration_file}")
            return False

        print(f"[INFO] Loading migration SQL: {migration_file}")
        with open(migration_file, "r", encoding="utf-8") as f:
            sql_content = f.read()

        try:
            with engine.begin() as conn:
                conn.execute(text(sql_content))
            print("[INFO] Migration SQL executed successfully under transaction.")
        except Exception as e:
            print(f"[ERROR] Migration execution failed: {e}")
            return False
    else:
        # SQLite 등 기타 DB 환경일 경우 SQLAlchemy DDL 기반 동기화
        print(f"[INFO] Dialect is '{dialect_name}'. Syncing schema via SQLAlchemy metadata...")
        try:
            Base.metadata.create_all(bind=engine)
            with engine.begin() as conn:
                # 고아 데이터 NULL 처리
                conn.execute(text("""
                    UPDATE pwa_installations
                    SET admin_id = NULL
                    WHERE admin_id IS NOT NULL
                      AND NOT EXISTS (SELECT 1 FROM admins WHERE admins.id = pwa_installations.admin_id);
                """))
                conn.execute(text("""
                    UPDATE orders
                    SET pwa_installation_id = NULL
                    WHERE pwa_installation_id IS NOT NULL
                      AND NOT EXISTS (SELECT 1 FROM pwa_installations WHERE pwa_installations.id = orders.pwa_installation_id);
                """))
            print("[INFO] SQLite schema synced and orphans cleaned successfully.")
        except Exception as e:
            print(f"[ERROR] Schema sync failed: {e}")
            return False

    # 적용 직후 verification 실행
    print("[INFO] Running constraint verification after migration...")
    is_passed, _ = verify_constraints(engine, verbose=True)
    return is_passed


def main():
    engine = create_engine(DATABASE_URL)
    success = apply_migration(engine)
    if success:
        print("[SUCCESS] PWA Schema Migration and Verification Completed Successfully.")
        sys.exit(0)
    else:
        print("[FAIL] Migration or Verification Failed.")
        sys.exit(1)


if __name__ == "__main__":
    main()
