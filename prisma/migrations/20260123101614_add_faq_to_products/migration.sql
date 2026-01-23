/*
  Warnings:

  - You are about to drop the column `hsn_code` on the `products` table. All the data in the column will be lost.
  - You are about to drop the column `sac_code` on the `products` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[variant_id,warehouse_id]` on the table `inventory` will be added. If there are existing duplicate values, this will fail.
  - Made the column `warehouse_id` on table `inventory` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "inventory" DROP CONSTRAINT "inventory_warehouse_id_fkey";

-- DropIndex
DROP INDEX "inventory_variant_id_key";

-- AlterTable
ALTER TABLE "charge_settings" ADD COLUMN     "discount_charge" DECIMAL NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "inventory" ADD COLUMN     "bulk_reserved_qty" INTEGER DEFAULT 0,
ADD COLUMN     "bulk_stock_threshold" INTEGER DEFAULT 0,
ALTER COLUMN "warehouse_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "product_variants" ADD COLUMN     "bulk_discount_percentage" INTEGER DEFAULT 0,
ADD COLUMN     "bulk_min_quantity" INTEGER,
ADD COLUMN     "bulk_price" DECIMAL,
ADD COLUMN     "cess_rate_override" DECIMAL,
ADD COLUMN     "is_bulk_enabled" BOOLEAN DEFAULT false;

-- AlterTable
ALTER TABLE "products" DROP COLUMN "hsn_code",
DROP COLUMN "sac_code",
ADD COLUMN     "cess_rate" DECIMAL DEFAULT 0,
ADD COLUMN     "faq" JSONB,
ADD COLUMN     "hsn_or_sac_code" VARCHAR;

-- AlterTable
ALTER TABLE "warehouse_pincodes" ADD COLUMN     "delivery_days" INTEGER DEFAULT 3;

-- CreateTable
CREATE TABLE "product_warehouse_stock" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "product_id" UUID NOT NULL,
    "variant_id" UUID,
    "warehouse_id" INTEGER NOT NULL,
    "stock_quantity" INTEGER NOT NULL DEFAULT 0,
    "reserved_quantity" INTEGER NOT NULL DEFAULT 0,
    "cost_per_unit" DECIMAL,
    "minimum_threshold" INTEGER DEFAULT 0,
    "reorder_point" INTEGER DEFAULT 0,
    "is_active" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "last_restocked_at" TIMESTAMPTZ(6),

    CONSTRAINT "product_warehouse_stock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_warehouse_stock_product_id_idx" ON "product_warehouse_stock"("product_id");

-- CreateIndex
CREATE INDEX "product_warehouse_stock_warehouse_id_idx" ON "product_warehouse_stock"("warehouse_id");

-- CreateIndex
CREATE INDEX "product_warehouse_stock_variant_id_idx" ON "product_warehouse_stock"("variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_variant_id_warehouse_id_key" ON "inventory"("variant_id", "warehouse_id");

-- CreateIndex
CREATE INDEX "idx_product_sections_active_order" ON "product_sections"("is_active", "display_order");

-- CreateIndex
CREATE INDEX "idx_product_sections_display_order" ON "product_sections"("display_order");

-- CreateIndex
CREATE INDEX "idx_product_sections_is_active" ON "product_sections"("is_active");

-- CreateIndex
CREATE INDEX "idx_product_sections_section_key" ON "product_sections"("section_key");

-- AddForeignKey
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_warehouse_stock" ADD CONSTRAINT "product_warehouse_stock_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_warehouse_stock" ADD CONSTRAINT "product_warehouse_stock_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_warehouse_stock" ADD CONSTRAINT "product_warehouse_stock_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
