-- SQL Script to add business_partner_inquiries table to Supabase
-- Run this script in Supabase SQL Editor to avoid data loss

-- Create the business_partner_inquiries table
CREATE TABLE IF NOT EXISTS business_partner_inquiries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name VARCHAR NOT NULL,
    email VARCHAR NOT NULL,
    phone VARCHAR NOT NULL,
    city VARCHAR NOT NULL,
    state VARCHAR NOT NULL,
    partnership_type VARCHAR NOT NULL,
    message TEXT,
    status VARCHAR DEFAULT 'Pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_business_partner_inquiries_status 
    ON business_partner_inquiries(status);

CREATE INDEX IF NOT EXISTS idx_business_partner_inquiries_created_at 
    ON business_partner_inquiries(created_at);

-- Add comment to the table
COMMENT ON TABLE business_partner_inquiries IS 'Stores business partner inquiry form submissions from the website';

-- Grant necessary permissions (adjust based on your Supabase setup)
-- GRANT ALL ON business_partner_inquiries TO authenticated;
-- GRANT SELECT ON business_partner_inquiries TO anon;

-- Verify the table was created
SELECT 
    table_name, 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'business_partner_inquiries'
ORDER BY ordinal_position;
