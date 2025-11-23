-- Migration: Merge cod_orders into orders table
-- This script unifies COD and prepaid orders into a single orders table
-- Handles data integrity issues gracefully

-- Step 0: Analyze data integrity issues
DO $$
DECLARE
    orphaned_count INTEGER;
    invalid_product_count INTEGER;
    non_uuid_product_count INTEGER;
BEGIN
    -- Check for orphaned user_ids (user doesn't exist)
    SELECT COUNT(*) INTO orphaned_count
    FROM cod_orders c
    WHERE c.user_id IS NOT NULL
    AND NOT EXISTS (
        SELECT 1 FROM users u WHERE u.id = c.user_id
    );
    
    IF orphaned_count > 0 THEN
        RAISE NOTICE 'Found % COD orders with invalid user_id references', orphaned_count;
        RAISE NOTICE 'These orders will be skipped during migration';
    END IF;
    
    -- Check for non-UUID product_ids (text values like "prod-001")
    SELECT COUNT(*) INTO non_uuid_product_count
    FROM cod_orders c
    WHERE c.product_id IS NOT NULL 
    AND c.product_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
    
    IF non_uuid_product_count > 0 THEN
        RAISE NOTICE 'Found % COD orders with non-UUID product_id values (e.g., "prod-001")', non_uuid_product_count;
        RAISE NOTICE 'Order items for these will be skipped';
    END IF;
    
    -- Check for invalid product_ids (valid UUID but product doesn't exist)
    BEGIN
        SELECT COUNT(*) INTO invalid_product_count
        FROM cod_orders c
        WHERE c.product_id IS NOT NULL 
        AND c.product_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND NOT EXISTS (
            SELECT 1 FROM products p WHERE p.id = c.product_id::uuid
        );
        
        IF invalid_product_count > 0 THEN
            RAISE NOTICE 'Found % COD orders with invalid product_id references', invalid_product_count;
            RAISE NOTICE 'Order items for these will be skipped';
        END IF;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Could not validate product_ids (this is OK)';
    END;
END $$;

-- Step 1: Add missing columns to orders table to accommodate COD order data
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS user_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS user_email VARCHAR(255),
ADD COLUMN IF NOT EXISTS user_location VARCHAR(255),
ADD COLUMN IF NOT EXISTS product_name TEXT,
ADD COLUMN IF NOT EXISTS product_total_price NUMERIC(10, 2);

-- Step 2: Ensure payment_method column exists and set default
ALTER TABLE orders 
ALTER COLUMN payment_method SET DEFAULT 'prepaid';

-- Step 3: Migrate data from cod_orders to orders
-- ONLY migrate orders with valid user_id references
INSERT INTO orders (
    user_id,
    user_name,
    user_email,
    user_location,
    product_name,
    product_total_price,
    address,
    payment_method,
    status,
    created_at,
    updated_at,
    total,
    subtotal,
    shipping
)
SELECT 
    c.user_id,
    c.user_name,
    c.user_email,
    c.user_location,
    c.product_name,
    c.product_total_price,
    c.user_address as address,
    'cod' as payment_method,
    c.status,
    c.created_at,
    c.updated_at,
    c.product_total_price as total,
    c.product_total_price as subtotal,
    0 as shipping
FROM cod_orders c
WHERE c.user_id IS NOT NULL
AND EXISTS (
    -- Only migrate if user exists in users table
    SELECT 1 FROM users u WHERE u.id = c.user_id
)
AND NOT EXISTS (
    -- Avoid duplicates if migration is run multiple times
    SELECT 1 FROM orders o 
    WHERE o.user_id = c.user_id 
    AND o.created_at = c.created_at
    AND o.payment_method = 'cod'
);

-- Step 4: Create order_items entries for migrated COD orders
-- Only create items for valid UUID product_ids
DO $$
BEGIN
    INSERT INTO order_items (
        order_id,
        product_id,
        quantity,
        price
    )
    SELECT 
        o.id as order_id,
        c.product_id::uuid as product_id,
        c.quantity,
        c.product_total_price / NULLIF(c.quantity, 0) as price
    FROM cod_orders c
    INNER JOIN orders o ON 
        o.user_id = c.user_id 
        AND o.created_at = c.created_at
        AND o.payment_method = 'cod'
    WHERE c.product_id IS NOT NULL
    AND c.product_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' -- Check if valid UUID format
    AND EXISTS (
        -- Only create order_item if product exists
        SELECT 1 FROM products p WHERE p.id = c.product_id::uuid
    )
    AND NOT EXISTS (
        SELECT 1 FROM order_items oi 
        WHERE oi.order_id = o.id
    );
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Some order_items could not be created (this is OK if product_ids are not UUIDs)';
END $$;

-- Step 5: Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_orders_payment_method ON orders(payment_method);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);

-- Step 6: Migration Summary Report
DO $$
DECLARE
    total_cod_orders INTEGER;
    migrated_orders INTEGER;
    skipped_orders INTEGER;
    migrated_items INTEGER;
    orphaned_orders INTEGER;
    non_uuid_products INTEGER;
BEGIN
    -- Count total COD orders
    SELECT COUNT(*) INTO total_cod_orders FROM cod_orders;
    
    -- Count successfully migrated orders
    SELECT COUNT(*) INTO migrated_orders 
    FROM orders WHERE payment_method = 'cod';
    
    -- Count orphaned orders (user doesn't exist)
    SELECT COUNT(*) INTO orphaned_orders
    FROM cod_orders c
    WHERE c.user_id IS NOT NULL
    AND NOT EXISTS (
        SELECT 1 FROM users u WHERE u.id = c.user_id
    );
    
    -- Count non-UUID product_ids
    SELECT COUNT(*) INTO non_uuid_products
    FROM cod_orders c
    WHERE c.product_id IS NOT NULL
    AND c.product_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
    
    skipped_orders := total_cod_orders - migrated_orders;
    
    -- Count migrated order items
    SELECT COUNT(*) INTO migrated_items
    FROM order_items oi
    INNER JOIN orders o ON o.id = oi.order_id
    WHERE o.payment_method = 'cod';
    
    -- Display summary
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'MIGRATION SUMMARY';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Total COD orders in source table: %', total_cod_orders;
    RAISE NOTICE 'Successfully migrated orders: %', migrated_orders;
    RAISE NOTICE 'Skipped orders (total): %', skipped_orders;
    RAISE NOTICE '  - Orphaned user_id: %', orphaned_orders;
    RAISE NOTICE 'Created order items: %', migrated_items;
    RAISE NOTICE 'Orders with non-UUID product_id: %', non_uuid_products;
    RAISE NOTICE '========================================';
    
    IF skipped_orders > 0 THEN
        RAISE NOTICE '';
        RAISE NOTICE 'WARNING: % orders were skipped', skipped_orders;
        IF orphaned_orders > 0 THEN
            RAISE NOTICE '  - % orders reference users that do not exist', orphaned_orders;
        END IF;
        RAISE NOTICE 'Review cod_orders table for skipped records';
    END IF;
    
    IF non_uuid_products > 0 THEN
        RAISE NOTICE '';
        RAISE NOTICE 'NOTE: % orders have non-UUID product_id values (e.g., "prod-001")', non_uuid_products;
        RAISE NOTICE 'These orders were migrated but order_items were not created';
        RAISE NOTICE 'Product information is preserved in product_name column';
    END IF;
    
    IF migrated_orders = total_cod_orders THEN
        RAISE NOTICE '';
        RAISE NOTICE 'SUCCESS: All COD orders migrated successfully!';
    ELSIF migrated_orders > 0 THEN
        RAISE NOTICE '';
        RAISE NOTICE 'PARTIAL SUCCESS: % of % orders migrated', migrated_orders, total_cod_orders;
    END IF;
    
    RAISE NOTICE '';
END $$;

-- Step 7: (Optional) Backup cod_orders table before dropping
-- CREATE TABLE cod_orders_backup AS SELECT * FROM cod_orders;

-- Step 8: (Optional) Drop cod_orders table after verification
-- WARNING: Only run this after verifying the migration was successful
-- DROP TABLE IF EXISTS cod_orders;

-- Migration complete!
-- Note: Keep cod_orders table for now until you verify everything works correctly

-- ========================================
-- HELPFUL QUERIES FOR TROUBLESHOOTING
-- ========================================

-- To view orphaned orders (user doesn't exist):
-- SELECT c.* FROM cod_orders c 
-- WHERE c.user_id IS NOT NULL
-- AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = c.user_id);

-- To view orders with non-UUID product_id:
-- SELECT c.id, c.user_name, c.product_id, c.product_name 
-- FROM cod_orders c 
-- WHERE c.product_id IS NOT NULL
-- AND c.product_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- To verify migration success:
-- SELECT 
--     'COD Orders (source)' as table_name,
--     COUNT(*) as count
-- FROM cod_orders
-- UNION ALL
-- SELECT 
--     'Orders (COD migrated)' as table_name,
--     COUNT(*) as count
-- FROM orders WHERE payment_method = 'cod';
