-- ===================================================================
-- PWA 설치 통계 DB 제약조건 검증 및 안전한 마이그레이션 SQL (Single Source of Truth)
-- Migration Date: 2026-07-30
-- Description:
-- 1. PostgreSQL advisory xact lock으로 동시 마이그레이션 실행 안전성 확보
-- 2. pwa_installations 테이블 및 인덱스 기본 구조 보장
-- 3. pwa_installations.admin_id -> admins(id) ON DELETE SET NULL 외래키 정규화 (중복 및 잘못된 users.id 참조 완전 제거)
-- 4. orders.pwa_installation_id -> pwa_installations(id) ON DELETE SET NULL 외래키 정규화 (중복 제거)
-- 5. 고아 참조(Orphan records) 레코드 삭제 없이 해당 FK 컬럼만 NULL 안전 처리
-- ===================================================================

-- 0. 동시성 안전을 위한 PostgreSQL advisory transaction lock
SELECT pg_advisory_xact_lock(987654321);

-- 1. pwa_installations 테이블 생성 (없는 경우)
CREATE TABLE IF NOT EXISTS pwa_installations (
    id SERIAL PRIMARY KEY,
    installation_id VARCHAR(64) NOT NULL,
    app_type VARCHAR(20) NOT NULL,
    platform VARCHAR(20) NOT NULL DEFAULT 'UNKNOWN',
    browser_family VARCHAR(20) NOT NULL DEFAULT 'UNKNOWN',
    first_seen_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    first_standalone_at TIMESTAMP WITH TIME ZONE,
    last_standalone_at TIMESTAMP WITH TIME ZONE,
    last_detection_method VARCHAR(30) NOT NULL DEFAULT 'UNKNOWN',
    push_permission VARCHAR(20) NOT NULL DEFAULT 'UNKNOWN',
    related_app_installed BOOLEAN,
    admin_id INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_pwa_installation_id_app_type UNIQUE (installation_id, app_type)
);

CREATE INDEX IF NOT EXISTS ix_pwa_installations_installation_id ON pwa_installations (installation_id);
CREATE INDEX IF NOT EXISTS ix_pwa_installations_last_seen_at ON pwa_installations (last_seen_at);

-- 2. pwa_installations.admin_id 관련 모든 기존 FK 드롭 (중복 및 users.id 오참조, NO ACTION 전부 정리)
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT tc.constraint_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
         AND tc.constraint_schema = kcu.constraint_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND kcu.table_name = 'pwa_installations'
          AND kcu.column_name = 'admin_id'
    ) LOOP
        EXECUTE 'ALTER TABLE pwa_installations DROP CONSTRAINT IF EXISTS ' || quote_ident(r.constraint_name);
    END LOOP;
END $$;

-- 3. admins 테이블에 존재하지 않는 admin_id 고아 데이터 NULL 처리 (행 삭제 없음)
UPDATE pwa_installations p
SET admin_id = NULL
WHERE admin_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM admins a WHERE a.id = p.admin_id
  );

-- 4. pwa_installations.admin_id -> admins(id) ON DELETE SET NULL 단일 외래키 생성
ALTER TABLE pwa_installations
ADD CONSTRAINT fk_pwa_installations_admin_id
FOREIGN KEY (admin_id)
REFERENCES admins(id)
ON DELETE SET NULL;

-- 5. pwa_installations(admin_id) 인덱스 생성
CREATE INDEX IF NOT EXISTS ix_pwa_installations_admin_id ON pwa_installations(admin_id);

-- 6. orders.pwa_installation_id 컬럼 추가 (없는 경우)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pwa_installation_id INTEGER;

-- 7. orders.pwa_installation_id 관련 모든 기존 FK 드롭 (중복 제거 및 정규화)
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT tc.constraint_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
         AND tc.constraint_schema = kcu.constraint_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND kcu.table_name = 'orders'
          AND kcu.column_name = 'pwa_installation_id'
    ) LOOP
        EXECUTE 'ALTER TABLE orders DROP CONSTRAINT IF EXISTS ' || quote_ident(r.constraint_name);
    END LOOP;
END $$;

-- 8. pwa_installations에 존재하지 않는 pwa_installation_id 고아 주문 데이터 NULL 처리 (행 삭제 없음)
UPDATE orders o
SET pwa_installation_id = NULL
WHERE pwa_installation_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM pwa_installations p WHERE p.id = o.pwa_installation_id
  );

-- 9. orders.pwa_installation_id -> pwa_installations(id) ON DELETE SET NULL 단일 외래키 생성
ALTER TABLE orders
ADD CONSTRAINT fk_orders_pwa_installation_id
FOREIGN KEY (pwa_installation_id)
REFERENCES pwa_installations(id)
ON DELETE SET NULL;

-- 10. orders(pwa_installation_id) 인덱스 생성
CREATE INDEX IF NOT EXISTS ix_orders_pwa_installation_id ON orders(pwa_installation_id);
