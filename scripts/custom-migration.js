import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🚀 Starting safe custom migration...");

  try {
    // 1. Create faq_templates table
    console.log("Creating faq_templates table...");
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "public"."faq_templates" (
          "id" UUID NOT NULL DEFAULT gen_random_uuid(),
          "title" TEXT NOT NULL,
          "faqs" JSONB NOT NULL,
          "category_id" UUID,
          "is_active" BOOLEAN DEFAULT true,
          "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          "updated_at" TIMESTAMPTZ,
          CONSTRAINT "faq_templates_pkey" PRIMARY KEY ("id")
      );
    `);
    console.log("✅ faq_templates table ready.");

    // 2. Add columns to products table safely
    console.log("Adding seller tracking columns to products...");

    // Add created_by
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'created_by') THEN
              ALTER TABLE "public"."products" ADD COLUMN "created_by" TEXT DEFAULT 'admin';
          END IF;
      END $$;
    `);

    // Add seller_id
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'seller_id') THEN
              ALTER TABLE "public"."products" ADD COLUMN "seller_id" UUID;
          END IF;
      END $$;
    `);

    console.log("✅ Seller tracking columns ready.");
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
