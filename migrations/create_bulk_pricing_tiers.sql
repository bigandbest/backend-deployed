-- Migration: Create bulk_pricing_tiers table and migrate existing single-tier bulk data
-- Wrapped in a transaction: if anything fails, the entire migration rolls back — no partial state.

BEGIN;

-- 1. Create the new tiered bulk pricing table
CREATE TABLE IF NOT EXISTS bulk_pricing_tiers (
  id           SERIAL      PRIMARY KEY,
  variant_id   UUID        NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  min_quantity INT         NOT NULL,
  max_quantity INT         NULL,
  unit_price   DECIMAL     NOT NULL,
  sort_order   INT         NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bulk_pricing_tiers_variant ON bulk_pricing_tiers(variant_id);

-- 2. Migrate existing single-tier data BEFORE dropping old columns (no data loss)
INSERT INTO bulk_pricing_tiers (variant_id, min_quantity, unit_price, sort_order)
SELECT id, bulk_min_quantity, bulk_price, 0
FROM product_variants
WHERE is_bulk_enabled = true
  AND bulk_min_quantity IS NOT NULL
  AND bulk_price IS NOT NULL
  AND CAST(bulk_price AS DECIMAL) > 0
ON CONFLICT DO NOTHING;

-- 3. Drop old bulk columns only after data is safely migrated
ALTER TABLE product_variants
  DROP COLUMN IF EXISTS is_bulk_enabled,
  DROP COLUMN IF EXISTS bulk_price,
  DROP COLUMN IF EXISTS bulk_min_quantity;

COMMIT;
