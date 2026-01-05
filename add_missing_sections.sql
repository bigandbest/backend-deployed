-- Quick fix: Add the 4 missing sections to product_sections table
-- Run this in your Supabase SQL Editor

INSERT INTO product_sections (section_key, section_name, is_active, display_order, component_name, description) VALUES
    ('dual_deals_left', 'Dual Deals - Best Selling (Left)', true, 31, 'DualDeals', 'Left panel of Dual Deals section - displays subcategories from mapped category'),
    ('dual_deals_right', 'Dual Deals - Trending (Right)', true, 32, 'DualDeals', 'Right panel of Dual Deals section - displays subcategories from mapped category'),
    ('discount_corner_left', 'Discount Corner - Left Panel', true, 33, 'DiscountCorner', 'Left panel of Discount Corner section - displays subcategories from mapped category'),
    ('discount_corner_right', 'Discount Corner - Right Panel', true, 34, 'DiscountCorner', 'Right panel of Discount Corner section - displays subcategories from mapped category')
ON CONFLICT (section_key) DO UPDATE SET
    section_name = EXCLUDED.section_name,
    component_name = EXCLUDED.component_name,
    description = EXCLUDED.description,
    updated_at = NOW();

-- Verify the sections were added
SELECT id, section_key, section_name, is_active FROM product_sections 
WHERE section_key IN ('dual_deals_left', 'dual_deals_right', 'discount_corner_left', 'discount_corner_right')
ORDER BY display_order;
