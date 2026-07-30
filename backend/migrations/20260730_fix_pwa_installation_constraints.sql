-- ===================================================================
-- PWA 설치 통계 DB 제약조건 검증 및 안전한 마이그레이션 SQL
-- Migration Date: 2026-07-30
-- Description:
-- 1. pwa_installations.admin_id -> admins(id) ON DELETE SET NULL 외래키 및 인덱스 정합화
-- 2. orders.pwa_installation_id -> pwa_installations(id) ON DELETE SET NULL 외래키 및 인덱스 정합화
-- 3. 고아 참조(Orphan records) NULL 안전 처리 (idempotent)
-- ===================================================================

-- 1. pwa_installations.admin_id 중 admins가 아니거나 ON DELETE SET NULL이 아닌 잘못된 FK 삭제
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
        JOIN information_schema.constraint_column_usage ccu
          ON tc.constraint_name = ccu.constraint_name
         AND tc.constraint_schema = ccu.constraint_schema
        JOIN information_schema.referential_constraints rc
          ON tc.constraint_name = rc.constraint_name
         AND tc.constraint_schema = rc.constraint_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND kcu.table_name = 'pwa_installations'
          AND kcu.column_name = 'admin_id'
          AND (ccu.table_name != 'admins' OR ccu.column_name != 'id' OR UPPER(rc.delete_rule) != 'SET NULL')
    ) LOOP
        EXECUTE 'ALTER TABLE pwa_installations DROP CONSTRAINT IF EXISTS ' || quote_ident(r.constraint_name);
    END LOOP;
END $$;

-- 2. admins 테이블에 존재하지 않는 admin_id 고아 데이터 NULL 처리
UPDATE pwa_installations p
SET admin_id = NULL
WHERE admin_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM admins a WHERE a.id = p.admin_id
  );

-- 3. pwa_installations.admin_id -> admins(id) ON DELETE SET NULL 외래키 추가 (없는 경우)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
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
          AND kcu.column_name = 'admin_id'
          AND ccu.table_name = 'admins'
          AND ccu.column_name = 'id'
          AND UPPER(rc.delete_rule) = 'SET NULL'
    ) THEN
        ALTER TABLE pwa_installations
        ADD CONSTRAINT fk_pwa_installations_admin_id
        FOREIGN KEY (admin_id)
        REFERENCES admins(id)
        ON DELETE SET NULL;
    END IF;
END $$;

-- 4. pwa_installations(admin_id) 인덱스 추가 (없는 경우)
CREATE INDEX IF NOT EXISTS ix_pwa_installations_admin_id ON pwa_installations(admin_id);

-- 5. orders.pwa_installation_id 컬럼 추가 (없는 경우)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pwa_installation_id INTEGER;

-- 6. orders.pwa_installation_id 잘못된 FK 제거 (pwa_installations.id가 아니거나 ON DELETE SET NULL이 아닌 경우)
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
        JOIN information_schema.constraint_column_usage ccu
          ON tc.constraint_name = ccu.constraint_name
         AND tc.constraint_schema = ccu.constraint_schema
        JOIN information_schema.referential_constraints rc
          ON tc.constraint_name = rc.constraint_name
         AND tc.constraint_schema = rc.constraint_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND kcu.table_name = 'orders'
          AND kcu.column_name = 'pwa_installation_id'
          AND (ccu.table_name != 'pwa_installations' OR ccu.column_name != 'id' OR UPPER(rc.delete_rule) != 'SET NULL')
    ) LOOP
        EXECUTE 'ALTER TABLE orders DROP CONSTRAINT IF EXISTS ' || quote_ident(r.constraint_name);
    END LOOP;
END $$;

-- 7. pwa_installations에 존재하지 않는 pwa_installation_id 고아 주문 데이터 NULL 처리
UPDATE orders o
SET pwa_installation_id = NULL
WHERE pwa_installation_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM pwa_installations p WHERE p.id = o.pwa_installation_id
  );

-- 8. orders.pwa_installation_id -> pwa_installations(id) ON DELETE SET NULL 외래키 추가 (없는 경우)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
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
          AND kcu.column_name = 'pwa_installation_id'
          AND ccu.table_name = 'pwa_installations'
          AND ccu.column_name = 'id'
          AND UPPER(rc.delete_rule) = 'SET NULL'
    ) THEN
        ALTER TABLE orders
        ADD CONSTRAINT fk_orders_pwa_installation_id
        FOREIGN KEY (pwa_installation_id)
        REFERENCES pwa_installations(id)
        ON DELETE SET NULL;
    END IF;
END $$;

-- 9. orders(pwa_installation_id) 인덱스 추가 (없는 경우)
CREATE INDEX IF NOT EXISTS ix_orders_pwa_installation_id ON orders(pwa_installation_id);
