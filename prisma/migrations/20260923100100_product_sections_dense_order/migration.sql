-- product_sections.display_order: ONE ordering model. Dense 1..N over ALL rows, ordered
--   display_order ASC NULLS LAST, id ASC   (the exact order the homepage feed and the admin list already use).
-- Replaces the 10,20,30… backfill scale AND the 1..n-of-active-rows scale the admin used to write (which left hidden
-- rows on a stale scale). From now on PATCH /product-sections/order (SectionOrderService) is the single writer.
--
-- Visible order is unchanged: this only renumbers, it never reorders (ties are broken by id, as before).
-- Idempotent: re-running changes nothing. The original values are kept in a backup table for rollback.
--
-- ROLLBACK:
--   UPDATE product_sections s SET display_order = b.display_order
--   FROM product_sections_display_order_backup_20260923 b WHERE b.id = s.id;
--   DROP TABLE product_sections_display_order_backup_20260923;

CREATE TABLE IF NOT EXISTS "product_sections_display_order_backup_20260923" AS
  SELECT "id", "display_order" FROM "product_sections";

UPDATE "product_sections" s
SET "display_order" = r.pos
FROM (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "display_order" ASC NULLS LAST, "id" ASC)::int AS pos
  FROM "product_sections"
) r
WHERE s."id" = r."id" AND s."display_order" IS DISTINCT FROM r.pos;
