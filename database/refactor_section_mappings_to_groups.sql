-- Migration: Refactor store_section_mappings to use groups instead of categories
-- This changes the mapping system from category-based to group-based

-- Step 1: Delete any existing section-category mappings (they will be recreated as section-group mappings)
DELETE FROM store_section_mappings WHERE mapping_type = 'section_category';

-- Step 2: Drop the category_id column and related constraints
ALTER TABLE store_section_mappings 
DROP COLUMN IF EXISTS category_id CASCADE;

-- Step 3: Add group_id column (UUID type to match groups table)
ALTER TABLE store_section_mappings 
ADD COLUMN IF NOT EXISTS group_id UUID;

-- Step 4: Add foreign key constraint to groups table
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'store_section_mappings_group_id_fkey'
    ) THEN
        ALTER TABLE store_section_mappings
        ADD CONSTRAINT store_section_mappings_group_id_fkey 
        FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Step 5: Drop the old constraint that includes section_category
ALTER TABLE store_section_mappings 
DROP CONSTRAINT IF EXISTS check_mapping_type_consistency;

-- Step 6: Add updated constraint that supports section_group mapping type
ALTER TABLE store_section_mappings
ADD CONSTRAINT check_mapping_type_consistency CHECK (
    (mapping_type = 'store_section' AND store_id IS NOT NULL AND product_id IS NULL AND group_id IS NULL) OR
    (mapping_type = 'section_product' AND product_id IS NOT NULL AND group_id IS NULL) OR
    (mapping_type = 'section_group' AND group_id IS NOT NULL AND product_id IS NULL)
);

-- Step 7: Update the mapping_type check constraint to include section_group
ALTER TABLE store_section_mappings 
DROP CONSTRAINT IF EXISTS store_section_mappings_mapping_type_check;

ALTER TABLE store_section_mappings
ADD CONSTRAINT store_section_mappings_mapping_type_check 
CHECK (mapping_type IN ('store_section', 'section_product', 'section_group'));

-- Step 8: Create index for better performance on group_id lookups
CREATE INDEX IF NOT EXISTS idx_store_section_mappings_group_id 
ON store_section_mappings(group_id);

-- Step 9: Create unique constraint for section-group mappings
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_section_group_mapping 
ON store_section_mappings(section_id, group_id, mapping_type) 
WHERE mapping_type = 'section_group';

-- Step 10: Drop the old section_category unique index if it exists
DROP INDEX IF EXISTS idx_unique_section_category_mapping;

-- Step 11: Add comment for documentation
COMMENT ON COLUMN store_section_mappings.group_id IS 'Reference to the product group (for section_group mapping type)';

-- Display success message
SELECT 'Successfully refactored store_section_mappings to use groups instead of categories!' as message;
