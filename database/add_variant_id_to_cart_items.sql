-- Add variant_id column to cart_items table
ALTER TABLE cart_items 
ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES product_variants(id);

-- Add index for better performance
CREATE INDEX IF NOT EXISTS idx_cart_items_variant ON cart_items(variant_id);
