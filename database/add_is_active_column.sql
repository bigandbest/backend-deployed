-- Add is_active column to user_addresses if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'user_addresses'
        AND column_name = 'is_active'
    ) THEN
        ALTER TABLE user_addresses ADD COLUMN is_active BOOLEAN DEFAULT TRUE;
    END IF;
END $$;

-- Verify the column exists
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'user_addresses' AND column_name = 'is_active';
