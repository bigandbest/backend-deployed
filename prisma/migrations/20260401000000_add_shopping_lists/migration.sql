-- CreateTable: shopping_lists
-- Safe: only creates new tables, zero changes to existing data

CREATE TABLE IF NOT EXISTS "shopping_lists" (
    "id"         UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id"    UUID NOT NULL,
    "name"       VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shopping_lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable: shopping_list_items
CREATE TABLE IF NOT EXISTS "shopping_list_items" (
    "id"         UUID NOT NULL DEFAULT gen_random_uuid(),
    "list_id"    UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "variant_id" UUID,
    "name"       VARCHAR(255) NOT NULL,
    "price"      DECIMAL(10,2) NOT NULL,
    "old_price"  DECIMAL(10,2),
    "image"      TEXT,
    "brand"      VARCHAR(100),
    "weight"     VARCHAR(50),
    "quantity"   INTEGER NOT NULL DEFAULT 1,
    "added_at"   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shopping_list_items_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey: shopping_lists -> users
ALTER TABLE "shopping_lists"
    ADD CONSTRAINT "shopping_lists_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: shopping_list_items -> shopping_lists
ALTER TABLE "shopping_list_items"
    ADD CONSTRAINT "shopping_list_items_list_id_fkey"
    FOREIGN KEY ("list_id") REFERENCES "shopping_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "shopping_lists_user_id_idx" ON "shopping_lists"("user_id");
CREATE INDEX IF NOT EXISTS "shopping_list_items_list_id_idx" ON "shopping_list_items"("list_id");
CREATE INDEX IF NOT EXISTS "shopping_list_items_product_id_idx" ON "shopping_list_items"("product_id");

-- updated_at trigger for shopping_lists
CREATE OR REPLACE FUNCTION update_shopping_lists_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER shopping_lists_updated_at
    BEFORE UPDATE ON "shopping_lists"
    FOR EACH ROW EXECUTE FUNCTION update_shopping_lists_updated_at();
