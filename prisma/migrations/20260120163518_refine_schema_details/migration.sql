-- AlterTable
ALTER TABLE "product_enquiries" ALTER COLUMN "expires_at" SET DEFAULT CURRENT_TIMESTAMP + interval '7 days';
