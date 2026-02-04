-- Fix foreign key constraint for zone_pincodes to enable CASCADE delete
-- This ensures when a delivery zone is deleted, all associated pincodes are automatically deleted

-- First, drop the existing constraint
ALTER TABLE zone_pincodes 
DROP CONSTRAINT IF EXISTS zone_pincodes_zone_id_fkey;

-- Recreate with ON DELETE CASCADE
ALTER TABLE zone_pincodes 
ADD CONSTRAINT zone_pincodes_zone_id_fkey 
FOREIGN KEY (zone_id) 
REFERENCES delivery_zones(id) 
ON DELETE CASCADE;

-- Verify the constraint
SELECT
    tc.constraint_name,
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name,
    rc.delete_rule
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
JOIN information_schema.referential_constraints AS rc
    ON tc.constraint_name = rc.constraint_name
WHERE tc.table_name = 'zone_pincodes' 
    AND tc.constraint_type = 'FOREIGN KEY'
    AND kcu.column_name = 'zone_id';
