-- Add missing warehouse-related columns to products table
-- This script adds the columns needed for warehouse assignment functionality

-- Add missing warehouse-related columns to products table
DO $$
BEGIN
    -- Add warehouse_mapping_type column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'products' 
        AND column_name = 'warehouse_mapping_type'
    ) THEN
        ALTER TABLE products 
        ADD COLUMN warehouse_mapping_type VARCHAR(20) DEFAULT 'nationwide'
        CHECK (warehouse_mapping_type IN ('nationwide', 'zonal', 'custom'));
        
        RAISE NOTICE 'Added warehouse_mapping_type column to products table';
    ELSE
        RAISE NOTICE 'warehouse_mapping_type column already exists in products table';
    END IF;

    -- Add assigned_warehouse_ids column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'products' 
        AND column_name = 'assigned_warehouse_ids'
    ) THEN
        ALTER TABLE products 
        ADD COLUMN assigned_warehouse_ids INTEGER[] DEFAULT ARRAY[]::INTEGER[];
        
        RAISE NOTICE 'Added assigned_warehouse_ids column to products table';
    ELSE
        RAISE NOTICE 'assigned_warehouse_ids column already exists in products table';
    END IF;

    -- Add warehouse_notes column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'products' 
        AND column_name = 'warehouse_notes'
    ) THEN
        ALTER TABLE products 
        ADD COLUMN warehouse_notes TEXT;
        
        RAISE NOTICE 'Added warehouse_notes column to products table';
    ELSE
        RAISE NOTICE 'warehouse_notes column already exists in products table';
    END IF;

EXCEPTION 
    WHEN OTHERS THEN
        RAISE NOTICE 'Error adding columns to products table: %', SQLERRM;
END $$;

-- Create index for warehouse assignment queries
CREATE INDEX IF NOT EXISTS idx_products_warehouse_mapping_type 
ON products(warehouse_mapping_type);

CREATE INDEX IF NOT EXISTS idx_products_assigned_warehouse_ids 
ON products USING GIN(assigned_warehouse_ids);

-- Verify the columns were added
SELECT 
    column_name,
    data_type,
    column_default,
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'products' 
AND column_name IN ('warehouse_mapping_type', 'assigned_warehouse_ids', 'warehouse_notes')
ORDER BY column_name;