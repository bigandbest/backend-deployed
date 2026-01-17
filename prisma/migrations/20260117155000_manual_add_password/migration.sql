-- Create UserRole enum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN', 'SELLER');

-- Alter users table to add password and role enum
ALTER TABLE "users" 
  ADD COLUMN "password" TEXT,
  ADD COLUMN "password_reset_token" TEXT,
  ADD COLUMN "password_reset_expires" TIMESTAMPTZ,
  ALTER COLUMN "role" DROP DEFAULT,
  ALTER COLUMN "role" TYPE "UserRole" USING (
    CASE 
      WHEN "role" = 'admin' THEN 'ADMIN'::"UserRole"
      WHEN "role" = 'seller' THEN 'SELLER'::"UserRole"
      ELSE 'USER'::"UserRole"
    END
  ),
  ALTER COLUMN "role" SET DEFAULT 'USER'::"UserRole";
