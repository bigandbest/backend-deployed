-- Drop the view first if it exists to avoid conflicts
DROP VIEW IF EXISTS stock_movement_report;

-- Stock movements tracking table
CREATE TABLE IF NOT EXISTS stock_movements (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
    movement_type VARCHAR(20) NOT NULL CHECK (movement_type IN ('inbound', 'outbound', 'transfer', 'reservation', 'release', 'adjustment')),
    quantity INTEGER NOT NULL,
    previous_stock INTEGER DEFAULT 0,
    new_stock INTEGER DEFAULT 0,
    reference_type VARCHAR(50) DEFAULT NULL, -- 'order', 'product_creation', 'zone_distribution', 'manual', etc.
    reference_id VARCHAR(100) DEFAULT NULL,
    reason TEXT,
    performed_by TEXT DEFAULT NULL, -- Changed from UUID to TEXT for broader compatibility
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance (separate from table creation)
CREATE INDEX IF NOT EXISTS idx_stock_movements_product_id ON stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_warehouse_id ON stock_movements(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_created_at ON stock_movements(created_at);
CREATE INDEX IF NOT EXISTS idx_stock_movements_reference ON stock_movements(reference_type, reference_id);

-- Add comments for better understanding
COMMENT ON TABLE stock_movements IS 'Track all stock movements and changes across warehouses';
COMMENT ON COLUMN stock_movements.movement_type IS 'Type of stock movement: inbound (stock added), outbound (stock removed), transfer (between warehouses), reservation (reserved for order), release (reservation released), adjustment (manual correction)';
COMMENT ON COLUMN stock_movements.reference_type IS 'What triggered this movement: order, product_creation, zone_distribution, manual, etc.';
COMMENT ON COLUMN stock_movements.reference_id IS 'ID of the reference entity (order_id, etc.)';

-- Create a function to automatically log stock movements when product_warehouse_stock is updated
CREATE OR REPLACE FUNCTION log_stock_movement()
RETURNS TRIGGER AS $$
BEGIN
    -- Only log if stock_quantity actually changed
    IF (TG_OP = 'UPDATE' AND OLD.stock_quantity != NEW.stock_quantity) OR TG_OP = 'INSERT' THEN
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
            NEW.product_id,
            NEW.warehouse_id,
            CASE 
                WHEN TG_OP = 'INSERT' THEN 'inbound'
                WHEN NEW.stock_quantity > OLD.stock_quantity THEN 'inbound'
                ELSE 'outbound'
            END,
            CASE 
                WHEN TG_OP = 'INSERT' THEN NEW.stock_quantity
                ELSE ABS(NEW.stock_quantity - OLD.stock_quantity)
            END,
            CASE WHEN TG_OP = 'INSERT' THEN 0 ELSE OLD.stock_quantity END,
            NEW.stock_quantity,
            'automatic',
            'Stock level change detected'
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic stock movement logging
DROP TRIGGER IF EXISTS trigger_log_stock_movement ON product_warehouse_stock;
CREATE TRIGGER trigger_log_stock_movement
    AFTER INSERT OR UPDATE ON product_warehouse_stock
    FOR EACH ROW
    EXECUTE FUNCTION log_stock_movement();

-- Create view for easy stock movement reporting
CREATE OR REPLACE VIEW stock_movement_report AS
SELECT 
    sm.id,
    sm.created_at,
    COALESCE(p.name, 'Product ID: ' || sm.product_id::text) AS product_name,
    COALESCE(w.name, 'Warehouse ID: ' || sm.warehouse_id::text) AS warehouse_name,
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

COMMENT ON VIEW stock_movement_report IS 'Comprehensive view of all stock movements with product and warehouse details';