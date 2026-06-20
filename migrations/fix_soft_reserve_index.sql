-- Drop the broad index that includes NULL rows and bloats the index
DROP INDEX IF EXISTS inventory_soft_reserve_expires_at_idx;

-- Partial index: only rows with an active soft reservation
-- This is the exact set the expiry-cleanup UPDATE hits every time
CREATE INDEX IF NOT EXISTS idx_inventory_soft_reserve_active
  ON inventory (soft_reserve_expires_at)
  WHERE soft_reserve_expires_at IS NOT NULL
    AND soft_reserved_qty > 0;
