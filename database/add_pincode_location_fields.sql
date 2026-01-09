-- Add missing location fields to zone_pincodes table
-- This migration adds district, location_name, village, and others columns

-- Add new columns if they don't exist
ALTER TABLE zone_pincodes 
ADD COLUMN IF NOT EXISTS district VARCHAR(100),
ADD COLUMN IF NOT EXISTS location_name VARCHAR(150),
ADD COLUMN IF NOT EXISTS village VARCHAR(100),
ADD COLUMN IF NOT EXISTS others TEXT;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_zone_pincodes_district ON zone_pincodes(district);
CREATE INDEX IF NOT EXISTS idx_zone_pincodes_location ON zone_pincodes(location_name);

-- Display updated schema
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'zone_pincodes'
ORDER BY ordinal_position;
