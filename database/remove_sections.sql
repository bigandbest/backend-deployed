-- Remove unwanted product sections from the database
-- Run this script to clean up the sections that were removed from the seed file

DELETE FROM product_sections 
WHERE section_key IN (
    'you_may_like',
    'athletes',
    'event_elevate',
    'shop_goals',
    'refresh_workspace',
    'instagram_reels'
);

-- Display remaining sections
SELECT 
    id,
    section_key,
    section_name,
    is_active,
    display_order,
    component_name
FROM product_sections 
ORDER BY display_order;

-- Summary statistics
SELECT 
    COUNT(*) as total_sections,
    COUNT(*) FILTER (WHERE is_active = true) as active_sections,
    COUNT(*) FILTER (WHERE is_active = false) as inactive_sections
FROM product_sections;
