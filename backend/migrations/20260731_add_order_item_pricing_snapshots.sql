-- ===================================================================
-- order_items 테이블 서버 권위 가격 및 옵션 스냅샷 컬럼 추가 마이그레이션 (31번)
-- Migration Date: 2026-07-31
-- ===================================================================

-- 0. 동시성 안전을 위한 PostgreSQL advisory transaction lock
SELECT pg_advisory_xact_lock(987654322);

-- 1. order_items 스냅샷 확장 컬럼 추가 (없는 경우)
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS pricing_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS option_price_snapshot INTEGER;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS discount_per_unit_snapshot INTEGER;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS discount_total_snapshot INTEGER;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS unit_price_snapshot INTEGER;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS selected_options_snapshot JSONB;

-- 2. 기존 데이터 pricing_version 1로 업데이트 (안전 보장)
UPDATE order_items
SET pricing_version = 1
WHERE pricing_version IS NULL;
