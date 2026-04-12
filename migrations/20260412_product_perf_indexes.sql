-- Performance indexes for the product detail page and related endpoints.
-- All statements use IF NOT EXISTS so this file is safe to re-run.
-- TODO: verify table/column names against your live schema before applying.

-- ── Core product lookup ───────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_products_id
  ON products(id);

-- ── Variant lookup by product ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_product_variants_product_id
  ON product_variants(product_id);

-- ── Warehouse / inventory stock lookup ───────────────────────────────────────
-- product_warehouse_stock is the current inventory model
CREATE INDEX IF NOT EXISTS idx_product_warehouse_stock_product_id
  ON product_warehouse_stock(product_id);

CREATE INDEX IF NOT EXISTS idx_product_warehouse_stock_variant_id
  ON product_warehouse_stock(variant_id);

-- inventory is the legacy model (still queried by warehouseService)
-- TODO: confirm 'inventory' table still exists in your schema
CREATE INDEX IF NOT EXISTS idx_inventory_warehouse_id
  ON inventory(warehouse_id);

-- ── Related products (by category / subcategory) ──────────────────────────────
CREATE INDEX IF NOT EXISTS idx_products_category_id
  ON products(category_id);

CREATE INDEX IF NOT EXISTS idx_products_subcategory_id
  ON products(subcategory_id);

-- ── Brand association ─────────────────────────────────────────────────────────
-- TODO: verify table name; Prisma schema shows product_brand (singular)
CREATE INDEX IF NOT EXISTS idx_product_brand_product_id
  ON product_brand(product_id);

-- ── Reviews lookup ────────────────────────────────────────────────────────────
-- Prisma model is product_reviews, not reviews
CREATE INDEX IF NOT EXISTS idx_product_reviews_product_id
  ON product_reviews(product_id);

-- ── Out-of-stock notifications ────────────────────────────────────────────────
-- Prisma model is stock_notify_requests, not out_of_stock_notifications
CREATE INDEX IF NOT EXISTS idx_stock_notify_requests_product_variant
  ON stock_notify_requests(product_id, variant_id);

-- ── Coupon lookup (used by getAvailableCoupons) ───────────────────────────────
CREATE INDEX IF NOT EXISTS idx_coupons_status_valid
  ON coupons(status, valid_from, valid_to);

-- ── Warehouse pincode mapping (hot path in warehouse lookup) ──────────────────
CREATE INDEX IF NOT EXISTS idx_warehouse_pincodes_pincode
  ON warehouse_pincodes(pincode)
  WHERE is_active = true;

-- ── Zone pincode mapping ──────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_zone_pincodes_pincode
  ON zone_pincodes(pincode)
  WHERE is_active = true;
