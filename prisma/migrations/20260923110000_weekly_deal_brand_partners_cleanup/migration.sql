-- Homepage cleanup (2026-09-23, product-owner request)
--  * weekly_deal      -> PRODUCT_CAROUSEL (MAPPED, two-rows layout), shown on home; admin maps products/categories/groups.
--                        Nothing mapped => EMPTY => omitted (no fallback).
--  * brand_partners   -> BRAND_PARTNERS (reads active rows of `partners`), shown on web.
--  * blog, product_sections_group -> removed (no data source / no consumer). Rows are backed up first.
-- Idempotent. ROLLBACK: restore rows from product_sections_removed_backup_20260923 and reset the two updated rows
-- (section_type = NULL, show_on_home = false).

CREATE TABLE IF NOT EXISTS product_sections_removed_backup_20260923 AS
  SELECT * FROM product_sections WHERE section_key IN ('blog', 'product_sections_group');

DELETE FROM product_sections WHERE section_key IN ('blog', 'product_sections_group');

UPDATE product_sections
   SET section_type = 'PRODUCT_CAROUSEL', show_on_home = true,
       config = '{"source":"MAPPED","limit":20,"layout":"two-rows","showSeeAll":false}'::jsonb,
       config_version = COALESCE(config_version, 0) + 1
 WHERE section_key = 'weekly_deal' AND section_type IS NULL;

UPDATE product_sections
   SET section_type = 'BRAND_PARTNERS', show_on_home = true,
       config = '{"limit":20}'::jsonb,
       config_version = COALESCE(config_version, 0) + 1
 WHERE section_key = 'brand_partners' AND section_type IS NULL;
