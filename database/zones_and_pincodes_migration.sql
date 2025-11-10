-- Zones and Pincodes Migration
-- Created: 2024-11-02
-- Description: Creates delivery zones and pincodes tables for zone-based delivery management

-- Create delivery_zones table
CREATE TABLE IF NOT EXISTS delivery_zones (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    display_name VARCHAR(150),
    is_nationwide BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by INTEGER -- References users(id) but not enforced to avoid circular dependency
);

-- Create zone_pincodes table
CREATE TABLE IF NOT EXISTS zone_pincodes (
    id SERIAL PRIMARY KEY,
    zone_id INTEGER NOT NULL REFERENCES delivery_zones(id) ON DELETE CASCADE,
    pincode VARCHAR(10) NOT NULL,
    city VARCHAR(100),
    state VARCHAR(50),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure pincode uniqueness per zone
    UNIQUE(zone_id, pincode)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_delivery_zones_active ON delivery_zones(is_active);
CREATE INDEX IF NOT EXISTS idx_delivery_zones_nationwide ON delivery_zones(is_nationwide);
CREATE INDEX IF NOT EXISTS idx_delivery_zones_name ON delivery_zones(name);

CREATE INDEX IF NOT EXISTS idx_zone_pincodes_zone_id ON zone_pincodes(zone_id);
CREATE INDEX IF NOT EXISTS idx_zone_pincodes_pincode ON zone_pincodes(pincode);
CREATE INDEX IF NOT EXISTS idx_zone_pincodes_active ON zone_pincodes(is_active);
CREATE INDEX IF NOT EXISTS idx_zone_pincodes_state ON zone_pincodes(state);

-- Create trigger for updating updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_delivery_zones_updated_at 
    BEFORE UPDATE ON delivery_zones 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default nationwide zone
INSERT INTO delivery_zones (name, display_name, is_nationwide, description)
VALUES (
    'nationwide',
    'Nationwide Delivery',
    TRUE,
    'Products with nationwide delivery available across all pincodes in India'
) ON CONFLICT (name) DO NOTHING;

-- Create view for zone statistics
CREATE OR REPLACE VIEW zone_stats AS
SELECT 
    dz.id,
    dz.name,
    dz.display_name,
    dz.is_nationwide,
    dz.is_active,
    CASE 
        WHEN dz.is_nationwide THEN NULL 
        ELSE COUNT(zp.id) 
    END as pincode_count,
    dz.created_at,
    dz.updated_at
FROM delivery_zones dz
LEFT JOIN zone_pincodes zp ON dz.id = zp.zone_id AND zp.is_active = true
GROUP BY dz.id, dz.name, dz.display_name, dz.is_nationwide, dz.is_active, dz.created_at, dz.updated_at
ORDER BY dz.created_at DESC;

-- Grant necessary permissions (adjust as needed for your setup)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON delivery_zones TO your_app_role;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON zone_pincodes TO your_app_role;
-- GRANT USAGE, SELECT ON SEQUENCE delivery_zones_id_seq TO your_app_role;
-- GRANT USAGE, SELECT ON SEQUENCE zone_pincodes_id_seq TO your_app_role;