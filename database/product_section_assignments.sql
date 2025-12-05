-- Product Section Assignments Migration
-- This creates a junction table to link products with homepage sections

-- Create the product_section_products table
CREATE TABLE IF NOT EXISTS product_section_products (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    section_id INTEGER NOT NULL REFERENCES product_sections(id) ON DELETE CASCADE,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(product_id, section_id)
);

-- Create trigger for auto-updating updated_at
DROP TRIGGER IF EXISTS update_product_section_products_updated_at ON product_section_products;
CREATE TRIGGER update_product_section_products_updated_at
    BEFORE UPDATE ON product_section_products
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_product_section_products_product_id ON product_section_products(product_id);
CREATE INDEX IF NOT EXISTS idx_product_section_products_section_id ON product_section_products(section_id);
CREATE INDEX IF NOT EXISTS idx_product_section_products_section_order ON product_section_products(section_id, display_order);

-- Add comments for documentation
COMMENT ON TABLE product_section_products IS 'Junction table linking products to homepage sections';
COMMENT ON COLUMN product_section_products.product_id IS 'Reference to the product';
COMMENT ON COLUMN product_section_products.section_id IS 'Reference to the homepage section';
COMMENT ON COLUMN product_section_products.display_order IS 'Order of product within the section (lower numbers appear first)';

-- Display summary
SELECT 
    COUNT(*) as total_assignments,
    COUNT(DISTINCT product_id) as unique_products,
    COUNT(DISTINCT section_id) as sections_with_products
FROM product_section_products;
