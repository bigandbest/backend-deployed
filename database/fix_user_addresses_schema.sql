-- Fix User Addresses Table Schema
-- This script adds any missing columns to the user_addresses table safely

DO $$
BEGIN
    -- Add is_active if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_addresses' AND column_name = 'is_active') THEN
        ALTER TABLE user_addresses ADD COLUMN is_active BOOLEAN DEFAULT TRUE;
    END IF;

    -- Add address_line1 if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_addresses' AND column_name = 'address_line1') THEN
        ALTER TABLE user_addresses ADD COLUMN address_line1 TEXT;
    END IF;

    -- Add address_line2 if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_addresses' AND column_name = 'address_line2') THEN
        ALTER TABLE user_addresses ADD COLUMN address_line2 TEXT;
    END IF;

    -- Add full_name if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_addresses' AND column_name = 'full_name') THEN
        ALTER TABLE user_addresses ADD COLUMN full_name VARCHAR(255);
    END IF;

    -- Add landmark if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_addresses' AND column_name = 'landmark') THEN
        ALTER TABLE user_addresses ADD COLUMN landmark TEXT;
    END IF;

    -- Add mobile if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_addresses' AND column_name = 'mobile') THEN
        ALTER TABLE user_addresses ADD COLUMN mobile VARCHAR(20);
    END IF;
    
    -- Add pincode if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_addresses' AND column_name = 'pincode') THEN
        ALTER TABLE user_addresses ADD COLUMN pincode VARCHAR(6);
    END IF;

    -- Add city if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_addresses' AND column_name = 'city') THEN
        ALTER TABLE user_addresses ADD COLUMN city VARCHAR(100);
    END IF;

    -- Add state if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_addresses' AND column_name = 'state') THEN
        ALTER TABLE user_addresses ADD COLUMN state VARCHAR(100);
    END IF;
    
    -- Add label if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_addresses' AND column_name = 'label') THEN
        ALTER TABLE user_addresses ADD COLUMN label VARCHAR(100);
    END IF;

    -- Add is_default if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_addresses' AND column_name = 'is_default') THEN
        ALTER TABLE user_addresses ADD COLUMN is_default BOOLEAN DEFAULT FALSE;
    END IF;

END $$;

-- Force schema cache reload (notify PostgREST)
NOTIFY pgrst, 'reload config';
