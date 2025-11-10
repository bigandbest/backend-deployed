-- Enhanced Warehouse Hierarchy Migration
-- Created: 2025-11-09
-- Description: Adds division warehouses, pincode assignments, and product types for hierarchical fallback system

-- Update warehouse types to include 'division'
ALTER TABLE warehouses DROP CONSTRAINT IF EXISTS warehouses_type_check;
ALTER TABLE warehouses ADD CONSTRAINT warehouses_type_check CHECK (type IN ('central', 'zonal', 'division'));

-- Update hierarchy levels: central=0, zonal=1, division=2
UPDATE warehouses SET hierarchy_level = 0 WHERE type = 'central';
UPDATE warehouses SET hierarchy_level = 1 WHERE type = 'zonal';
UPDATE warehouses SET hierarchy_level = 2 WHERE type = 'division';

-- Create warehouse_pincodes table for division warehouse pincode assignments
CREATE TABLE IF NOT EXISTS warehouse_pincodes (
    id SERIAL PRIMARY KEY,
    warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
    pincode VARCHAR(10) NOT NULL,
    city VARCHAR(100),
    state VARCHAR(100),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Ensure unique pincode per warehouse (no overlap)
    UNIQUE(warehouse_id, pincode)

    -- Note: Only division warehouses should have pincode assignments.
    -- This constraint is enforced in the application layer.
);

-- Create index for fast pincode lookups
CREATE INDEX idx_warehouse_pincodes_pincode ON warehouse_pincodes(pincode);
CREATE INDEX idx_warehouse_pincodes_warehouse ON warehouse_pincodes(warehouse_id);

-- Add product_type column to products table
ALTER TABLE products ADD COLUMN IF NOT EXISTS product_type VARCHAR(20) DEFAULT 'nationwide'
    CHECK (product_type IN ('nationwide', 'zonal', 'perishable'));

-- Create function to get warehouse hierarchy with pincode info
CREATE OR REPLACE VIEW warehouse_hierarchy_detailed AS
SELECT
    w.id,
    w.name,
    w.type,
    w.location,
    w.address,
    w.is_active,
    w.parent_warehouse_id,
    pw.name as parent_warehouse_name,
    pw.type as parent_warehouse_type,
    w.hierarchy_level,
    -- Count child warehouses
    (SELECT COUNT(*) FROM warehouses cw WHERE cw.parent_warehouse_id = w.id) as child_count,
    -- Get zones for zonal warehouses
    COALESCE(
        (SELECT array_agg(dz.name)
         FROM warehouse_zones wz
         JOIN delivery_zones dz ON wz.zone_id = dz.id
         WHERE wz.warehouse_id = w.id AND wz.is_active = true),
        '{}'::text[]
    ) as zones,
    -- Get pincodes for division warehouses
    COALESCE(
        (SELECT array_agg(pincode)
         FROM warehouse_pincodes wp
         WHERE wp.warehouse_id = w.id AND wp.is_active = true),
        '{}'::text[]
    ) as pincodes,
    w.created_at,
    w.updated_at
FROM warehouses w
LEFT JOIN warehouses pw ON w.parent_warehouse_id = pw.id
ORDER BY w.hierarchy_level, w.name;

-- Function to find warehouse for order fulfillment
CREATE OR REPLACE FUNCTION find_warehouse_for_order(
    customer_pincode TEXT,
    product_type TEXT,
    preferred_warehouse_id INTEGER DEFAULT NULL
)
RETURNS TABLE(
    warehouse_id INTEGER,
    warehouse_name TEXT,
    warehouse_type TEXT,
    priority INTEGER,
    fallback_level INTEGER
) AS $$
DECLARE
    division_wh warehouse_pincodes%ROWTYPE;
    zonal_wh warehouses%ROWTYPE;
    central_wh warehouses%ROWTYPE;
BEGIN
    -- For perishable items: only check division warehouse, no fallback
    IF product_type = 'perishable' THEN
        SELECT wp.* INTO division_wh
        FROM warehouse_pincodes wp
        JOIN warehouses w ON wp.warehouse_id = w.id
        WHERE wp.pincode = customer_pincode
          AND wp.is_active = true
          AND w.is_active = true
          AND w.type = 'division';

        IF FOUND THEN
            RETURN QUERY SELECT
                division_wh.warehouse_id,
                w.name::TEXT,
                w.type::TEXT,
                1::INTEGER as priority,
                0::INTEGER as fallback_level
            FROM warehouses w WHERE w.id = division_wh.warehouse_id;
        END IF;

        -- No warehouse found for perishable
        RETURN;

    -- For nationwide/zonal items: hierarchical fallback
    ELSE
        -- Level 1: Division warehouse for pincode
        SELECT wp.* INTO division_wh
        FROM warehouse_pincodes wp
        JOIN warehouses w ON wp.warehouse_id = w.id
        WHERE wp.pincode = customer_pincode
          AND wp.is_active = true
          AND w.is_active = true
          AND w.type = 'division';

        IF FOUND THEN
            RETURN QUERY SELECT
                division_wh.warehouse_id,
                w.name::TEXT,
                w.type::TEXT,
                1::INTEGER as priority,
                1::INTEGER as fallback_level
            FROM warehouses w WHERE w.id = division_wh.warehouse_id;
            RETURN;
        END IF;

        -- Level 2: Zonal warehouse (parent of division or direct zonal)
        -- Find zonal warehouse that covers the pincode's zone
        SELECT w.* INTO zonal_wh
        FROM warehouses w
        JOIN warehouse_zones wz ON w.id = wz.warehouse_id
        JOIN delivery_zones dz ON wz.zone_id = dz.id
        JOIN zone_pincodes zp ON dz.id = zp.zone_id
        WHERE zp.pincode = customer_pincode
          AND w.type = 'zonal'
          AND w.is_active = true
          AND wz.is_active = true
          AND zp.is_active = true;

        IF FOUND THEN
            RETURN QUERY SELECT
                zonal_wh.id,
                zonal_wh.name::TEXT,
                zonal_wh.type::TEXT,
                2::INTEGER as priority,
                2::INTEGER as fallback_level;
            RETURN;
        END IF;

        -- Level 3: Central warehouse (for nationwide products)
        IF product_type = 'nationwide' THEN
            SELECT w.* INTO central_wh
            FROM warehouses w
            WHERE w.type = 'central'
              AND w.is_active = true
            ORDER BY w.name
            LIMIT 1;

            IF FOUND THEN
                RETURN QUERY SELECT
                    central_wh.id,
                    central_wh.name::TEXT,
                    central_wh.type::TEXT,
                    3::INTEGER as priority,
                    3::INTEGER as fallback_level;
            END IF;
        END IF;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Add warehouse assignment fields to order_items
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS assigned_warehouse_id INTEGER REFERENCES warehouses(id);
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS warehouse_name VARCHAR(100);

-- Create order_warehouse_assignments table for detailed tracking
CREATE TABLE IF NOT EXISTS order_warehouse_assignments (
    id SERIAL PRIMARY KEY,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id),
    warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
    quantity INTEGER NOT NULL,
    priority INTEGER DEFAULT 1,
    fallback_level INTEGER DEFAULT 0,
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    fulfilled_at TIMESTAMP WITH TIME ZONE NULL,
    status VARCHAR(20) DEFAULT 'assigned' CHECK (status IN ('assigned', 'fulfilled', 'cancelled')),
    
    UNIQUE(order_id, product_id, warehouse_id)
);

-- Create indexes for performance
CREATE INDEX idx_order_warehouse_assignments_order ON order_warehouse_assignments(order_id);
CREATE INDEX idx_order_warehouse_assignments_product ON order_warehouse_assignments(product_id);
CREATE INDEX idx_order_warehouse_assignments_warehouse ON order_warehouse_assignments(warehouse_id);