-- Sample data for testing pincode selection
-- This creates zones and pincodes for testing the division warehouse pincode selection

-- Insert sample delivery zones
INSERT INTO delivery_zones (name, display_name, is_nationwide, is_active, description, created_at, updated_at)
VALUES
  ('delhi_ncr', 'Delhi NCR', false, true, 'Delhi National Capital Region', NOW(), NOW()),
  ('mumbai', 'Mumbai Metro', false, true, 'Mumbai Metropolitan Area', NOW(), NOW()),
  ('bangalore', 'Bangalore Urban', false, true, 'Bangalore Urban District', NOW(), NOW())
ON CONFLICT (name) DO NOTHING;

-- Insert sample zone pincodes
INSERT INTO zone_pincodes (zone_id, pincode, city, state, is_active, created_at, updated_at)
SELECT
  dz.id,
  pincode_data.pincode,
  pincode_data.city,
  pincode_data.state,
  true,
  NOW(),
  NOW()
FROM delivery_zones dz
CROSS JOIN (
  VALUES
    ('delhi_ncr', '110001', 'New Delhi', 'Delhi'),
    ('delhi_ncr', '110002', 'Delhi', 'Delhi'),
    ('delhi_ncr', '110003', 'Delhi', 'Delhi'),
    ('mumbai', '400001', 'Mumbai', 'Maharashtra'),
    ('mumbai', '400002', 'Mumbai', 'Maharashtra'),
    ('mumbai', '400003', 'Mumbai', 'Maharashtra'),
    ('bangalore', '560001', 'Bangalore', 'Karnataka'),
    ('bangalore', '560002', 'Bangalore', 'Karnataka'),
    ('bangalore', '560003', 'Bangalore', 'Karnataka')
) AS pincode_data(zone_name, pincode, city, state)
WHERE dz.name = pincode_data.zone_name
ON CONFLICT (zone_id, pincode) DO NOTHING;

-- Create a sample zonal warehouse if none exists
INSERT INTO warehouses (name, type, address, is_active, hierarchy_level, created_at, updated_at)
VALUES ('Delhi Zonal Hub', 'zonal', 'Delhi NCR', true, 0, NOW(), NOW())
ON CONFLICT (name) DO NOTHING;

-- Assign zones to the zonal warehouse
INSERT INTO warehouse_zones (warehouse_id, zone_id, is_active, created_at, updated_at)
SELECT
  w.id,
  dz.id,
  true,
  NOW(),
  NOW()
FROM warehouses w
CROSS JOIN delivery_zones dz
WHERE w.name = 'Delhi Zonal Hub'
  AND w.type = 'zonal'
  AND dz.name = 'delhi_ncr'
ON CONFLICT (warehouse_id, zone_id) DO NOTHING;