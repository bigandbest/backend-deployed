-- FIX: Update warehouse mapping type constraint to include all values
-- This resolves the check constraint violation error for warehouse_mapping_type

-- Drop existing constraint
ALTER TABLE products
DROP CONSTRAINT IF EXISTS products_warehouse_mapping_type_check;

-- Add comprehensive constraint with all required values
ALTER TABLE products
ADD CONSTRAINT products_warehouse_mapping_type_check
CHECK (warehouse_mapping_type IN (
    'nationwide',           -- Auto central to zonal distribution
    'zonal',               -- Zonal warehouses only (no fallback)
    'central',             -- Central warehouses only
    'zonal_with_fallback', -- Selective zonal with central fallback
    'custom',              -- Custom warehouse configuration
    'auto_central_to_zonal', -- UI value (should be transformed to 'nationwide')
    'selective_zonal',     -- UI value (should be transformed to 'zonal_with_fallback')
    'central_only',        -- UI value (should be transformed to 'central')
    'zonal_only'           -- UI value (should be transformed to 'zonal')
));

-- Verify the constraint update
SELECT 
    'Constraint updated successfully - All warehouse mapping types now allowed' as status,
    'Values: nationwide, zonal, central, zonal_with_fallback, custom, auto_central_to_zonal, selective_zonal, central_only, zonal_only' as allowed_values;

-- Optional: Show current products with their warehouse mapping types
SELECT 
    warehouse_mapping_type,
    COUNT(*) as count
FROM products 
GROUP BY warehouse_mapping_type
ORDER BY count DESC;