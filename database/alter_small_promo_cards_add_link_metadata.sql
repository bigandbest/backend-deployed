-- Add metadata columns for dynamic linking
ALTER TABLE small_promo_cards 
ADD COLUMN link_type TEXT DEFAULT 'external',
ADD COLUMN resource_id TEXT,
ADD COLUMN sub_resource_id TEXT;

-- Comment on columns
COMMENT ON COLUMN small_promo_cards.link_type IS 'Type of link: external, product, category, subcategory';
COMMENT ON COLUMN small_promo_cards.resource_id IS 'ID of the linked resource (product_id or category_id)';
COMMENT ON COLUMN small_promo_cards.sub_resource_id IS 'ID of the secondary linked resource (subcategory_id)';
