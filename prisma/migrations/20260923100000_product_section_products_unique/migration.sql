-- Product pinning: enforce ONE row per (section_id, product_id) and index section_id.
--
-- Step 1 resolves pre-existing duplicates deterministically BEFORE the unique index is created:
--   survivor = the row with the lowest display_order (NULL sorts last), then the oldest created_at, then the lowest id.
--   The survivor keeps its own display_order, so the admin-intended position of the pin is preserved.
--   Nothing is renumbered here; gaps in display_order are harmless (selection orders by display_order, id).
-- Step 2/3 are idempotent (IF NOT EXISTS) so re-running on an already-migrated database is safe.
--
-- ROLLBACK (manual, data deleted in step 1 is not restorable):
--   DROP INDEX IF EXISTS "product_section_products_section_id_product_id_key";
--   DROP INDEX IF EXISTS "product_section_products_section_id_idx";

DELETE FROM "product_section_products" p
USING (
  SELECT "id",
         ROW_NUMBER() OVER (
           PARTITION BY "section_id", "product_id"
           ORDER BY COALESCE("display_order", 2147483647) ASC, "created_at" ASC NULLS LAST, "id" ASC
         ) AS rn
  FROM "product_section_products"
) d
WHERE p."id" = d."id" AND d.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "product_section_products_section_id_product_id_key"
  ON "product_section_products" ("section_id", "product_id");

CREATE INDEX IF NOT EXISTS "product_section_products_section_id_idx"
  ON "product_section_products" ("section_id");
