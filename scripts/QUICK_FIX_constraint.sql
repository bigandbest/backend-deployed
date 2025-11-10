-- QUICK FIX: Update constraint to allow all warehouse mapping types
-- Run this directly in Supabase SQL Editor

-- Drop existing constraint
ALTER TABLE products
DROP CONSTRAINT IF EXISTS products_warehouse_mapping_type_check;

-- Add updated constraint with all required values
ALTER TABLE products
ADD CONSTRAINT products_warehouse_mapping_type_check
CHECK (warehouse_mapping_type IN ('nationwide', 'zonal', 'custom', 'central', 'zonal_with_fallback'));

-- Verify the fix
SELECT 'Constraint updated successfully' as status;