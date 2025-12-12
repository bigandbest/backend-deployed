-- ============================================
-- Bulk Order Database Migration
-- ============================================
-- This migration adds bulk order support to products, orders, and order_items tables
-- Run this SQL in your Supabase SQL Editor

-- ============================================
-- 1. PRODUCTS TABLE - Add bulk pricing fields
-- ============================================

-- Add bulk pricing configuration fields to products table
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS enable_bulk_pricing BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS bulk_min_quantity INTEGER DEFAULT 50,
ADD COLUMN IF NOT EXISTS bulk_discount_percentage DECIMAL(5,2) DEFAULT 0;

-- Add index for bulk pricing queries
CREATE INDEX IF NOT EXISTS idx_products_bulk_pricing ON products(enable_bulk_pricing) WHERE enable_bulk_pricing = TRUE;

-- Add comment for documentation
COMMENT ON COLUMN products.enable_bulk_pricing IS 'Whether bulk pricing is enabled for this product';
COMMENT ON COLUMN products.bulk_min_quantity IS 'Minimum quantity required for bulk pricing';
COMMENT ON COLUMN products.bulk_discount_percentage IS 'Discount percentage for bulk orders';

-- ============================================
-- 2. ORDERS TABLE - Add bulk order tracking
-- ============================================

-- Add bulk order identification and metadata
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS is_bulk_order BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS bulk_order_type VARCHAR(50),
ADD COLUMN IF NOT EXISTS company_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS gst_number VARCHAR(50);

-- Add indexes for filtering bulk orders
CREATE INDEX IF NOT EXISTS idx_orders_is_bulk ON orders(is_bulk_order);
CREATE INDEX IF NOT EXISTS idx_orders_bulk_type ON orders(bulk_order_type) WHERE bulk_order_type IS NOT NULL;

-- Add comments
COMMENT ON COLUMN orders.is_bulk_order IS 'Automatically set to TRUE if any item in order qualifies for bulk pricing';
COMMENT ON COLUMN orders.bulk_order_type IS 'Type of bulk order: auto (quantity-based) or manual (B2B)';
COMMENT ON COLUMN orders.company_name IS 'Company name for B2B bulk orders';
COMMENT ON COLUMN orders.gst_number IS 'GST number for B2B bulk orders';

ALTER TABLE order_items 
ADD COLUMN IF NOT EXISTS is_bulk_order BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS bulk_range VARCHAR(100),
ADD COLUMN IF NOT EXISTS original_price DECIMAL(10,2);

-- Add indexes for bulk order item queries
CREATE INDEX IF NOT EXISTS idx_order_items_is_bulk ON order_items(is_bulk_order);
CREATE INDEX IF NOT EXISTS idx_order_items_bulk_range ON order_items(bulk_range) WHERE bulk_range IS NOT NULL;

-- Add comments
COMMENT ON COLUMN order_items.is_bulk_order IS 'TRUE if this item qualified for bulk pricing';
COMMENT ON COLUMN order_items.bulk_range IS 'Quantity range for bulk pricing (e.g., "50+" or "50-100")';
COMMENT ON COLUMN order_items.original_price IS 'Original price before bulk discount was applied';


CREATE TABLE IF NOT EXISTS bulk_product_settings (
    id SERIAL PRIMARY KEY,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    variant_id UUID REFERENCES product_variants(id) ON DELETE CASCADE,
    
    -- Quantity thresholds
    min_quantity INTEGER NOT NULL DEFAULT 50,
    max_quantity INTEGER,
    
    -- Pricing
    bulk_price DECIMAL(10,2) NOT NULL,
    discount_percentage DECIMAL(5,2) DEFAULT 0,
    
    -- Configuration
    is_bulk_enabled BOOLEAN DEFAULT TRUE,
    is_variant_bulk BOOLEAN DEFAULT FALSE,
    tier_name VARCHAR(100),
    
    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add indexes for bulk settings
CREATE INDEX IF NOT EXISTS idx_bulk_settings_product ON bulk_product_settings(product_id);
CREATE INDEX IF NOT EXISTS idx_bulk_settings_variant ON bulk_product_settings(variant_id);
CREATE INDEX IF NOT EXISTS idx_bulk_settings_enabled ON bulk_product_settings(is_bulk_enabled) WHERE is_bulk_enabled = TRUE;
CREATE INDEX IF NOT EXISTS idx_bulk_settings_product_variant ON bulk_product_settings(product_id, variant_id);

-- Add unique constraint to prevent duplicate settings
CREATE UNIQUE INDEX IF NOT EXISTS idx_bulk_settings_unique 
ON bulk_product_settings(product_id, COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- Add comments
COMMENT ON TABLE bulk_product_settings IS 'Advanced bulk pricing configurations for products and variants';
COMMENT ON COLUMN bulk_product_settings.product_id IS 'Product this bulk setting applies to';
COMMENT ON COLUMN bulk_product_settings.variant_id IS 'Variant this bulk setting applies to (NULL for main product)';
COMMENT ON COLUMN bulk_product_settings.min_quantity IS 'Minimum quantity to qualify for bulk pricing';
COMMENT ON COLUMN bulk_product_settings.max_quantity IS 'Maximum quantity for this tier (NULL for unlimited)';
COMMENT ON COLUMN bulk_product_settings.bulk_price IS 'Price per unit for bulk orders';
COMMENT ON COLUMN bulk_product_settings.discount_percentage IS 'Discount percentage applied';
COMMENT ON COLUMN bulk_product_settings.is_bulk_enabled IS 'Whether this bulk pricing is active';
COMMENT ON COLUMN bulk_product_settings.is_variant_bulk IS 'TRUE if this is variant-specific bulk pricing';
COMMENT ON COLUMN bulk_product_settings.tier_name IS 'Optional name for this pricing tier';

-- ============================================
-- 5. HELPER FUNCTIONS
-- ============================================

-- Function to calculate bulk price from discount percentage
CREATE OR REPLACE FUNCTION calculate_bulk_price(
    regular_price DECIMAL,
    discount_percentage DECIMAL
) RETURNS DECIMAL AS $$
BEGIN
    RETURN ROUND(regular_price * (1 - discount_percentage / 100), 2);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to check if quantity qualifies for bulk pricing
CREATE OR REPLACE FUNCTION is_bulk_quantity(
    product_id UUID,
    quantity INTEGER
) RETURNS BOOLEAN AS $$
DECLARE
    min_qty INTEGER;
    bulk_enabled BOOLEAN;
BEGIN
    SELECT 
        COALESCE(bps.min_quantity, p.bulk_min_quantity, 50),
        COALESCE(bps.is_bulk_enabled, p.enable_bulk_pricing, FALSE)
    INTO min_qty, bulk_enabled
    FROM products p
    LEFT JOIN bulk_product_settings bps ON bps.product_id = p.id AND bps.variant_id IS NULL
    WHERE p.id = product_id
    LIMIT 1;
    
    RETURN bulk_enabled AND quantity >= min_qty;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================
-- 6. TRIGGERS FOR AUTOMATIC UPDATES
-- ============================================

-- Trigger to update bulk_product_settings.updated_at
CREATE OR REPLACE FUNCTION update_bulk_settings_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_bulk_settings_timestamp
BEFORE UPDATE ON bulk_product_settings
FOR EACH ROW
EXECUTE FUNCTION update_bulk_settings_timestamp();

-- ============================================
-- 7. DATA VALIDATION
-- ============================================

-- Add check constraints
ALTER TABLE bulk_product_settings
ADD CONSTRAINT check_min_quantity_positive CHECK (min_quantity > 0),
ADD CONSTRAINT check_max_quantity_greater CHECK (max_quantity IS NULL OR max_quantity > min_quantity),
ADD CONSTRAINT check_bulk_price_positive CHECK (bulk_price >= 0),
ADD CONSTRAINT check_discount_percentage_range CHECK (discount_percentage >= 0 AND discount_percentage <= 100);

ALTER TABLE products
ADD CONSTRAINT check_bulk_min_quantity_positive CHECK (bulk_min_quantity > 0),
ADD CONSTRAINT check_bulk_discount_range CHECK (bulk_discount_percentage >= 0 AND bulk_discount_percentage <= 100);

-- ============================================
-- 8. SAMPLE DATA (Optional - for testing)
-- ============================================

-- Uncomment below to insert sample bulk pricing data

/*
-- Sample: Enable bulk pricing for existing products
UPDATE products 
SET 
    enable_bulk_pricing = TRUE,
    bulk_min_quantity = 50,
    bulk_discount_percentage = 10
WHERE id IN (
    SELECT id FROM products LIMIT 5
);

-- Sample: Create advanced bulk settings
INSERT INTO bulk_product_settings (product_id, variant_id, min_quantity, bulk_price, discount_percentage, tier_name)
SELECT 
    id,
    NULL,
    50,
    price * 0.9,
    10,
    'Tier 1: 50+ units'
FROM products 
WHERE enable_bulk_pricing = TRUE
LIMIT 5;
*/

-- ============================================
-- MIGRATION COMPLETE
-- ============================================

-- Verify migration
DO $$
DECLARE
    products_bulk_count INTEGER;
    orders_bulk_count INTEGER;
    order_items_bulk_count INTEGER;
    bulk_settings_count INTEGER;
BEGIN
    -- Count products with bulk pricing enabled
    SELECT COUNT(*) INTO products_bulk_count FROM products WHERE enable_bulk_pricing = TRUE;
    
    -- Count bulk orders
    SELECT COUNT(*) INTO orders_bulk_count FROM orders WHERE is_bulk_order = TRUE;
    
    -- Count bulk order items
    SELECT COUNT(*) INTO order_items_bulk_count FROM order_items WHERE is_bulk_order = TRUE;
    
    -- Count bulk settings
    SELECT COUNT(*) INTO bulk_settings_count FROM bulk_product_settings;
    
    RAISE NOTICE '=== BULK ORDER MIGRATION SUMMARY ===';
    RAISE NOTICE 'Products with bulk pricing enabled: %', products_bulk_count;
    RAISE NOTICE 'Bulk orders: %', orders_bulk_count;
    RAISE NOTICE 'Bulk order items: %', order_items_bulk_count;
    RAISE NOTICE 'Bulk product settings: %', bulk_settings_count;
    RAISE NOTICE '=== MIGRATION COMPLETE ===';
END $$;
