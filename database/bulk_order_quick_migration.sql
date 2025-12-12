-- Quick Migration Script for Bulk Orders
-- Run this if you only need the essential columns

-- Products table
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS enable_bulk_pricing BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS bulk_min_quantity INTEGER DEFAULT 50,
ADD COLUMN IF NOT EXISTS bulk_discount_percentage DECIMAL(5,2) DEFAULT 0;

-- Orders table
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS is_bulk_order BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS bulk_order_type VARCHAR(50);

-- Order items table
ALTER TABLE order_items 
ADD COLUMN IF NOT EXISTS is_bulk_order BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS bulk_range VARCHAR(100),
ADD COLUMN IF NOT EXISTS original_price DECIMAL(10,2);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_products_bulk_pricing ON products(enable_bulk_pricing) WHERE enable_bulk_pricing = TRUE;
CREATE INDEX IF NOT EXISTS idx_orders_is_bulk ON orders(is_bulk_order);
CREATE INDEX IF NOT EXISTS idx_order_items_is_bulk ON order_items(is_bulk_order);
