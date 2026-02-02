import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log("Adding columns to orders table safely...");

    try {
        // Add coupon_code column
        await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'coupon_code') THEN
              ALTER TABLE "orders" ADD COLUMN "coupon_code" VARCHAR;
              RAISE NOTICE 'Added coupon_code column';
          ELSE
              RAISE NOTICE 'coupon_code column already exists';
          END IF;
      END
      $$;
    `);

        // Add coupon_discount column
        await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'coupon_discount') THEN
              ALTER TABLE "orders" ADD COLUMN "coupon_discount" DECIMAL DEFAULT 0;
              RAISE NOTICE 'Added coupon_discount column';
          ELSE
              RAISE NOTICE 'coupon_discount column already exists';
          END IF;
      END
      $$;
    `);

        // Add mobile column
        await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'mobile') THEN
              ALTER TABLE "orders" ADD COLUMN "mobile" VARCHAR;
              RAISE NOTICE 'Added mobile column';
          ELSE
              RAISE NOTICE 'mobile column already exists';
          END IF;
      END
      $$;
    `);

        console.log("Migration completed successfully.");
    } catch (error) {
        console.error("Error running migration:", error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
