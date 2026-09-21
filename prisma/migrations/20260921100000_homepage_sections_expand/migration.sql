-- Homepage feed v2 — M1 EXPAND (additive only; safe to deploy before any code reads it)
-- Rollback: see bottom of file. Nothing here changes existing columns or data.

ALTER TABLE "product_sections"
  ADD COLUMN IF NOT EXISTS "section_type"      VARCHAR(50),
  ADD COLUMN IF NOT EXISTS "config"            JSONB        NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS "config_version"    INTEGER      NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "platforms"         TEXT[]       NOT NULL DEFAULT ARRAY['web','mobile']::TEXT[],
  ADD COLUMN IF NOT EXISTS "load_mode"         VARCHAR(10)  NOT NULL DEFAULT 'AUTO',
  ADD COLUMN IF NOT EXISTS "show_on_home"      BOOLEAN      NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS "parent_section_id" INTEGER,
  ADD COLUMN IF NOT EXISTS "slot"              VARCHAR(20),
  ADD COLUMN IF NOT EXISTS "updated_by"        VARCHAR(64);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_sections_parent_section_id_fkey') THEN
    ALTER TABLE "product_sections"
      ADD CONSTRAINT "product_sections_parent_section_id_fkey"
      FOREIGN KEY ("parent_section_id") REFERENCES "product_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_ps_load_mode') THEN
    ALTER TABLE "product_sections" ADD CONSTRAINT "ck_ps_load_mode" CHECK ("load_mode" IN ('AUTO','INITIAL','DEFERRED'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_ps_slot') THEN
    ALTER TABLE "product_sections" ADD CONSTRAINT "ck_ps_slot" CHECK ("slot" IS NULL OR "slot" IN ('left','right'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_ps_platforms') THEN
    ALTER TABLE "product_sections" ADD CONSTRAINT "ck_ps_platforms" CHECK (cardinality("platforms") > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_ps_not_self_parent') THEN
    ALTER TABLE "product_sections" ADD CONSTRAINT "ck_ps_not_self_parent" CHECK ("parent_section_id" IS NULL OR "parent_section_id" <> "id");
  END IF;
END $$;

-- product_sections is tiny (tens of rows) so plain CREATE INDEX is fine inside Prisma's migration transaction.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_product_sections_parent_slot" ON "product_sections"("parent_section_id", "slot");
CREATE INDEX IF NOT EXISTS "idx_product_sections_feed"   ON "product_sections"("is_active", "show_on_home", "display_order", "id");
CREATE INDEX IF NOT EXISTS "idx_product_sections_parent" ON "product_sections"("parent_section_id");

-- Deterministic ordering columns for tile mappings (additive)
ALTER TABLE "product_section_categories" ADD COLUMN IF NOT EXISTS "display_order" INTEGER DEFAULT 0;
ALTER TABLE "product_section_groups"     ADD COLUMN IF NOT EXISTS "display_order" INTEGER DEFAULT 0;

-- Audit trail
CREATE TABLE IF NOT EXISTS "section_audit_log" (
  "id"         BIGSERIAL PRIMARY KEY,
  "section_id" INTEGER REFERENCES "product_sections"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "actor_id"   VARCHAR(64),
  "actor_role" VARCHAR(32),
  "action"     VARCHAR(40) NOT NULL,
  "diff"       JSONB,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_section_audit_log_section_time" ON "section_audit_log"("section_id", "created_at");

-- ROLLBACK (manual, data-free until admin code writes to these):
--   DROP TABLE "section_audit_log";
--   ALTER TABLE "product_section_groups" DROP COLUMN "display_order";
--   ALTER TABLE "product_section_categories" DROP COLUMN "display_order";
--   DROP INDEX "idx_product_sections_parent","idx_product_sections_feed","uq_product_sections_parent_slot";
--   ALTER TABLE "product_sections" DROP COLUMN "updated_by","slot","parent_section_id","show_on_home","load_mode","platforms","config_version","config","section_type";
