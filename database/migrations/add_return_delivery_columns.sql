-- Migration: Add Return Policy and Quick Delivery Settings
-- Run this in Supabase SQL Editor or your database client

ALTER TABLE products 
ADD COLUMN IF NOT EXISTS return_applicable BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS return_days INTEGER DEFAULT 7,
ADD COLUMN IF NOT EXISTS quick_delivery BOOLEAN DEFAULT false;

-- Add comments for documentation
COMMENT ON COLUMN products.return_applicable IS 'Whether product can be returned/exchanged';
COMMENT ON COLUMN products.return_days IS 'Number of days within which return is allowed';
COMMENT ON COLUMN products.quick_delivery IS 'Whether product qualifies for fast/quick delivery';
