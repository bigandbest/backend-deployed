-- Add banner_id column to daily_deals table
-- This allows each daily deal to reference a banner from the central banner system

ALTER TABLE daily_deals 
ADD COLUMN IF NOT EXISTS banner_id UUID REFERENCES add_banner(id) ON DELETE SET NULL;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_daily_deals_banner_id ON daily_deals(banner_id);

-- Verify the column was added
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'daily_deals' AND column_name = 'banner_id';
