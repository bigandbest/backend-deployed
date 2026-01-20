/*
  Warnings:

  - The primary key for the `variant_attributes` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `created_at` on the `variant_attributes` table. All the data in the column will be lost.
  - The `id` column on the `variant_attributes` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Changed the type of `media_type` on the `product_media` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('image', 'video');

-- DropIndex
DROP INDEX "variant_attributes_attribute_name_attribute_value_idx";

-- DropIndex
DROP INDEX "variant_attributes_variant_id_attribute_name_key";

-- AlterTable
ALTER TABLE "product_enquiries" ALTER COLUMN "expires_at" SET DEFAULT CURRENT_TIMESTAMP + interval '7 days';

-- AlterTable
ALTER TABLE "product_media" DROP COLUMN "media_type",
ADD COLUMN     "media_type" "MediaType" NOT NULL;

-- AlterTable
ALTER TABLE "product_variants" ADD COLUMN     "gst_rate_override" DECIMAL,
ADD COLUMN     "packaging_details" TEXT;

-- AlterTable
ALTER TABLE "variant_attributes" DROP CONSTRAINT "variant_attributes_pkey",
DROP COLUMN "created_at",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL DEFAULT gen_random_uuid(),
ALTER COLUMN "attribute_name" SET DATA TYPE TEXT,
ALTER COLUMN "attribute_value" SET DATA TYPE TEXT,
ADD CONSTRAINT "variant_attributes_pkey" PRIMARY KEY ("id");

-- CreateIndex
CREATE INDEX "variant_attributes_variant_id_idx" ON "variant_attributes"("variant_id");

-- CreateIndex
CREATE INDEX "variant_attributes_attribute_name_idx" ON "variant_attributes"("attribute_name");
