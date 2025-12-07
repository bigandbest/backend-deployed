-- Variant Warehouse Stock Migration
-- Created: 2025-12-07
-- Description: Extends product_warehouse_stock table to support variant-level stock tracking
-- This migration is backward compatible - existing records will have NULL variant_id (base product)

-- Step 1: Add variant_id column to product_warehouse_stock table
DO $$
BEGIN
    RAISE NOTICE 'Starting variant warehouse stock migration...';

    -- Add variant_id column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'product_warehouse_stock' 
        AND column_name = 'variant_id'
    ) THEN
        ALTER TABLE product_warehouse_stock 
        ADD COLUMN variant_id UUID DEFAULT NULL 
        REFERENCES product_variants(id) ON DELETE CASCADE;
        
        RAISE NOTICE '✅ Added variant_id column to product_warehouse_stock';
    ELSE
        RAISE NOTICE '⚠️  variant_id column already exists';
    END IF;

EXCEPTION 
    WHEN OTHERS THEN
        RAISE NOTICE '❌ Error adding variant_id column: %', SQLERRM;
END $$;

-- Step 2: Drop existing unique constraint and create new one
DO $$
BEGIN
    -- Drop the old unique constraint on (product_id, warehouse_id)
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'product_warehouse_stock_product_id_warehouse_id_key' 
        AND table_name = 'product_warehouse_stock'
    ) THEN
        ALTER TABLE product_warehouse_stock 
        DROP CONSTRAINT product_warehouse_stock_product_id_warehouse_id_key;
        
        RAISE NOTICE '✅ Dropped old unique constraint';
    ELSE
        RAISE NOTICE '⚠️  Old unique constraint not found';
    END IF;

    -- Add new composite unique constraint including variant_id
    -- This allows: one base product stock per warehouse (variant_id = NULL)
    -- AND one stock record per variant per warehouse
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'product_warehouse_stock_unique_variant' 
        AND table_name = 'product_warehouse_stock'
    ) THEN
        ALTER TABLE product_warehouse_stock 
        ADD CONSTRAINT product_warehouse_stock_unique_variant 
        UNIQUE (product_id, warehouse_id, variant_id);
        
        RAISE NOTICE '✅ Added new unique constraint with variant_id';
    ELSE
        RAISE NOTICE '⚠️  New unique constraint already exists';
    END IF;

EXCEPTION 
    WHEN OTHERS THEN
        RAISE NOTICE '❌ Error updating constraints: %', SQLERRM;
END $$;

-- Step 3: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_product_warehouse_stock_variant 
ON product_warehouse_stock(variant_id) 
WHERE variant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_product_warehouse_stock_product_variant 
ON product_warehouse_stock(product_id, variant_id);

CREATE INDEX IF NOT EXISTS idx_product_warehouse_stock_warehouse_variant 
ON product_warehouse_stock(warehouse_id, variant_id);

-- Step 4: Create a view for easy querying of variant stock across warehouses
CREATE OR REPLACE VIEW variant_warehouse_stock_summary AS
SELECT 
    pws.product_id,
    p.name as product_name,
    pws.variant_id,
    pv.variant_name,
    pv.variant_weight,
    pv.variant_unit,
    pws.warehouse_id,
    w.name as warehouse_name,
    w.type as warehouse_type,
    w.parent_warehouse_id,
    pws.stock_quantity,
    pws.reserved_quantity,
    (pws.stock_quantity - pws.reserved_quantity) as available_quantity,
    pws.minimum_threshold,
    pws.cost_per_unit,
    pws.last_restocked_at,
    CASE 
        WHEN (pws.stock_quantity - pws.reserved_quantity) > 0 THEN true 
        ELSE false 
    END as is_available,
    CASE 
        WHEN pws.stock_quantity <= pws.minimum_threshold THEN true 
        ELSE false 
    END as is_low_stock
FROM product_warehouse_stock pws
JOIN products p ON pws.product_id = p.id
LEFT JOIN product_variants pv ON pws.variant_id = pv.id
JOIN warehouses w ON pws.warehouse_id = w.id
WHERE pws.is_active = true AND w.is_active = true;

-- Step 5: Create helper function to get variant stock across all warehouses
CREATE OR REPLACE FUNCTION get_variant_warehouse_stock(p_variant_id UUID)
RETURNS TABLE (
    warehouse_id INTEGER,
    warehouse_name VARCHAR(100),
    warehouse_type VARCHAR(20),
    stock_quantity INTEGER,
    reserved_quantity INTEGER,
    available_quantity INTEGER,
    minimum_threshold INTEGER,
    is_low_stock BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        pws.warehouse_id,
        w.name as warehouse_name,
        w.type as warehouse_type,
        pws.stock_quantity,
        pws.reserved_quantity,
        (pws.stock_quantity - pws.reserved_quantity) as available_quantity,
        pws.minimum_threshold,
        (pws.stock_quantity <= pws.minimum_threshold) as is_low_stock
    FROM product_warehouse_stock pws
    JOIN warehouses w ON pws.warehouse_id = w.id
    WHERE pws.variant_id = p_variant_id 
    AND pws.is_active = true 
    AND w.is_active = true
    ORDER BY w.type, w.name;
END;
$$ LANGUAGE plpgsql;

-- Step 6: Create helper function to get all variant stock for a product in a warehouse
CREATE OR REPLACE FUNCTION get_product_variants_in_warehouse(
    p_product_id UUID,
    p_warehouse_id INTEGER
)
RETURNS TABLE (
    variant_id UUID,
    variant_name VARCHAR(255),
    variant_price DECIMAL(10,2),
    variant_weight VARCHAR(50),
    stock_quantity INTEGER,
    reserved_quantity INTEGER,
    available_quantity INTEGER,
    minimum_threshold INTEGER,
    is_low_stock BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        pv.id as variant_id,
        pv.variant_name,
        pv.variant_price,
        pv.variant_weight,
        COALESCE(pws.stock_quantity, 0) as stock_quantity,
        COALESCE(pws.reserved_quantity, 0) as reserved_quantity,
        COALESCE(pws.stock_quantity - pws.reserved_quantity, 0) as available_quantity,
        COALESCE(pws.minimum_threshold, 0) as minimum_threshold,
        COALESCE(pws.stock_quantity <= pws.minimum_threshold, false) as is_low_stock
    FROM product_variants pv
    LEFT JOIN product_warehouse_stock pws 
        ON pv.id = pws.variant_id 
        AND pws.warehouse_id = p_warehouse_id
        AND pws.is_active = true
    WHERE pv.product_id = p_product_id 
    AND pv.active = true
    ORDER BY pv.is_default DESC, pv.variant_name;
END;
$$ LANGUAGE plpgsql;

-- Verify the migration
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'product_warehouse_stock' 
AND column_name IN ('product_id', 'warehouse_id', 'variant_id')
ORDER BY column_name;

-- Output success message
SELECT 'Variant warehouse stock migration completed successfully!' as status;
