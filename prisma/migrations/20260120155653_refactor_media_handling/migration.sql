/*
  Warnings:

  - You are about to drop the column `images` on the `product_variants` table. All the data in the column will be lost.
  - You are about to drop the column `images` on the `products` table. All the data in the column will be lost.
  - You are about to drop the column `video_url` on the `products` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "product_enquiries" ALTER COLUMN "expires_at" SET DEFAULT CURRENT_TIMESTAMP + interval '7 days';

-- AlterTable
ALTER TABLE "product_variants" DROP COLUMN "images";

-- AlterTable
ALTER TABLE "products" DROP COLUMN "images",
DROP COLUMN "video_url";

-- CreateTable
CREATE TABLE "product_media" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "product_id" UUID NOT NULL,
    "variant_id" UUID,
    "media_type" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "thumbnail" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_media_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_media_product_id_idx" ON "product_media"("product_id");

-- CreateIndex
CREATE INDEX "product_media_variant_id_idx" ON "product_media"("variant_id");

-- AddForeignKey
ALTER TABLE "product_media" ADD CONSTRAINT "product_media_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_media" ADD CONSTRAINT "product_media_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
