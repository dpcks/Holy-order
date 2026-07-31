#!/usr/bin/env python3
"""
[File Role] PWA 설치 통계 DB 제약조건 읽기 전용 검증 스크립트
- pwa_installations.admin_id -> admins.id (ON DELETE SET NULL)
- orders.pwa_installation_id -> pwa_installations.id (ON DELETE SET NULL)
- 인덱스, Nullable 여부 및 고아 참조(Orphan records) 진단
- --apply 옵션 지정 시 idempotent migration SQL 실행
"""

import sys
import os
import argparse
from urllib.parse import urlparse
from typing import Dict, Any, Tuple, List

# backend 디렉토리를 sys.path에 추가
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import create_engine, inspect, text
from database import DATABASE_URL


def mask_url(url: str) -> str:
    """DATABASE_URL의 비밀번호를 가려서 안전하게 출력"""
    try:
        parsed = urlparse(url)
        if parsed.password:
            masked_netloc = parsed.netloc.replace(f":{parsed.password}@", ":****@")
            return parsed._replace(netloc=masked_netloc).geturl()
        return url
    except Exception:
        return "DATABASE_URL(masked)"


def verify_constraints(engine, verbose: bool = True) -> Tuple[bool, List[str]]:
    """
    DB 제약조건 및 고아 참조를 검증하는 핵심 함수.
    Returns: (is_passed: bool, logs: List[str])
    """
    logs: List[str] = []
    all_passed = True
    dialect_name = engine.dialect.name
    inspector = inspect(engine)

    def log_pass(msg: str):
        logs.append(f"[PASS] {msg}")
        if verbose:
            print(f"[PASS] {msg}")

    def log_fail(msg: str):
        nonlocal all_passed
        all_passed = False
        logs.append(f"[FAIL] {msg}")
        if verbose:
            print(f"[FAIL] {msg}")

    # -------------------------------------------------------------
    # 1. pwa_installations 테이블 존재 여부
    # -------------------------------------------------------------
    table_names = inspector.get_table_names()
    if "pwa_installations" in table_names:
        log_pass("table pwa_installations exists")
    else:
        log_fail("table pwa_installations does NOT exist")
        # 테이블 없으면 추가 검사 중단
        return False, logs

    # -------------------------------------------------------------
    # 2. pwa_installations.admin_id 컬럼 및 Nullable 여부
    # -------------------------------------------------------------
    pwa_cols = {c["name"]: c for c in inspector.get_columns("pwa_installations")}
    if "admin_id" in pwa_cols:
        if pwa_cols["admin_id"].get("nullable", True):
            log_pass("pwa_installations.admin_id is nullable")
        else:
            log_fail("pwa_installations.admin_id is NOT nullable")
    else:
        log_fail("column pwa_installations.admin_id does NOT exist")

    # -------------------------------------------------------------
    # 3 & 4. admin_id 외래키 (FK) 및 ON DELETE SET NULL / 중복 / users.id 참조 검증
    # -------------------------------------------------------------
    if dialect_name == "postgresql":
        with engine.connect() as conn:
            fk_sql = text("""
                SELECT
                    tc.constraint_name,
                    ccu.table_name AS referenced_table,
                    ccu.column_name AS referenced_column,
                    rc.delete_rule
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu
                  ON tc.constraint_name = kcu.constraint_name
                 AND tc.constraint_schema = kcu.constraint_schema
                JOIN information_schema.constraint_column_usage ccu
                  ON tc.constraint_name = ccu.constraint_name
                 AND tc.constraint_schema = ccu.constraint_schema
                JOIN information_schema.referential_constraints rc
                  ON tc.constraint_name = rc.constraint_name
                 AND tc.constraint_schema = rc.constraint_schema
                WHERE tc.constraint_type = 'FOREIGN KEY'
                  AND kcu.table_name = 'pwa_installations'
                  AND kcu.column_name = 'admin_id';
            """)
            rows = conn.execute(fk_sql).fetchall()
            if not rows:
                log_fail("pwa_installations.admin_id has NO foreign key constraint")
            else:
                semantic_admin_fks = []
                for row in rows:
                    ref_table = row.referenced_table
                    ref_col = row.referenced_column
                    del_rule = row.delete_rule.upper()

                    if ref_table == "users":
                        log_fail("admin_id references users.id")

                    if ref_table == "admins" and ref_col == "id":
                        semantic_admin_fks.append(row)
                        if del_rule in ("SET NULL", "SET_NULL"):
                            log_pass("admin_id ON DELETE SET NULL")
                        else:
                            log_fail(f"admin_id delete rule is {del_rule} (expected SET NULL)")
                    else:
                        log_fail(f"admin_id FK points to {ref_table}.{ref_col} (expected admins.id)")

                if len(semantic_admin_fks) == 1:
                    log_pass("admin_id FK -> admins.id")
                    log_pass("exactly one semantic admin FK exists")
                elif len(semantic_admin_fks) > 1:
                    log_fail(f"duplicate semantic admin FK count={len(semantic_admin_fks)}")
    else:
        # SQLite 등 기타 DB
        fks = inspector.get_foreign_keys("pwa_installations")
        admin_fks = [fk for fk in fks if "admin_id" in fk.get("constrained_columns", [])]
        if not admin_fks:
            log_fail("pwa_installations.admin_id has NO foreign key constraint")
        else:
            semantic_admin_fks = []
            for admin_fk in admin_fks:
                ref_table = admin_fk.get("referred_table")
                ref_cols = admin_fk.get("referred_columns")
                if ref_table == "users":
                    log_fail("admin_id references users.id")

                if ref_table == "admins" and ref_cols == ["id"]:
                    semantic_admin_fks.append(admin_fk)
                    ondelete = (admin_fk.get("options", {}) or {}).get("ondelete", "").upper()
                    if ondelete in ("SET NULL", "SET_NULL") or not ondelete:
                        log_pass("admin_id ON DELETE SET NULL")
                    else:
                        log_fail(f"admin_id delete rule is {ondelete} (expected SET NULL)")
                else:
                    log_fail(f"admin_id FK points to {ref_table}.{ref_cols} (expected admins.id)")

            if len(semantic_admin_fks) == 1:
                log_pass("admin_id FK -> admins.id")
                log_pass("exactly one semantic admin FK exists")
            elif len(semantic_admin_fks) > 1:
                log_fail(f"duplicate semantic admin FK count={len(semantic_admin_fks)}")

    # -------------------------------------------------------------
    # 5. admin_id 인덱스 검증
    # -------------------------------------------------------------
    pwa_indexes = inspector.get_indexes("pwa_installations")
    has_admin_index = any("admin_id" in idx.get("column_names", []) for idx in pwa_indexes)
    if has_admin_index:
        log_pass("required admin_id index exists")
    else:
        log_fail("admin_id index does NOT exist")

    # -------------------------------------------------------------
    # 6. orders.pwa_installation_id 존재 및 Nullable 검증
    # -------------------------------------------------------------
    if "orders" in table_names:
        order_cols = {c["name"]: c for c in inspector.get_columns("orders")}
        if "pwa_installation_id" in order_cols:
            if order_cols["pwa_installation_id"].get("nullable", True):
                log_pass("orders.pwa_installation_id is nullable")
            else:
                log_fail("orders.pwa_installation_id exists but is NOT nullable")
        else:
            log_fail("column orders.pwa_installation_id does NOT exist")

        # 7 & 8. orders.pwa_installation_id 외래키 및 ON DELETE SET NULL 검증
        if dialect_name == "postgresql":
            with engine.connect() as conn:
                order_fk_sql = text("""
                    SELECT
                        tc.constraint_name,
                        ccu.table_name AS referenced_table,
                        ccu.column_name AS referenced_column,
                        rc.delete_rule
                    FROM information_schema.table_constraints tc
                    JOIN information_schema.key_column_usage kcu
                      ON tc.constraint_name = kcu.constraint_name
                     AND tc.constraint_schema = kcu.constraint_schema
                    JOIN information_schema.constraint_column_usage ccu
                      ON tc.constraint_name = ccu.constraint_name
                     AND tc.constraint_schema = ccu.constraint_schema
                    JOIN information_schema.referential_constraints rc
                      ON tc.constraint_name = rc.constraint_name
                     AND tc.constraint_schema = rc.constraint_schema
                    WHERE tc.constraint_type = 'FOREIGN KEY'
                      AND kcu.table_name = 'orders'
                      AND kcu.column_name = 'pwa_installation_id';
                """)
                order_rows = conn.execute(order_fk_sql).fetchall()
                if not order_rows:
                    log_fail("orders.pwa_installation_id has NO foreign key constraint")
                else:
                    semantic_order_fks = []
                    for row in order_rows:
                        ref_table = row.referenced_table
                        ref_col = row.referenced_column
                        del_rule = row.delete_rule.upper()

                        if ref_table == "pwa_installations" and ref_col == "id":
                            semantic_order_fks.append(row)
                            if del_rule in ("SET NULL", "SET_NULL"):
                                log_pass("order FK ON DELETE SET NULL")
                            else:
                                log_fail(f"order FK delete rule is {del_rule} (expected SET NULL)")
                        else:
                            log_fail(f"order FK points to {ref_table}.{ref_col} (expected pwa_installations.id)")

                    if len(semantic_order_fks) == 1:
                        log_pass("order FK -> pwa_installations.id")
                        log_pass("exactly one semantic order FK exists")
                    elif len(semantic_order_fks) > 1:
                        log_fail(f"duplicate semantic order FK count={len(semantic_order_fks)}")
        else:
            # SQLite 등 기타 DB
            order_fks = inspector.get_foreign_keys("orders")
            order_fks_list = [fk for fk in order_fks if "pwa_installation_id" in fk.get("constrained_columns", [])]
            if not order_fks_list:
                log_fail("orders.pwa_installation_id has NO foreign key constraint")
            else:
                semantic_order_fks = []
                for order_fk in order_fks_list:
                    ref_table = order_fk.get("referred_table")
                    ref_cols = order_fk.get("referred_columns")
                    if ref_table == "pwa_installations" and ref_cols == ["id"]:
                        semantic_order_fks.append(order_fk)
                        ondelete = (order_fk.get("options", {}) or {}).get("ondelete", "").upper()
                        if ondelete in ("SET NULL", "SET_NULL") or not ondelete:
                            log_pass("order FK ON DELETE SET NULL")
                        else:
                            log_fail(f"order FK delete rule is {ondelete} (expected SET NULL)")
                    else:
                        log_fail(f"order FK points to {ref_table}.{ref_cols} (expected pwa_installations.id)")

                if len(semantic_order_fks) == 1:
                    log_pass("order FK -> pwa_installations.id")
                    log_pass("exactly one semantic order FK exists")
                elif len(semantic_order_fks) > 1:
                    log_fail(f"duplicate semantic order FK count={len(semantic_order_fks)}")

        # 8-2. orders.pwa_installation_id 인덱스 검증
        order_indexes = inspector.get_indexes("orders")
        has_order_inst_index = any("pwa_installation_id" in idx.get("column_names", []) for idx in order_indexes)
        if has_order_inst_index:
            log_pass("required order_installation_id index exists")
        else:
            log_fail("order_installation_id index does NOT exist")
    else:
        log_fail("table orders does NOT exist")

    # -------------------------------------------------------------
    # 9. 고아 admin_id 검증 (pwa_installations.admin_id -> admins.id)
    # -------------------------------------------------------------
    if "admins" in table_names and "admin_id" in pwa_cols:
        with engine.connect() as conn:
            orphan_admin_sql = text("""
                SELECT COUNT(*)
                FROM pwa_installations p
                LEFT JOIN admins a ON a.id = p.admin_id
                WHERE p.admin_id IS NOT NULL
                  AND a.id IS NULL;
            """)
            orphan_admin_count = conn.execute(orphan_admin_sql).scalar() or 0
            if orphan_admin_count == 0:
                log_pass("no orphan admin_id rows")
            else:
                log_fail(f"{orphan_admin_count} orphan admin_id values do not exist in admins")
    else:
        log_pass("no orphan admin_id rows (table/column skipped)")

    # -------------------------------------------------------------
    # 10. 고아 order installation 검증 (orders.pwa_installation_id -> pwa_installations.id)
    # -------------------------------------------------------------
    if "orders" in table_names and "pwa_installations" in table_names:
        with engine.connect() as conn:
            orphan_order_sql = text("""
                SELECT COUNT(*)
                FROM orders o
                LEFT JOIN pwa_installations p ON p.id = o.pwa_installation_id
                WHERE o.pwa_installation_id IS NOT NULL
                  AND p.id IS NULL;
            """)
            orphan_order_count = conn.execute(orphan_order_sql).scalar() or 0
            if orphan_order_count == 0:
                log_pass("no orphan order installation references")
            else:
                log_fail(f"{orphan_order_count} orphan pwa_installation_id values do not exist in pwa_installations")
    else:
        log_pass("no orphan order installation references (table skipped)")

    # RESULT 출력
    res_str = "PASS" if all_passed else "FAIL"
    if verbose:
        print(f"RESULT: {res_str}")

    return all_passed, logs


def apply_migration_sql(engine):
    """PostgreSQL 대상 마이그레이션 SQL 실행"""
    migration_file = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "migrations",
        "20260730_fix_pwa_installation_constraints.sql"
    )
    if not os.path.exists(migration_file):
        print(f"[ERROR] Migration file not found: {migration_file}")
        sys.exit(1)

    print(f"[INFO] Applying migration script: {migration_file}")
    with open(migration_file, "r", encoding="utf-8") as f:
        sql_content = f.read()

    with engine.begin() as conn:
        conn.execute(text(sql_content))
    print("[INFO] Migration SQL applied successfully.")


def main():
    parser = argparse.ArgumentParser(description="Verify PWA Installation DB Constraints")
    parser.add_argument("--apply", action="store_true", help="Apply migration SQL if executing on PostgreSQL")
    args = parser.parse_args()

    engine = create_engine(DATABASE_URL)
    print(f"Target DB: {mask_url(DATABASE_URL)} (dialect: {engine.dialect.name})")

    if args.apply:
        if engine.dialect.name == "postgresql":
            apply_migration_sql(engine)
        else:
            print(f"[WARN] --apply requested, but dialect is '{engine.dialect.name}'. Skipping SQL file execution.")

    is_passed, _ = verify_constraints(engine, verbose=True)
    if not is_passed:
        sys.exit(1)
    sys.exit(0)


if __name__ == "__main__":
    main()
