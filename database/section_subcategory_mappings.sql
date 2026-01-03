-- Section Subcategory Mappings Migration
-- This creates a table for mapping subcategories to homepage sections
-- Allows admins to control which subcategories appear in PriceZone and other sections

-- Create section_subcategory_mappings table
CREATE TABLE IF NOT EXISTS section_subcategory_mappings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    section_id INTEGER NOT NULL REFERENCES product_sections(id) ON DELETE CASCADE,
    subcategory_id INTEGER NOT NULL,
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Ensure unique mapping per section-subcategory pair
    UNIQUE(section_id, subcategory_id)
);

-- Create trigger for auto-updating updated_at
DROP TRIGGER IF EXISTS update_section_subcategory_mappings_updated_at ON section_subcategory_mappings;
CREATE TRIGGER update_section_subcategory_mappings_updated_at
    BEFORE UPDATE ON section_subcategory_mappings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_section_subcategory_mappings_section_id ON section_subcategory_mappings(section_id);
CREATE INDEX IF NOT EXISTS idx_section_subcategory_mappings_subcategory_id ON section_subcategory_mappings(subcategory_id);
CREATE INDEX IF NOT EXISTS idx_section_subcategory_mappings_section_subcategory ON section_subcategory_mappings(section_id, subcategory_id);
CREATE INDEX IF NOT EXISTS idx_section_subcategory_mappings_active ON section_subcategory_mappings(is_active);
CREATE INDEX IF NOT EXISTS idx_section_subcategory_mappings_display_order ON section_subcategory_mappings(section_id, display_order);

-- Add comments for documentation
COMMENT ON TABLE section_subcategory_mappings IS 'Junction table linking product sections to subcategories for filtering and display control';
COMMENT ON COLUMN section_subcategory_mappings.section_id IS 'Reference to the homepage section (e.g., PriceZone, ShopByCategory)';
COMMENT ON COLUMN section_subcategory_mappings.subcategory_id IS 'Reference to the product subcategory';
COMMENT ON COLUMN section_subcategory_mappings.display_order IS 'Order in which subcategories should be displayed in the section';
COMMENT ON COLUMN section_subcategory_mappings.is_active IS 'Whether this mapping is currently active (allows temporary hiding)';

-- Display summary
SELECT 
    COUNT(*) as total_mappings,
    COUNT(DISTINCT section_id) as sections_with_subcategories,
    COUNT(DISTINCT subcategory_id) as unique_subcategories
FROM section_subcategory_mappings;

SELECT 'Section subcategory mappings table created successfully!' as message;
