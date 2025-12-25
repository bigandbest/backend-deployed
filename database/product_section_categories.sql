-- Product Section Categories Migration
-- This creates a junction table to link product sections with categories
-- Only products from mapped categories will be displayed in the section

-- Create the product_section_categories table
CREATE TABLE IF NOT EXISTS product_section_categories (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    section_id INTEGER NOT NULL REFERENCES product_sections(id) ON DELETE CASCADE,
    category_id INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(section_id, category_id)
);

-- Create trigger for auto-updating updated_at
DROP TRIGGER IF EXISTS update_product_section_categories_updated_at ON product_section_categories;
CREATE TRIGGER update_product_section_categories_updated_at
    BEFORE UPDATE ON product_section_categories
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_product_section_categories_section_id ON product_section_categories(section_id);
CREATE INDEX IF NOT EXISTS idx_product_section_categories_category_id ON product_section_categories(category_id);
CREATE INDEX IF NOT EXISTS idx_product_section_categories_section_category ON product_section_categories(section_id, category_id);

-- Add comments for documentation
COMMENT ON TABLE product_section_categories IS 'Junction table linking product sections to categories for filtering';
COMMENT ON COLUMN product_section_categories.section_id IS 'Reference to the homepage section';
COMMENT ON COLUMN product_section_categories.category_id IS 'Reference to the product category';

-- Display summary
SELECT 
    COUNT(*) as total_mappings,
    COUNT(DISTINCT section_id) as sections_with_categories,
    COUNT(DISTINCT category_id) as unique_categories
FROM product_section_categories;
