-- Migration: Add weight_display column to products table
-- Date: 2025-12-19
-- Purpose: Fix production error "Could not find the 'weight_display' column"

-- Add weight_display column to products table
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS weight_display TEXT;

-- Add comment for documentation
COMMENT ON COLUMN products.weight_display IS 'Display text for product weight (e.g., "500g", "1kg", "2L")';

-- Note: No default values set - weight_display will be NULL for existing products
-- Products can be updated individually through the admin panel

-- Verification query
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'products' AND column_name = 'weight_display';
