-- Shop By Category (CATEGORY_GRID) is now controlled ONLY by section_subcategory_mappings (owner decision 2026-09-23).
-- Web (ShopByCategory.jsx) and mobile (CategoryGridSection.tsx) used to hardcode a 5-category whitelist:
--   Beauty & Personal Care · Grocery & Food · Home & Kitchen · School, Office & Stationery · Snacks & Beverages
-- so what customers see today is "every subcategory of those 5 categories". This migration turns that whitelist into
-- backend configuration so the frontend list can be deleted with NO visible change:
--   1. every active subcategory of the 5 categories gets an ACTIVE mapping row (created if missing, re-activated if off);
--   2. every mapping row of any other category is set is_active = false (kept, not deleted — the admin can re-enable it).
-- GUARD: nothing happens unless the 5 categories exist and the section exists, so an environment with different
-- category names is left untouched (its admin must then map subcategories on the Category Mapping page).
-- Idempotent. ROLLBACK (restores the old "everything mapped" state): 
--   UPDATE section_subcategory_mappings SET is_active = true
--   WHERE section_id = (SELECT id FROM product_sections WHERE section_key = 'shop_by_category');

DO $$
DECLARE
  sid int;
  keep uuid[];
BEGIN
  SELECT id INTO sid FROM product_sections WHERE section_key = 'shop_by_category';
  SELECT array_agg(id) INTO keep FROM categories
   WHERE lower(trim(name)) IN ('beauty & personal care','grocery & food','home & kitchen','school, office & stationery','snacks & beverages');

  IF sid IS NULL OR keep IS NULL THEN
    RAISE NOTICE 'shop_by_category whitelist conversion skipped (section or whitelisted categories not found)';
    RETURN;
  END IF;

  -- 1a. re-activate existing mappings of the whitelisted categories
  UPDATE section_subcategory_mappings m SET is_active = true
  FROM subcategories sc
  WHERE m.section_id = sid AND sc.id = m.subcategory_id AND sc.category_id = ANY(keep) AND m.is_active IS DISTINCT FROM true;

  -- 1b. create missing mappings for active subcategories of the whitelisted categories
  INSERT INTO section_subcategory_mappings (section_id, subcategory_id, display_order, is_active)
  SELECT sid, sc.id, 0, true FROM subcategories sc
  WHERE sc.category_id = ANY(keep) AND sc.active = true
    AND NOT EXISTS (SELECT 1 FROM section_subcategory_mappings m WHERE m.section_id = sid AND m.subcategory_id = sc.id);

  -- 2. switch off mappings that belong to any other category
  UPDATE section_subcategory_mappings m SET is_active = false
  FROM subcategories sc
  WHERE m.section_id = sid AND sc.id = m.subcategory_id AND NOT (sc.category_id = ANY(keep)) AND m.is_active IS DISTINCT FROM false;
END $$;
