-- Sample data for testing delivery validation
-- Insert sample delivery zones and pincodes

-- Create a few sample delivery zones
INSERT INTO delivery_zones (name, display_name, is_nationwide, is_active, description)
VALUES 
  ('delhi_ncr', 'Delhi NCR', false, true, 'Delhi National Capital Region including Gurgaon, Noida, Faridabad, Ghaziabad'),
  ('mumbai', 'Mumbai', false, true, 'Mumbai Metropolitan Region'),
  ('bangalore', 'Bangalore', false, true, 'Bangalore Urban and surrounding areas'),
  ('nationwide', 'Nationwide', true, true, 'All serviceable areas across India')
ON CONFLICT (name) DO NOTHING;

-- Get zone IDs for inserting pincodes
DO $$ 
DECLARE 
    delhi_zone_id INTEGER;
    mumbai_zone_id INTEGER;
    bangalore_zone_id INTEGER;
    nationwide_zone_id INTEGER;
BEGIN
    SELECT id INTO delhi_zone_id FROM delivery_zones WHERE name = 'delhi_ncr';
    SELECT id INTO mumbai_zone_id FROM delivery_zones WHERE name = 'mumbai';
    SELECT id INTO bangalore_zone_id FROM delivery_zones WHERE name = 'bangalore';
    SELECT id INTO nationwide_zone_id FROM delivery_zones WHERE name = 'nationwide';

    -- Insert Delhi NCR pincodes
    INSERT INTO zone_pincodes (zone_id, pincode, city, state, is_active) VALUES
        (delhi_zone_id, '110001', 'New Delhi', 'Delhi', true),
        (delhi_zone_id, '110003', 'New Delhi', 'Delhi', true),
        (delhi_zone_id, '110005', 'New Delhi', 'Delhi', true),
        (delhi_zone_id, '110006', 'New Delhi', 'Delhi', true),
        (delhi_zone_id, '110007', 'New Delhi', 'Delhi', true),
        (delhi_zone_id, '110008', 'New Delhi', 'Delhi', true),
        (delhi_zone_id, '110009', 'New Delhi', 'Delhi', true),
        (delhi_zone_id, '110010', 'New Delhi', 'Delhi', true),
        (delhi_zone_id, '110011', 'New Delhi', 'Delhi', true),
        (delhi_zone_id, '110012', 'New Delhi', 'Delhi', true),
        (delhi_zone_id, '110016', 'New Delhi', 'Delhi', true),
        (delhi_zone_id, '110017', 'New Delhi', 'Delhi', true),
        (delhi_zone_id, '110018', 'New Delhi', 'Delhi', true),
        (delhi_zone_id, '110019', 'New Delhi', 'Delhi', true),
        (delhi_zone_id, '110020', 'New Delhi', 'Delhi', true),
        (delhi_zone_id, '110021', 'New Delhi', 'Delhi', true),
        (delhi_zone_id, '110022', 'New Delhi', 'Delhi', true),
        (delhi_zone_id, '110023', 'New Delhi', 'Delhi', true),
        (delhi_zone_id, '110024', 'New Delhi', 'Delhi', true),
        (delhi_zone_id, '110025', 'New Delhi', 'Delhi', true),
        (delhi_zone_id, '110026', 'New Delhi', 'Delhi', true),
        (delhi_zone_id, '110027', 'New Delhi', 'Delhi', true),
        (delhi_zone_id, '110028', 'New Delhi', 'Delhi', true),
        (delhi_zone_id, '110029', 'New Delhi', 'Delhi', true),
        (delhi_zone_id, '110030', 'New Delhi', 'Delhi', true),
        (delhi_zone_id, '110031', 'New Delhi', 'Delhi', true),
        (delhi_zone_id, '110032', 'New Delhi', 'Delhi', true),
        (delhi_zone_id, '110033', 'New Delhi', 'Delhi', true),
        (delhi_zone_id, '110034', 'New Delhi', 'Delhi', true),
        (delhi_zone_id, '110035', 'New Delhi', 'Delhi', true),
        (delhi_zone_id, '110037', 'New Delhi', 'Delhi', true),
        (delhi_zone_id, '110038', 'New Delhi', 'Delhi', true),
        (delhi_zone_id, '110039', 'New Delhi', 'Delhi', true),
        (delhi_zone_id, '110040', 'New Delhi', 'Delhi', true),
        (delhi_zone_id, '110041', 'New Delhi', 'Delhi', true),
        (delhi_zone_id, '110042', 'New Delhi', 'Delhi', true),
        (delhi_zone_id, '110043', 'New Delhi', 'Delhi', true),
        (delhi_zone_id, '110044', 'New Delhi', 'Delhi', true),
        (delhi_zone_id, '110045', 'New Delhi', 'Delhi', true),
        (delhi_zone_id, '110046', 'New Delhi', 'Delhi', true),
        (delhi_zone_id, '110047', 'New Delhi', 'Delhi', true),
        (delhi_zone_id, '110048', 'New Delhi', 'Delhi', true),
        (delhi_zone_id, '110049', 'New Delhi', 'Delhi', true),
        (delhi_zone_id, '110051', 'New Delhi', 'Delhi', true),
        (delhi_zone_id, '110052', 'New Delhi', 'Delhi', true),
        (delhi_zone_id, '110053', 'New Delhi', 'Delhi', true),
        (delhi_zone_id, '110054', 'New Delhi', 'Delhi', true),
        (delhi_zone_id, '110055', 'New Delhi', 'Delhi', true),
        (delhi_zone_id, '110056', 'New Delhi', 'Delhi', true),
        (delhi_zone_id, '110057', 'New Delhi', 'Delhi', true),
        (delhi_zone_id, '110058', 'New Delhi', 'Delhi', true),
        (delhi_zone_id, '110059', 'New Delhi', 'Delhi', true),
        (delhi_zone_id, '110060', 'New Delhi', 'Delhi', true),
        (delhi_zone_id, '110061', 'New Delhi', 'Delhi', true),
        (delhi_zone_id, '110062', 'New Delhi', 'Delhi', true),
        (delhi_zone_id, '110063', 'New Delhi', 'Delhi', true),
        (delhi_zone_id, '110064', 'New Delhi', 'Delhi', true),
        (delhi_zone_id, '110065', 'New Delhi', 'Delhi', true),
        (delhi_zone_id, '110066', 'New Delhi', 'Delhi', true),
        (delhi_zone_id, '110067', 'New Delhi', 'Delhi', true),
        (delhi_zone_id, '110068', 'New Delhi', 'Delhi', true),
        (delhi_zone_id, '110070', 'New Delhi', 'Delhi', true),
        (delhi_zone_id, '110071', 'New Delhi', 'Delhi', true),
        (delhi_zone_id, '110072', 'New Delhi', 'Delhi', true),
        (delhi_zone_id, '110073', 'New Delhi', 'Delhi', true),
        (delhi_zone_id, '110074', 'New Delhi', 'Delhi', true),
        (delhi_zone_id, '110075', 'New Delhi', 'Delhi', true),
        (delhi_zone_id, '110076', 'New Delhi', 'Delhi', true),
        (delhi_zone_id, '110077', 'New Delhi', 'Delhi', true),
        (delhi_zone_id, '110078', 'New Delhi', 'Delhi', true),
        (delhi_zone_id, '110080', 'New Delhi', 'Delhi', true),
        (delhi_zone_id, '110081', 'New Delhi', 'Delhi', true),
        (delhi_zone_id, '110082', 'New Delhi', 'Delhi', true),
        (delhi_zone_id, '110083', 'New Delhi', 'Delhi', true),
        (delhi_zone_id, '110084', 'New Delhi', 'Delhi', true),
        (delhi_zone_id, '110085', 'New Delhi', 'Delhi', true),
        (delhi_zone_id, '110086', 'New Delhi', 'Delhi', true),
        (delhi_zone_id, '110087', 'New Delhi', 'Delhi', true),
        (delhi_zone_id, '110088', 'New Delhi', 'Delhi', true),
        (delhi_zone_id, '110091', 'New Delhi', 'Delhi', true),
        (delhi_zone_id, '110092', 'New Delhi', 'Delhi', true),
        (delhi_zone_id, '110093', 'New Delhi', 'Delhi', true),
        (delhi_zone_id, '110094', 'New Delhi', 'Delhi', true),
        (delhi_zone_id, '110095', 'New Delhi', 'Delhi', true),
        (delhi_zone_id, '110096', 'New Delhi', 'Delhi', true),
        (delhi_zone_id, '201016', 'Ghaziabad', 'Uttar Pradesh', true),
        (delhi_zone_id, '201301', 'Noida', 'Uttar Pradesh', true),
        (delhi_zone_id, '201303', 'Noida', 'Uttar Pradesh', true),
        (delhi_zone_id, '201304', 'Noida', 'Uttar Pradesh', true),
        (delhi_zone_id, '201305', 'Noida', 'Uttar Pradesh', true),
        (delhi_zone_id, '201306', 'Noida', 'Uttar Pradesh', true),
        (delhi_zone_id, '201307', 'Noida', 'Uttar Pradesh', true),
        (delhi_zone_id, '201308', 'Noida', 'Uttar Pradesh', true),
        (delhi_zone_id, '201309', 'Noida', 'Uttar Pradesh', true),
        (delhi_zone_id, '201310', 'Noida', 'Uttar Pradesh', true),
        (delhi_zone_id, '122001', 'Gurgaon', 'Haryana', true),
        (delhi_zone_id, '122002', 'Gurgaon', 'Haryana', true),
        (delhi_zone_id, '122003', 'Gurgaon', 'Haryana', true),
        (delhi_zone_id, '122004', 'Gurgaon', 'Haryana', true),
        (delhi_zone_id, '122005', 'Gurgaon', 'Haryana', true),
        (delhi_zone_id, '122006', 'Gurgaon', 'Haryana', true),
        (delhi_zone_id, '122007', 'Gurgaon', 'Haryana', true),
        (delhi_zone_id, '122008', 'Gurgaon', 'Haryana', true),
        (delhi_zone_id, '122009', 'Gurgaon', 'Haryana', true),
        (delhi_zone_id, '122010', 'Gurgaon', 'Haryana', true),
        (delhi_zone_id, '122011', 'Gurgaon', 'Haryana', true),
        (delhi_zone_id, '122015', 'Gurgaon', 'Haryana', true),
        (delhi_zone_id, '122016', 'Gurgaon', 'Haryana', true),
        (delhi_zone_id, '122017', 'Gurgaon', 'Haryana', true),
        (delhi_zone_id, '122018', 'Gurgaon', 'Haryana', true),
        (delhi_zone_id, '121001', 'Faridabad', 'Haryana', true),
        (delhi_zone_id, '121002', 'Faridabad', 'Haryana', true),
        (delhi_zone_id, '121003', 'Faridabad', 'Haryana', true),
        (delhi_zone_id, '121004', 'Faridabad', 'Haryana', true),
        (delhi_zone_id, '121005', 'Faridabad', 'Haryana', true),
        (delhi_zone_id, '121006', 'Faridabad', 'Haryana', true),
        (delhi_zone_id, '121007', 'Faridabad', 'Haryana', true),
        (delhi_zone_id, '121008', 'Faridabad', 'Haryana', true),
        (delhi_zone_id, '121009', 'Faridabad', 'Haryana', true),
        (delhi_zone_id, '121010', 'Faridabad', 'Haryana', true)
    ON CONFLICT (zone_id, pincode) DO NOTHING;

    -- Insert some Mumbai pincodes
    INSERT INTO zone_pincodes (zone_id, pincode, city, state, is_active) VALUES
        (mumbai_zone_id, '400001', 'Mumbai', 'Maharashtra', true),
        (mumbai_zone_id, '400002', 'Mumbai', 'Maharashtra', true),
        (mumbai_zone_id, '400003', 'Mumbai', 'Maharashtra', true),
        (mumbai_zone_id, '400004', 'Mumbai', 'Maharashtra', true),
        (mumbai_zone_id, '400005', 'Mumbai', 'Maharashtra', true),
        (mumbai_zone_id, '400006', 'Mumbai', 'Maharashtra', true),
        (mumbai_zone_id, '400007', 'Mumbai', 'Maharashtra', true),
        (mumbai_zone_id, '400008', 'Mumbai', 'Maharashtra', true),
        (mumbai_zone_id, '400009', 'Mumbai', 'Maharashtra', true),
        (mumbai_zone_id, '400010', 'Mumbai', 'Maharashtra', true),
        (mumbai_zone_id, '400011', 'Mumbai', 'Maharashtra', true),
        (mumbai_zone_id, '400012', 'Mumbai', 'Maharashtra', true),
        (mumbai_zone_id, '400013', 'Mumbai', 'Maharashtra', true),
        (mumbai_zone_id, '400014', 'Mumbai', 'Maharashtra', true),
        (mumbai_zone_id, '400015', 'Mumbai', 'Maharashtra', true),
        (mumbai_zone_id, '400016', 'Mumbai', 'Maharashtra', true),
        (mumbai_zone_id, '400017', 'Mumbai', 'Maharashtra', true),
        (mumbai_zone_id, '400018', 'Mumbai', 'Maharashtra', true),
        (mumbai_zone_id, '400019', 'Mumbai', 'Maharashtra', true),
        (mumbai_zone_id, '400020', 'Mumbai', 'Maharashtra', true),
        (mumbai_zone_id, '400021', 'Mumbai', 'Maharashtra', true),
        (mumbai_zone_id, '400022', 'Mumbai', 'Maharashtra', true),
        (mumbai_zone_id, '400023', 'Mumbai', 'Maharashtra', true),
        (mumbai_zone_id, '400024', 'Mumbai', 'Maharashtra', true),
        (mumbai_zone_id, '400025', 'Mumbai', 'Maharashtra', true),
        (mumbai_zone_id, '400026', 'Mumbai', 'Maharashtra', true),
        (mumbai_zone_id, '400027', 'Mumbai', 'Maharashtra', true),
        (mumbai_zone_id, '400028', 'Mumbai', 'Maharashtra', true),
        (mumbai_zone_id, '400029', 'Mumbai', 'Maharashtra', true),
        (mumbai_zone_id, '400030', 'Mumbai', 'Maharashtra', true)
    ON CONFLICT (zone_id, pincode) DO NOTHING;

    -- Insert some Bangalore pincodes  
    INSERT INTO zone_pincodes (zone_id, pincode, city, state, is_active) VALUES
        (bangalore_zone_id, '560001', 'Bangalore', 'Karnataka', true),
        (bangalore_zone_id, '560002', 'Bangalore', 'Karnataka', true),
        (bangalore_zone_id, '560003', 'Bangalore', 'Karnataka', true),
        (bangalore_zone_id, '560004', 'Bangalore', 'Karnataka', true),
        (bangalore_zone_id, '560005', 'Bangalore', 'Karnataka', true),
        (bangalore_zone_id, '560006', 'Bangalore', 'Karnataka', true),
        (bangalore_zone_id, '560007', 'Bangalore', 'Karnataka', true),
        (bangalore_zone_id, '560008', 'Bangalore', 'Karnataka', true),
        (bangalore_zone_id, '560009', 'Bangalore', 'Karnataka', true),
        (bangalore_zone_id, '560010', 'Bangalore', 'Karnataka', true),
        (bangalore_zone_id, '560011', 'Bangalore', 'Karnataka', true),
        (bangalore_zone_id, '560012', 'Bangalore', 'Karnataka', true),
        (bangalore_zone_id, '560013', 'Bangalore', 'Karnataka', true),
        (bangalore_zone_id, '560014', 'Bangalore', 'Karnataka', true),
        (bangalore_zone_id, '560015', 'Bangalore', 'Karnataka', true),
        (bangalore_zone_id, '560016', 'Bangalore', 'Karnataka', true),
        (bangalore_zone_id, '560017', 'Bangalore', 'Karnataka', true),
        (bangalore_zone_id, '560018', 'Bangalore', 'Karnataka', true),
        (bangalore_zone_id, '560019', 'Bangalore', 'Karnataka', true),
        (bangalore_zone_id, '560020', 'Bangalore', 'Karnataka', true)
    ON CONFLICT (zone_id, pincode) DO NOTHING;

END $$;

-- Create some sample products if they don't exist
INSERT INTO products (name, description, price, old_price, category, brand_name, active, image)
VALUES 
  ('Sample Product 1', 'This is a sample product for testing delivery validation', 299.99, 399.99, 'Electronics', 'SampleBrand', true, '/prod1.png'),
  ('Sample Product 2', 'Another sample product for testing', 199.99, 249.99, 'Health', 'SampleBrand', true, '/prod2.png'),
  ('Sample Product 3', 'Third sample product', 99.99, 129.99, 'Groceries', 'SampleBrand', true, '/prod3.png')
ON CONFLICT DO NOTHING;

-- Success message
SELECT 'Sample data inserted successfully. You can now test delivery validation with pincodes like 201016, 110001, 400001, 560001' as message;