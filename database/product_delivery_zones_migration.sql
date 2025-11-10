-- Product Delivery Zones Migration
-- Created: 2024-11-02
-- Description: Adds delivery zone management columns to products table

-- Add delivery columns to products table
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS delivery_type VARCHAR(20) DEFAULT 'nationwide' 
    CHECK (delivery_type IN ('nationwide', 'zonal')),
ADD COLUMN IF NOT EXISTS allowed_zone_ids INTEGER[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS delivery_restrictions JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS delivery_notes TEXT,
ADD COLUMN IF NOT EXISTS delivery_updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_products_delivery_type ON products(delivery_type);
CREATE INDEX IF NOT EXISTS idx_products_zone_ids ON products USING GIN (allowed_zone_ids);
CREATE INDEX IF NOT EXISTS idx_products_delivery_restrictions ON products USING GIN (delivery_restrictions);

-- Create trigger for updating delivery_updated_at timestamp
CREATE TRIGGER update_products_delivery_updated_at 
    BEFORE UPDATE OF delivery_type, allowed_zone_ids, delivery_restrictions, delivery_notes 
    ON products 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create view for products with delivery information
CREATE OR REPLACE VIEW products_with_delivery AS
SELECT 
    p.*,
    CASE 
        WHEN p.delivery_type = 'nationwide' THEN 'Available Nationwide'
        WHEN p.delivery_type = 'zonal' AND array_length(p.allowed_zone_ids, 1) > 0 THEN 
            (SELECT string_agg(dz.display_name, ', ')
             FROM delivery_zones dz 
             WHERE dz.id = ANY(p.allowed_zone_ids) AND dz.is_active = true)
        ELSE 'No Delivery Available'
    END as delivery_zones_display,
    CASE 
        WHEN p.delivery_type = 'nationwide' THEN true
        WHEN p.delivery_type = 'zonal' AND array_length(p.allowed_zone_ids, 1) > 0 THEN true
        ELSE false
    END as has_delivery_available
FROM products p;

-- Function to check if product can be delivered to a pincode
CREATE OR REPLACE FUNCTION can_deliver_to_pincode(
    product_id INTEGER,
    target_pincode VARCHAR(10)
)
RETURNS BOOLEAN AS $$
DECLARE
    product_delivery_type VARCHAR(20);
    product_zone_ids INTEGER[];
    pincode_exists BOOLEAN := FALSE;
BEGIN
    -- Get product delivery information
    SELECT delivery_type, allowed_zone_ids 
    INTO product_delivery_type, product_zone_ids
    FROM products 
    WHERE id = product_id AND active = true;
    
    -- If product not found or inactive, return false
    IF product_delivery_type IS NULL THEN
        RETURN FALSE;
    END IF;
    
    -- If nationwide delivery, return true
    IF product_delivery_type = 'nationwide' THEN
        RETURN TRUE;
    END IF;
    
    -- If zonal delivery, check if pincode exists in allowed zones
    IF product_delivery_type = 'zonal' AND array_length(product_zone_ids, 1) > 0 THEN
        SELECT EXISTS(
            SELECT 1 
            FROM zone_pincodes zp
            JOIN delivery_zones dz ON zp.zone_id = dz.id
            WHERE zp.pincode = target_pincode 
            AND zp.zone_id = ANY(product_zone_ids)
            AND zp.is_active = true 
            AND dz.is_active = true
        ) INTO pincode_exists;
        
        RETURN pincode_exists;
    END IF;
    
    -- Default case: no delivery available
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- Function to get delivery zones for a pincode
CREATE OR REPLACE FUNCTION get_zones_for_pincode(target_pincode VARCHAR(10))
RETURNS TABLE(
    zone_id INTEGER,
    zone_name VARCHAR(100),
    zone_display_name VARCHAR(150)
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        dz.id,
        dz.name,
        dz.display_name
    FROM delivery_zones dz
    JOIN zone_pincodes zp ON dz.id = zp.zone_id
    WHERE zp.pincode = target_pincode 
    AND zp.is_active = true 
    AND dz.is_active = true;
END;
$$ LANGUAGE plpgsql;

-- Create sample data for testing (optional - remove in production)
/*
-- Sample zones
INSERT INTO delivery_zones (name, display_name, description) VALUES
('delhi_ncr', 'Delhi NCR', 'National Capital Region including Delhi, Gurgaon, Noida'),
('mumbai_metro', 'Mumbai Metropolitan', 'Mumbai and surrounding areas'),
('bangalore_city', 'Bangalore City', 'Bangalore urban and suburban areas'),
('chennai_metro', 'Chennai Metro', 'Chennai metropolitan area'),
('hyderabad_city', 'Hyderabad City', 'Hyderabad and Secunderabad')
ON CONFLICT (name) DO NOTHING;

-- Sample pincodes for Delhi NCR
INSERT INTO zone_pincodes (zone_id, pincode, city, state) 
SELECT 
    (SELECT id FROM delivery_zones WHERE name = 'delhi_ncr'),
    pincode, city, state
FROM (VALUES
    ('110001', 'New Delhi', 'Delhi'),
    ('110002', 'Delhi Cantt', 'Delhi'),
    ('110003', 'New Delhi', 'Delhi'),
    ('122001', 'Gurgaon', 'Haryana'),
    ('201301', 'Noida', 'Uttar Pradesh')
) AS sample_data(pincode, city, state);
*/