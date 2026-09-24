-- Supports the admin/public product list ORDER BY created_at DESC, id ASC (keyset-friendly).
-- Run this manually with CONCURRENTLY against a real DB connection (not inside a transaction,
-- and not via `prisma db push`/`migrate deploy`, which wrap DDL in a transaction and will error
-- on CONCURRENTLY). `prisma db push` will create a plain, blocking version of the same index
-- from the @@index([created_at, id]) added to prisma/models/products.prisma if this is skipped;
-- prefer running this file by hand on any table large enough for a blocking build to matter.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_created_at_id
  ON products(created_at DESC, id ASC);
