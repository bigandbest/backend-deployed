-- Delivery Charge Milestones Migration
-- Created: 2026-01-10
-- Description: Creates delivery_charge_milestones table for dynamic delivery pricing based on order value

-- Create delivery_charge_milestones table
CREATE TABLE IF NOT EXISTS delivery_charge_milestones (
    id SERIAL PRIMARY KEY,
    min_order_value DECIMAL(10, 2) NOT NULL CHECK (min_order_value >= 0),
    delivery_charge DECIMAL(10, 2) NOT NULL CHECK (delivery_charge >= 0),
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure unique min_order_value to prevent duplicate milestones
    UNIQUE(min_order_value)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_delivery_charge_milestones_active ON delivery_charge_milestones(is_active);
CREATE INDEX IF NOT EXISTS idx_delivery_charge_milestones_order_value ON delivery_charge_milestones(min_order_value);

-- Create trigger for updating updated_at timestamp
CREATE TRIGGER update_delivery_charge_milestones_updated_at 
    BEFORE UPDATE ON delivery_charge_milestones 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default milestones
INSERT INTO delivery_charge_milestones (min_order_value, delivery_charge, description, is_active)
VALUES 
    (0, 50, 'Standard delivery charge for orders below ₹500', TRUE),
    (500, 30, 'Reduced delivery charge for orders ₹500 and above', TRUE),
    (1000, 0, 'Free delivery for orders ₹1000 and above', TRUE)
ON CONFLICT (min_order_value) DO NOTHING;

-- Grant necessary permissions (adjust as needed for your setup)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON delivery_charge_milestones TO your_app_role;
-- GRANT USAGE, SELECT ON SEQUENCE delivery_charge_milestones_id_seq TO your_app_role;
