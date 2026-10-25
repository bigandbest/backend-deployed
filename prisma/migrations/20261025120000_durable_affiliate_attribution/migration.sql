ALTER TABLE orders
  ADD COLUMN affiliate_attribution JSONB,
  ADD COLUMN affiliate_attribution_processed_at TIMESTAMPTZ(6),
  ADD COLUMN affiliate_attribution_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN affiliate_attribution_error TEXT;
CREATE INDEX orders_affiliate_attribution_processed_at_created_at_idx
  ON orders (affiliate_attribution_processed_at, created_at);
