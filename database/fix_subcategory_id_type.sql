-- Migration: Change subcategory_id from INTEGER to UUID in section_subcategory_mappings

-- Step 1: Drop existing mappings (they have invalid data anyway)
TRUNCATE TABLE section_subcategory_mappings;

-- Step 2: Alter column type to UUID
ALTER TABLE section_subcategory_mappings 
ALTER COLUMN subcategory_id TYPE UUID USING subcategory_id::text::uuid;

-- Step 3: Verify the change
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'section_subcategory_mappings' 
AND column_name = 'subcategory_id';
