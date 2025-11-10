-- Add missing foreign key constraints and columns for warehouse management
-- This script adds the foreign key constraint between product_warehouse_stock and products tables
-- and adds missing warehouse-related columns to products table

-- First add missing columns to products table
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
        CHECK (warehouse_mapping_type IN ('nationwide', 'zonal', 'custom', 'central'));
        
        RAISE NOTICE 'Added warehouse_mapping_type column to products table';
    ELSE
        RAISE NOTICE 'warehouse_mapping_type column already exists in products table';
    END IF;

    -- Add assigned_warehouse_ids column if it doesn't exist (legacy field)
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

    -- Add primary_warehouses column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'products' 
        AND column_name = 'primary_warehouses'
    ) THEN
        ALTER TABLE products 
        ADD COLUMN primary_warehouses INTEGER[] DEFAULT ARRAY[]::INTEGER[];
        
        RAISE NOTICE 'Added primary_warehouses column to products table';
    ELSE
        RAISE NOTICE 'primary_warehouses column already exists in products table';
    END IF;

    -- Add fallback_warehouses column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'products' 
        AND column_name = 'fallback_warehouses'
    ) THEN
        ALTER TABLE products 
        ADD COLUMN fallback_warehouses INTEGER[] DEFAULT ARRAY[]::INTEGER[];
        
        RAISE NOTICE 'Added fallback_warehouses column to products table';
    ELSE
        RAISE NOTICE 'fallback_warehouses column already exists in products table';
    END IF;

    -- Add enable_fallback column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'products' 
        AND column_name = 'enable_fallback'
    ) THEN
        ALTER TABLE products 
        ADD COLUMN enable_fallback BOOLEAN DEFAULT TRUE;
        
        RAISE NOTICE 'Added enable_fallback column to products table';
    ELSE
        RAISE NOTICE 'enable_fallback column already exists in products table';
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

    -- Add updated_at column if it doesn't exist (needed for triggers)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'products' 
        AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE products 
        ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
        
        RAISE NOTICE 'Added updated_at column to products table';
    ELSE
        RAISE NOTICE 'updated_at column already exists in products table';
    END IF;

EXCEPTION 
    WHEN OTHERS THEN
        RAISE NOTICE 'Error adding columns to products table: %', SQLERRM;
END $$;

-- Now add foreign key constraint for product_warehouse_stock
DO $$
BEGIN
    -- Add foreign key constraint for product_warehouse_stock.product_id -> products.id
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_product_warehouse_stock_product_id' 
        AND table_name = 'product_warehouse_stock'
    ) THEN
        ALTER TABLE product_warehouse_stock 
        ADD CONSTRAINT fk_product_warehouse_stock_product_id 
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
        
        RAISE NOTICE 'Added foreign key constraint: fk_product_warehouse_stock_product_id';
    ELSE
        RAISE NOTICE 'Foreign key constraint fk_product_warehouse_stock_product_id already exists';
    END IF;
    
EXCEPTION 
    WHEN OTHERS THEN
        RAISE NOTICE 'Error adding foreign key constraint: %', SQLERRM;
END $$;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_products_warehouse_mapping_type 
ON products(warehouse_mapping_type);

CREATE INDEX IF NOT EXISTS idx_products_assigned_warehouse_ids 
ON products USING GIN(assigned_warehouse_ids);

CREATE INDEX IF NOT EXISTS idx_products_primary_warehouses 
ON products USING GIN(primary_warehouses);

CREATE INDEX IF NOT EXISTS idx_products_fallback_warehouses 
ON products USING GIN(fallback_warehouses);

CREATE INDEX IF NOT EXISTS idx_products_enable_fallback 
ON products(enable_fallback);

-- Create or update the trigger function for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for products updated_at (if it doesn't exist)
DROP TRIGGER IF EXISTS update_products_updated_at ON products;
CREATE TRIGGER update_products_updated_at 
    BEFORE UPDATE ON products 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Verify the constraint was added
SELECT 
    tc.constraint_name,
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name 
FROM information_schema.table_constraints AS tc 
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
    AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY' 
    AND tc.table_name = 'product_warehouse_stock'
    AND kcu.column_name = 'product_id';