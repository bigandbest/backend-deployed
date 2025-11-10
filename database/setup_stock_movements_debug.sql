-- Step-by-step Stock Movements Setup
-- Run each section one by one to identify any issues

-- Step 1: Check if stock_movements table already exists
SELECT 
    table_name, 
    table_type 
FROM information_schema.tables 
WHERE table_name = 'stock_movements';

-- Step 2: Drop any existing objects to start fresh
DROP VIEW IF EXISTS stock_movement_report CASCADE;
DROP TRIGGER IF EXISTS trigger_log_stock_movement ON product_warehouse_stock;
DROP FUNCTION IF EXISTS log_stock_movement() CASCADE;
DROP TABLE IF EXISTS stock_movements CASCADE;

-- Step 3: Create the stock_movements table
CREATE TABLE stock_movements (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL,
    warehouse_id INTEGER NOT NULL,
    movement_type VARCHAR(20) NOT NULL,
    quantity INTEGER NOT NULL,
    previous_stock INTEGER DEFAULT 0,
    new_stock INTEGER DEFAULT 0,
    reference_type VARCHAR(50),
    reference_id VARCHAR(100),
    reason TEXT,
    performed_by TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Step 4: Add constraints
ALTER TABLE stock_movements 
ADD CONSTRAINT chk_movement_type 
CHECK (movement_type IN ('inbound', 'outbound', 'transfer', 'reservation', 'release', 'adjustment'));

-- Step 5: Add foreign keys (only if the referenced tables exist)
DO $$
BEGIN
    -- Check if products table exists before adding foreign key
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'products') THEN
        ALTER TABLE stock_movements 
        ADD CONSTRAINT fk_stock_movements_product_id 
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
        RAISE NOTICE 'Added products foreign key constraint';
    ELSE
        RAISE NOTICE 'Products table not found, skipping foreign key';
    END IF;
    
    -- Check if warehouses table exists before adding foreign key  
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'warehouses') THEN
        ALTER TABLE stock_movements 
        ADD CONSTRAINT fk_stock_movements_warehouse_id 
        FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE;
        RAISE NOTICE 'Added warehouses foreign key constraint';
    ELSE
        RAISE NOTICE 'Warehouses table not found, skipping foreign key';
    END IF;
END $$;

-- Step 6: Create indexes
CREATE INDEX idx_stock_movements_product_id ON stock_movements(product_id);
CREATE INDEX idx_stock_movements_warehouse_id ON stock_movements(warehouse_id);  
CREATE INDEX idx_stock_movements_created_at ON stock_movements(created_at);
CREATE INDEX idx_stock_movements_reference ON stock_movements(reference_type, reference_id);

-- Step 7: Verify table structure
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'stock_movements'
ORDER BY ordinal_position;

-- Step 8: Create the reporting view
CREATE VIEW stock_movement_report AS
SELECT 
    sm.id,
    sm.created_at,
    CASE 
        WHEN p.name IS NOT NULL THEN p.name 
        ELSE 'Product ID: ' || sm.product_id::text 
    END AS product_name,
    CASE 
        WHEN w.name IS NOT NULL THEN w.name 
        ELSE 'Warehouse ID: ' || sm.warehouse_id::text 
    END AS warehouse_name,
    COALESCE(w.type, 'unknown') AS warehouse_type,
    sm.movement_type,
    sm.quantity,
    sm.previous_stock,
    sm.new_stock,
    sm.reference_type,
    sm.reference_id,
    sm.reason,
    sm.performed_by
FROM stock_movements sm
LEFT JOIN products p ON sm.product_id = p.id
LEFT JOIN warehouses w ON sm.warehouse_id = w.id
ORDER BY sm.created_at DESC;

-- Step 9: Test insert a sample record
INSERT INTO stock_movements (
    product_id,
    warehouse_id, 
    movement_type,
    quantity,
    previous_stock,
    new_stock,
    reference_type,
    reason
) VALUES (
    1, -- Use existing product_id
    1, -- Use existing warehouse_id
    'inbound',
    100,
    0,
    100,
    'setup_test',
    'Test record during setup'
);

-- Step 10: Test the view
SELECT * FROM stock_movement_report LIMIT 5;

-- Step 11: Clean up test data
DELETE FROM stock_movements WHERE reference_type = 'setup_test';

-- Success message
SELECT 'Stock movements table setup completed successfully!' as status;