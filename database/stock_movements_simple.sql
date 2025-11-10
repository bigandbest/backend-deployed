-- Simple Stock Movements Table Creation Script
-- Run this script in your Supabase SQL editor

-- 1. Create the stock_movements table
CREATE TABLE IF NOT EXISTS stock_movements (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL,
    warehouse_id INTEGER NOT NULL,
    movement_type VARCHAR(20) NOT NULL,
    quantity INTEGER NOT NULL,
    previous_stock INTEGER DEFAULT 0,
    new_stock INTEGER DEFAULT 0,
    reference_type VARCHAR(50) DEFAULT NULL,
    reference_id VARCHAR(100) DEFAULT NULL,
    reason TEXT,
    performed_by TEXT DEFAULT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Add foreign key constraints (if they don't exist)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'stock_movements_product_id_fkey'
    ) THEN
        ALTER TABLE stock_movements 
        ADD CONSTRAINT stock_movements_product_id_fkey 
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'stock_movements_warehouse_id_fkey'
    ) THEN
        ALTER TABLE stock_movements 
        ADD CONSTRAINT stock_movements_warehouse_id_fkey 
        FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE;
    END IF;
END $$;

-- 3. Add check constraint for movement types
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'stock_movements_movement_type_check'
    ) THEN
        ALTER TABLE stock_movements 
        ADD CONSTRAINT stock_movements_movement_type_check 
        CHECK (movement_type IN ('inbound', 'outbound', 'transfer', 'reservation', 'release', 'adjustment'));
    END IF;
END $$;

-- 4. Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_stock_movements_product_id ON stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_warehouse_id ON stock_movements(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_created_at ON stock_movements(created_at);
CREATE INDEX IF NOT EXISTS idx_stock_movements_reference ON stock_movements(reference_type, reference_id);

-- 5. Create the reporting view
CREATE OR REPLACE VIEW stock_movement_report AS
SELECT 
    sm.id,
    sm.created_at,
    COALESCE(p.name, 'Unknown Product') AS product_name,
    COALESCE(w.name, 'Unknown Warehouse') AS warehouse_name,
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

-- 6. Test the setup by inserting a sample record (optional)
-- Uncomment the lines below to test
/*
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
    1, -- Replace with actual product_id
    1, -- Replace with actual warehouse_id  
    'inbound',
    100,
    0,
    100,
    'test',
    'Setup test record'
);
*/

-- 7. Create a function to get stock movement summary
CREATE OR REPLACE FUNCTION get_stock_movements_summary(p_product_id INTEGER DEFAULT NULL, p_warehouse_id INTEGER DEFAULT NULL)
RETURNS TABLE (
    total_inbound BIGINT,
    total_outbound BIGINT,
    net_movement BIGINT,
    last_movement TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COALESCE(SUM(CASE WHEN movement_type = 'inbound' THEN quantity ELSE 0 END), 0) as total_inbound,
        COALESCE(SUM(CASE WHEN movement_type = 'outbound' THEN quantity ELSE 0 END), 0) as total_outbound,
        COALESCE(SUM(CASE WHEN movement_type = 'inbound' THEN quantity ELSE -quantity END), 0) as net_movement,
        MAX(created_at) as last_movement
    FROM stock_movements sm
    WHERE (p_product_id IS NULL OR sm.product_id = p_product_id)
      AND (p_warehouse_id IS NULL OR sm.warehouse_id = p_warehouse_id);
END;
$$ LANGUAGE plpgsql;

-- Success message
SELECT 'Stock movements table and related objects created successfully!' as status;