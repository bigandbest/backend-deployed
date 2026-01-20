/*
  Warnings:

  - The values [grocery,food,service,b2b] on the enum `Vertical` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `image_url` on the `product_variants` table. All the data in the column will be lost.
  - You are about to drop the column `featured` on the `products` table. All the data in the column will be lost.
  - You are about to drop the column `image` on the `products` table. All the data in the column will be lost.
  - You are about to drop the column `popular` on the `products` table. All the data in the column will be lost.
  - You are about to drop the `Store` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `SubStore` table. If the table is not empty, all the data it contains will be lost.
  - Made the column `role` on table `users` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "Vertical_new" AS ENUM ('qwik', 'eato', 'bazar', 'star');
ALTER TABLE "products" ALTER COLUMN "vertical" DROP DEFAULT;
ALTER TABLE "products" ALTER COLUMN "vertical" TYPE "Vertical_new" USING ("vertical"::text::"Vertical_new");
ALTER TYPE "Vertical" RENAME TO "Vertical_old";
ALTER TYPE "Vertical_new" RENAME TO "Vertical";
DROP TYPE "Vertical_old";
ALTER TABLE "products" ALTER COLUMN "vertical" SET DEFAULT 'qwik';
COMMIT;

-- DropForeignKey
ALTER TABLE "recommended_store" DROP CONSTRAINT "recommended_store_banner_id_fkey";

-- AlterTable
ALTER TABLE "add_banner" ADD COLUMN     "description" VARCHAR;

-- AlterTable
ALTER TABLE "enquiries" ADD COLUMN     "quantity" VARCHAR,
ADD COLUMN     "subject" VARCHAR;

-- AlterTable
ALTER TABLE "product_enquiries" ALTER COLUMN "expires_at" SET DEFAULT CURRENT_TIMESTAMP + interval '7 days';

-- AlterTable
ALTER TABLE "product_variants" DROP COLUMN "image_url",
ADD COLUMN     "images" TEXT[];

-- AlterTable
ALTER TABLE "products" DROP COLUMN "featured",
DROP COLUMN "image",
DROP COLUMN "popular",
ADD COLUMN     "gst_rate" DECIMAL DEFAULT 0,
ADD COLUMN     "hsn_code" VARCHAR,
ADD COLUMN     "images" TEXT[],
ADD COLUMN     "sac_code" VARCHAR,
ADD COLUMN     "store_id" UUID,
ADD COLUMN     "video_url" TEXT[],
ALTER COLUMN "vertical" SET DEFAULT 'qwik';

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "role" SET NOT NULL;

-- DropTable
DROP TABLE "Store";

-- DropTable
DROP TABLE "SubStore";

-- CreateTable
CREATE TABLE "banners" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "title" VARCHAR NOT NULL,
    "subtitle" VARCHAR,
    "description" VARCHAR,
    "image_url" TEXT,
    "link" VARCHAR,
    "banner_type" VARCHAR,
    "position" VARCHAR,
    "bg_color" VARCHAR,
    "button_text" VARCHAR,
    "discount_text" VARCHAR,
    "active" BOOLEAN DEFAULT true,
    "is_mobile" BOOLEAN DEFAULT false,
    "display_order" INTEGER DEFAULT 0,
    "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "banners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_deals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "title" VARCHAR,
    "image_url" TEXT,
    "discount" VARCHAR,
    "badge" VARCHAR,
    "sort_order" INTEGER DEFAULT 0,
    "active" BOOLEAN DEFAULT true,
    "banner_id" UUID,
    "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_deals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_deals_product" (
    "daily_deal_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,

    CONSTRAINT "daily_deals_product_pkey" PRIMARY KEY ("daily_deal_id","product_id")
);

-- CreateTable
CREATE TABLE "delivery_charge_milestones" (
    "id" SERIAL NOT NULL,
    "min_order_value" DECIMAL NOT NULL,
    "delivery_charge" DECIMAL NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_charge_milestones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_section_categories" (
    "id" SERIAL NOT NULL,
    "section_id" INTEGER NOT NULL,
    "category_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_section_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_section_groups" (
    "id" SERIAL NOT NULL,
    "section_id" INTEGER NOT NULL,
    "group_id" UUID NOT NULL,
    "is_active" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_section_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotional_media" (
    "id" SERIAL NOT NULL,
    "media_type" VARCHAR NOT NULL,
    "title" VARCHAR,
    "description" TEXT,
    "image_url" TEXT,
    "video_url" TEXT,
    "thumbnail_url" TEXT,
    "link" TEXT,
    "link_type" TEXT DEFAULT 'external',
    "resource_id" TEXT,
    "sub_resource_id" TEXT,
    "position" INTEGER DEFAULT 0,
    "active" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "promotional_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "store_section_mappings" (
    "id" SERIAL NOT NULL,
    "store_id" UUID,
    "section_id" INTEGER,
    "product_id" UUID,
    "mapping_type" VARCHAR,
    "is_active" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "store_section_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stores" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT,
    "link" TEXT,
    "image" TEXT,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stores_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "delivery_charge_milestones_min_order_value_key" ON "delivery_charge_milestones"("min_order_value");

-- CreateIndex
CREATE UNIQUE INDEX "product_section_categories_section_id_category_id_key" ON "product_section_categories"("section_id", "category_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_section_groups_section_id_group_id_key" ON "product_section_groups"("section_id", "group_id");

-- AddForeignKey
ALTER TABLE "daily_deals" ADD CONSTRAINT "daily_deals_banner_id_fkey" FOREIGN KEY ("banner_id") REFERENCES "add_banner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_deals_product" ADD CONSTRAINT "daily_deals_product_daily_deal_id_fkey" FOREIGN KEY ("daily_deal_id") REFERENCES "daily_deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_deals_product" ADD CONSTRAINT "daily_deals_product_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_section_categories" ADD CONSTRAINT "product_section_categories_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "product_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_section_categories" ADD CONSTRAINT "product_section_categories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_section_groups" ADD CONSTRAINT "product_section_groups_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "product_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_section_groups" ADD CONSTRAINT "product_section_groups_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommended_store" ADD CONSTRAINT "recommended_store_banner_id_fkey" FOREIGN KEY ("banner_id") REFERENCES "banners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_section_mappings" ADD CONSTRAINT "store_section_mappings_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "recommended_store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_section_mappings" ADD CONSTRAINT "store_section_mappings_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "product_sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_section_mappings" ADD CONSTRAINT "store_section_mappings_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
