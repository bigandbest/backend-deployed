-- Migration: Replace bulk_discount_percentage with direct bulk_price input
-- bulk_price already stores the actual price; bulk_discount_percentage is no longer needed.
ALTER TABLE product_variants DROP COLUMN IF EXISTS bulk_discount_percentage;
