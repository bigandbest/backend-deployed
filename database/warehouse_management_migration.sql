-- Warehouse Management Migration (Fixed)
-- Created: 2024-11-03
-- Description: Creates warehouse management tables with central + zonal architecture and stock management
-- This version handles existing tables and ensures proper order

-- First, ensure the update_updated_at_column function exists
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing views if they exist (to avoid dependency issues)
DROP VIEW IF EXISTS warehouse_stock_summary CASCADE;
DROP VIEW IF EXISTS product_warehouse_availability CASCADE;

-- Create warehouses table with proper structure
DROP TABLE IF EXISTS warehouses CASCADE;
CREATE TABLE warehouses (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    type VARCHAR(20) NOT NULL CHECK (type IN ('central', 'zonal')),
    location VARCHAR(255),
    address TEXT,
    contact_person VARCHAR(100),
    contact_phone VARCHAR(20),
    contact_email VARCHAR(100),
    is_active BOOLEAN DEFAULT TRUE,
    capacity_limit INTEGER DEFAULT NULL, -- Optional capacity limit
    current_utilization INTEGER DEFAULT 0, -- Track utilization
    operational_hours JSONB DEFAULT '{}', -- Store operating hours
    facilities JSONB DEFAULT '{}', -- Store facilities info (cold storage, etc.)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by INTEGER -- References users(id)
);

-- Create warehouse_zones table (mapping zonal warehouses to delivery zones)
DROP TABLE IF EXISTS warehouse_zones CASCADE;
CREATE TABLE warehouse_zones (
    id SERIAL PRIMARY KEY,
    warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
    zone_id INTEGER NOT NULL REFERENCES delivery_zones(id) ON DELETE CASCADE,
    priority INTEGER DEFAULT 1, -- Priority order if multiple warehouses serve same zone
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure unique mapping per warehouse-zone combination
    UNIQUE(warehouse_id, zone_id)
);

-- Create product_warehouse_stock table
DROP TABLE IF EXISTS product_warehouse_stock CASCADE;
CREATE TABLE product_warehouse_stock (
    id SERIAL PRIMARY KEY,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE, -- Added foreign key constraint
    warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
    stock_quantity INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
    reserved_quantity INTEGER DEFAULT 0 CHECK (reserved_quantity >= 0), -- For pending orders
    minimum_threshold INTEGER DEFAULT 0, -- Reorder threshold
    maximum_capacity INTEGER DEFAULT NULL, -- Max stock capacity for this product
    cost_per_unit DECIMAL(10,2) DEFAULT NULL, -- Warehouse-specific cost
    last_restocked_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    last_updated_by INTEGER, -- References users(id)
    notes TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure unique stock record per product-warehouse combination
    UNIQUE(product_id, warehouse_id),
    
    -- Ensure reserved quantity doesn't exceed available stock
    CHECK (reserved_quantity <= stock_quantity)
);

-- Create stock_movements table for tracking stock changes
DROP TABLE IF EXISTS stock_movements CASCADE;
CREATE TABLE stock_movements (
    id SERIAL PRIMARY KEY,
    product_id UUID NOT NULL,
    warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
    movement_type VARCHAR(20) NOT NULL CHECK (movement_type IN ('inbound', 'outbound', 'transfer', 'adjustment', 'reservation', 'release')),
    quantity INTEGER NOT NULL,
    previous_stock INTEGER NOT NULL,
    new_stock INTEGER NOT NULL,
    reference_type VARCHAR(50), -- 'order', 'restock', 'transfer', 'manual'
    reference_id INTEGER, -- ID of the referenced entity
    reason VARCHAR(255),
    performed_by INTEGER, -- References users(id)
    performed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    notes TEXT
);

-- Create indexes for performance optimization
CREATE INDEX idx_warehouses_type ON warehouses(type);
CREATE INDEX idx_warehouses_active ON warehouses(is_active);
CREATE INDEX idx_warehouses_location ON warehouses(location);

CREATE INDEX idx_warehouse_zones_warehouse ON warehouse_zones(warehouse_id);
CREATE INDEX idx_warehouse_zones_zone ON warehouse_zones(zone_id);
CREATE INDEX idx_warehouse_zones_active ON warehouse_zones(is_active);
CREATE INDEX idx_warehouse_zones_priority ON warehouse_zones(priority);

CREATE INDEX idx_product_warehouse_stock_product ON product_warehouse_stock(product_id);
CREATE INDEX idx_product_warehouse_stock_warehouse ON product_warehouse_stock(warehouse_id);
CREATE INDEX idx_product_warehouse_stock_active ON product_warehouse_stock(is_active);
CREATE INDEX idx_product_warehouse_stock_low_stock ON product_warehouse_stock(stock_quantity) WHERE stock_quantity <= minimum_threshold;

CREATE INDEX idx_stock_movements_product ON stock_movements(product_id);
CREATE INDEX idx_stock_movements_warehouse ON stock_movements(warehouse_id);
CREATE INDEX idx_stock_movements_type ON stock_movements(movement_type);
CREATE INDEX idx_stock_movements_reference ON stock_movements(reference_type, reference_id);
CREATE INDEX idx_stock_movements_date ON stock_movements(performed_at);

-- Update triggers for timestamp management
DROP TRIGGER IF EXISTS update_warehouses_updated_at ON warehouses;
CREATE TRIGGER update_warehouses_updated_at 
    BEFORE UPDATE ON warehouses 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_product_warehouse_stock_updated_at ON product_warehouse_stock;
CREATE TRIGGER update_product_warehouse_stock_updated_at 
    BEFORE UPDATE ON product_warehouse_stock 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to get available stock (total - reserved)
CREATE OR REPLACE FUNCTION get_available_stock(p_product_id UUID, p_warehouse_id INTEGER)
RETURNS INTEGER AS $$
BEGIN
    RETURN COALESCE(
        (SELECT stock_quantity - reserved_quantity 
         FROM product_warehouse_stock 
         WHERE product_id = p_product_id AND warehouse_id = p_warehouse_id AND is_active = true),
        0
    );
END;
$$ LANGUAGE plpgsql;

-- Function to update stock with movement logging
CREATE OR REPLACE FUNCTION update_stock_with_movement(
    p_product_id UUID,
    p_warehouse_id INTEGER,
    p_movement_type VARCHAR(20),
    p_quantity INTEGER,
    p_reference_type VARCHAR(50) DEFAULT NULL,
    p_reference_id INTEGER DEFAULT NULL,
    p_reason VARCHAR(255) DEFAULT NULL,
    p_performed_by INTEGER DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
    v_previous_stock INTEGER;
    v_new_stock INTEGER;
    v_reserved_quantity INTEGER;
BEGIN
    -- Get current stock and reserved quantity
    SELECT stock_quantity, reserved_quantity INTO v_previous_stock, v_reserved_quantity
    FROM product_warehouse_stock 
    WHERE product_id = p_product_id AND warehouse_id = p_warehouse_id AND is_active = true;
    
    IF v_previous_stock IS NULL THEN
        RAISE EXCEPTION 'Product % not found in warehouse %', p_product_id, p_warehouse_id;
    END IF;
    
    -- Calculate new stock based on movement type
    CASE p_movement_type
        WHEN 'inbound', 'adjustment' THEN
            v_new_stock := v_previous_stock + p_quantity;
        WHEN 'outbound' THEN
            IF v_previous_stock - v_reserved_quantity < p_quantity THEN
                RAISE EXCEPTION 'Insufficient available stock. Available: %, Required: %', 
                    (v_previous_stock - v_reserved_quantity), p_quantity;
            END IF;
            v_new_stock := v_previous_stock - p_quantity;
        WHEN 'reservation' THEN
            IF v_previous_stock - v_reserved_quantity < p_quantity THEN
                RAISE EXCEPTION 'Insufficient available stock for reservation. Available: %, Required: %', 
                    (v_previous_stock - v_reserved_quantity), p_quantity;
            END IF;
            -- Update reserved quantity instead of stock
            UPDATE product_warehouse_stock 
            SET reserved_quantity = reserved_quantity + p_quantity,
                updated_at = NOW()
            WHERE product_id = p_product_id AND warehouse_id = p_warehouse_id;
            
            v_new_stock := v_previous_stock; -- Stock doesn't change for reservation
        WHEN 'release' THEN
            -- Release reserved quantity
            UPDATE product_warehouse_stock 
            SET reserved_quantity = GREATEST(0, reserved_quantity - p_quantity),
                updated_at = NOW()
            WHERE product_id = p_product_id AND warehouse_id = p_warehouse_id;
            
            v_new_stock := v_previous_stock; -- Stock doesn't change for release
        ELSE
            RAISE EXCEPTION 'Invalid movement type: %', p_movement_type;
    END CASE;
    
    -- Update stock if it changed
    IF p_movement_type NOT IN ('reservation', 'release') THEN
        UPDATE product_warehouse_stock 
        SET stock_quantity = v_new_stock,
            updated_at = NOW()
        WHERE product_id = p_product_id AND warehouse_id = p_warehouse_id;
    END IF;
    
    -- Log the movement
    INSERT INTO stock_movements (
        product_id, warehouse_id, movement_type, quantity, 
        previous_stock, new_stock, reference_type, reference_id, 
        reason, performed_by
    ) VALUES (
        p_product_id, p_warehouse_id, p_movement_type, p_quantity,
        v_previous_stock, v_new_stock, p_reference_type, p_reference_id,
        p_reason, p_performed_by
    );
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Now create views (after all tables are created)
CREATE OR REPLACE VIEW warehouse_stock_summary AS
SELECT 
    w.id as warehouse_id,
    w.name as warehouse_name,
    w.type as warehouse_type,
    COUNT(pws.product_id) as total_products,
    SUM(pws.stock_quantity) as total_stock,
    SUM(pws.reserved_quantity) as total_reserved,
    SUM(pws.stock_quantity - pws.reserved_quantity) as total_available,
    COUNT(CASE WHEN pws.stock_quantity <= pws.minimum_threshold THEN 1 END) as low_stock_products
FROM warehouses w
LEFT JOIN product_warehouse_stock pws ON w.id = pws.warehouse_id AND pws.is_active = true
WHERE w.is_active = true
GROUP BY w.id, w.name, w.type;

-- Create view for product availability across warehouses
CREATE OR REPLACE VIEW product_warehouse_availability AS
SELECT 
    p.id as product_id,
    p.name as product_name,
    p.delivery_type,
    w.id as warehouse_id,
    w.name as warehouse_name,
    w.type as warehouse_type,
    pws.stock_quantity,
    pws.reserved_quantity,
    (pws.stock_quantity - pws.reserved_quantity) as available_quantity,
    pws.minimum_threshold,
    CASE 
        WHEN (pws.stock_quantity - pws.reserved_quantity) > 0 THEN true 
        ELSE false 
    END as is_available,
    CASE 
        WHEN pws.stock_quantity <= pws.minimum_threshold THEN true 
        ELSE false 
    END as is_low_stock
FROM products p
CROSS JOIN warehouses w
LEFT JOIN product_warehouse_stock pws ON p.id = pws.product_id AND w.id = pws.warehouse_id AND pws.is_active = true
WHERE w.is_active = true;

-- Insert default warehouse data
INSERT INTO warehouses (name, type, location, is_active) 
VALUES ('Central Warehouse', 'central', 'Main Distribution Center', true)
ON CONFLICT (name) DO NOTHING;

-- Create sample zonal warehouses (optional - can be created through admin)
INSERT INTO warehouses (name, type, location, is_active) 
VALUES 
    ('North Zone Warehouse', 'zonal', 'North Region Hub', true),
    ('South Zone Warehouse', 'zonal', 'South Region Hub', true),
    ('East Zone Warehouse', 'zonal', 'East Region Hub', true),
    ('West Zone Warehouse', 'zonal', 'West Region Hub', true)
ON CONFLICT (name) DO NOTHING;

-- Output success message
SELECT 'Warehouse management migration completed successfully!' as status;