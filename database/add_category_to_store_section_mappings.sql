-- Migration: Add category_id support to store_section_mappings
-- This fixes the PostgREST error by adding the missing category_id column and foreign key

-- Add category_id column if it doesn't exist (UUID type to match categories table)
ALTER TABLE store_section_mappings 
ADD COLUMN IF NOT EXISTS category_id UUID;

-- Add foreign key constraint to categories table
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'store_section_mappings_category_id_fkey'
    ) THEN
        ALTER TABLE store_section_mappings
        ADD CONSTRAINT store_section_mappings_category_id_fkey 
        FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Drop the old constraint that doesn't support category mappings
ALTER TABLE store_section_mappings 
DROP CONSTRAINT IF EXISTS check_mapping_type_consistency;

-- Add updated constraint that supports section_category mapping type
ALTER TABLE store_section_mappings
ADD CONSTRAINT check_mapping_type_consistency CHECK (
    (mapping_type = 'store_section' AND store_id IS NOT NULL AND product_id IS NULL AND category_id IS NULL) OR
    (mapping_type = 'section_product' AND product_id IS NOT NULL AND category_id IS NULL) OR
    (mapping_type = 'section_category' AND category_id IS NOT NULL AND product_id IS NULL)
);

-- Update the mapping_type check constraint to include section_category
ALTER TABLE store_section_mappings 
DROP CONSTRAINT IF EXISTS store_section_mappings_mapping_type_check;

ALTER TABLE store_section_mappings
ADD CONSTRAINT store_section_mappings_mapping_type_check 
CHECK (mapping_type IN ('store_section', 'section_product', 'section_category'));

-- Create index for better performance on category_id lookups
CREATE INDEX IF NOT EXISTS idx_store_section_mappings_category_id 
ON store_section_mappings(category_id);

-- Create unique constraint for section-category mappings
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_section_category_mapping 
ON store_section_mappings(section_id, category_id, mapping_type) 
WHERE mapping_type = 'section_category';

-- Add comment for documentation
COMMENT ON COLUMN store_section_mappings.category_id IS 'Reference to the product category (for section_category mapping type)';

-- Display success message
SELECT 'Successfully added category_id support to store_section_mappings!' as message;
