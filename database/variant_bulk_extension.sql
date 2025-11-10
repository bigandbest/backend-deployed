-- Variant Bulk Order Extension
-- Add variant support to existing bulk order system

-- 1. Extend bulk_product_settings to support variants
ALTER TABLE bulk_product_settings ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES product_variants(id);
ALTER TABLE bulk_product_settings ADD COLUMN IF NOT EXISTS is_variant_bulk BOOLEAN DEFAULT FALSE;

-- 2. Extend wholesale_bulk_order_items to include variant data
ALTER TABLE wholesale_bulk_order_items ADD COLUMN IF NOT EXISTS variant_id UUID;
ALTER TABLE wholesale_bulk_order_items ADD COLUMN IF NOT EXISTS variant_name VARCHAR(255);
ALTER TABLE wholesale_bulk_order_items ADD COLUMN IF NOT EXISTS variant_weight VARCHAR(100);
ALTER TABLE wholesale_bulk_order_items ADD COLUMN IF NOT EXISTS variant_unit VARCHAR(50);

-- 3. Extend bulk_order_enquiries to support variant enquiries
ALTER TABLE bulk_order_enquiries ADD COLUMN IF NOT EXISTS variant_id UUID;
ALTER TABLE bulk_order_enquiries ADD COLUMN IF NOT EXISTS variant_details TEXT;

-- 4. Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_bulk_settings_variant ON bulk_product_settings(variant_id);
CREATE INDEX IF NOT EXISTS idx_bulk_order_items_variant ON wholesale_bulk_order_items(variant_id);
CREATE INDEX IF NOT EXISTS idx_bulk_enquiries_variant ON bulk_order_enquiries(variant_id);

-- 5. Create composite indexes for product + variant queries
CREATE INDEX IF NOT EXISTS idx_bulk_settings_product_variant ON bulk_product_settings(product_id, variant_id);