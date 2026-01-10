-- Charge Settings Migration
-- Created: 2026-01-10
-- Description: Creates charge_settings table for global charge configuration (handling, surge, platform)

-- Create charge_settings table (singleton pattern - only one row)
CREATE TABLE IF NOT EXISTS charge_settings (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1), -- Ensure only one row
    handling_charge DECIMAL(10, 2) NOT NULL DEFAULT 0 CHECK (handling_charge >= 0),
    surge_charge DECIMAL(10, 2) NOT NULL DEFAULT 0 CHECK (surge_charge >= 0),
    platform_charge DECIMAL(10, 2) NOT NULL DEFAULT 0 CHECK (platform_charge >= 0),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create trigger for updating updated_at timestamp
CREATE TRIGGER update_charge_settings_updated_at 
    BEFORE UPDATE ON charge_settings 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default settings (all charges set to 0)
INSERT INTO charge_settings (id, handling_charge, surge_charge, platform_charge)
VALUES (1, 0, 0, 0)
ON CONFLICT (id) DO NOTHING;

-- Grant necessary permissions (adjust as needed for your setup)
-- GRANT SELECT, UPDATE ON charge_settings TO your_app_role;
