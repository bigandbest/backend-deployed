-- Add separate columns for the Business Partner Inquiry form fields

ALTER TABLE "enquiries"
  ADD COLUMN IF NOT EXISTS "address" TEXT;

ALTER TABLE "enquiries"
  ADD COLUMN IF NOT EXISTS "city" VARCHAR;

ALTER TABLE "enquiries"
  ADD COLUMN IF NOT EXISTS "state" VARCHAR;

ALTER TABLE "enquiries"
  ADD COLUMN IF NOT EXISTS "partnership_type" VARCHAR;
