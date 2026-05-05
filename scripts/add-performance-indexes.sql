-- Performance indexes
-- Run via psql with a DIRECT connection (not PgBouncer pooler):
--   psql 'YOUR_DIRECT_DATABASE_URL' -f scripts/add-performance-indexes.sql
-- Note: use single quotes around the URL to prevent zsh from interpreting ? and &

-- inventory: speeds up the 60-s soft-reserve cleanup cron
CREATE INDEX IF NOT EXISTS idx_inventory_soft_reserve_expires_at
    ON inventory (soft_reserve_expires_at)
    WHERE soft_reserve_expires_at IS NOT NULL;

-- orders: speeds up user order-history queries
CREATE INDEX IF NOT EXISTS idx_orders_user_id
    ON orders (user_id);

CREATE INDEX IF NOT EXISTS idx_orders_status
    ON orders (status);

CREATE INDEX IF NOT EXISTS idx_orders_created_at_desc
    ON orders (created_at DESC);

-- sub_orders: speeds up SLA cron compound filter
CREATE INDEX IF NOT EXISTS idx_sub_orders_estimated_delivery_at
    ON sub_orders (estimated_delivery_at)
    WHERE estimated_delivery_at IS NOT NULL;
