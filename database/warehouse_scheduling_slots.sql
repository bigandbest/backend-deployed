-- Warehouse Scheduling Slots System
-- This schema enables 2-hour scheduling slots mapped to warehouses with capacity management

-- Table: scheduling_time_slots
-- Master list of available 2-hour time slots
CREATE TABLE IF NOT EXISTS scheduling_time_slots (
    id SERIAL PRIMARY KEY,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    display_name VARCHAR(50) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Unique constraint to prevent duplicate slots
    CONSTRAINT unique_time_slot UNIQUE (start_time, end_time)
);

-- Table: warehouse_scheduling_config
-- Maps warehouses to time slots with capacity limits
CREATE TABLE IF NOT EXISTS warehouse_scheduling_config (
    id SERIAL PRIMARY KEY,
    warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
    slot_id INTEGER NOT NULL REFERENCES scheduling_time_slots(id) ON DELETE CASCADE,
    max_capacity INTEGER NOT NULL DEFAULT 20,
    scheduling_window_hours INTEGER NOT NULL DEFAULT 24,
    is_active BOOLEAN DEFAULT true,
    days_of_week JSONB DEFAULT '["monday","tuesday","wednesday","thursday","friday","saturday","sunday"]',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Ensure positive capacity and scheduling window
    CONSTRAINT positive_capacity CHECK (max_capacity > 0),
    CONSTRAINT valid_scheduling_window CHECK (scheduling_window_hours > 0 AND scheduling_window_hours <= 168),
    -- Prevent duplicate warehouse-slot mappings
    CONSTRAINT unique_warehouse_slot UNIQUE (warehouse_id, slot_id)
);

-- Table: scheduled_order_slots
-- Tracks slot usage and capacity in real-time
CREATE TABLE IF NOT EXISTS scheduled_order_slots (
    id SERIAL PRIMARY KEY,
    warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
    slot_id INTEGER NOT NULL REFERENCES scheduling_time_slots(id) ON DELETE CASCADE,
    scheduled_date DATE NOT NULL,
    current_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Ensure non-negative count
    CONSTRAINT non_negative_count CHECK (current_count >= 0),
    -- Unique constraint for warehouse-slot-date combination
    CONSTRAINT unique_slot_date UNIQUE (warehouse_id, slot_id, scheduled_date)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_scheduling_time_slots_active 
    ON scheduling_time_slots(is_active) 
    WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_warehouse_scheduling_config_warehouse 
    ON warehouse_scheduling_config(warehouse_id, is_active);

CREATE INDEX IF NOT EXISTS idx_warehouse_scheduling_config_slot 
    ON warehouse_scheduling_config(slot_id);

CREATE INDEX IF NOT EXISTS idx_scheduled_order_slots_lookup 
    ON scheduled_order_slots(warehouse_id, slot_id, scheduled_date);

CREATE INDEX IF NOT EXISTS idx_scheduled_order_slots_date 
    ON scheduled_order_slots(scheduled_date);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_scheduling_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for auto-updating updated_at
CREATE TRIGGER trigger_update_scheduling_time_slots_updated_at
    BEFORE UPDATE ON scheduling_time_slots
    FOR EACH ROW
    EXECUTE FUNCTION update_scheduling_updated_at();

CREATE TRIGGER trigger_update_warehouse_scheduling_config_updated_at
    BEFORE UPDATE ON warehouse_scheduling_config
    FOR EACH ROW
    EXECUTE FUNCTION update_scheduling_updated_at();

CREATE TRIGGER trigger_update_scheduled_order_slots_updated_at
    BEFORE UPDATE ON scheduled_order_slots
    FOR EACH ROW
    EXECUTE FUNCTION update_scheduling_updated_at();

-- Add columns to scheduled_orders table for warehouse and slot tracking
ALTER TABLE scheduled_orders 
ADD COLUMN IF NOT EXISTS warehouse_id INTEGER REFERENCES warehouses(id),
ADD COLUMN IF NOT EXISTS slot_id INTEGER REFERENCES scheduling_time_slots(id),
ADD COLUMN IF NOT EXISTS scheduled_date DATE;

-- Index for scheduled_orders warehouse and slot lookup
CREATE INDEX IF NOT EXISTS idx_scheduled_orders_warehouse_slot 
    ON scheduled_orders(warehouse_id, slot_id, scheduled_date);

-- Insert default 2-hour time slots (24-hour coverage)
INSERT INTO scheduling_time_slots (start_time, end_time, display_name) VALUES
    ('00:00', '02:00', '12 AM - 2 AM'),
    ('02:00', '04:00', '2 AM - 4 AM'),
    ('04:00', '06:00', '4 AM - 6 AM'),
    ('06:00', '08:00', '6 AM - 8 AM'),
    ('08:00', '10:00', '8 AM - 10 AM'),
    ('10:00', '12:00', '10 AM - 12 PM'),
    ('12:00', '14:00', '12 PM - 2 PM'),
    ('14:00', '16:00', '2 PM - 4 PM'),
    ('16:00', '18:00', '4 PM - 6 PM'),
    ('18:00', '20:00', '6 PM - 8 PM'),
    ('20:00', '22:00', '8 PM - 10 PM'),
    ('22:00', '23:59', '10 PM - 12 AM')
ON CONFLICT (start_time, end_time) DO NOTHING;

-- Comments for documentation
COMMENT ON TABLE scheduling_time_slots IS 'Master list of 2-hour time slots available for scheduling';
COMMENT ON TABLE warehouse_scheduling_config IS 'Maps warehouses to time slots with capacity limits and scheduling windows';
COMMENT ON TABLE scheduled_order_slots IS 'Tracks real-time slot usage and capacity per warehouse per date';
COMMENT ON COLUMN warehouse_scheduling_config.days_of_week IS 'JSON array of days when this slot is active (e.g., ["monday","tuesday"])';
COMMENT ON COLUMN warehouse_scheduling_config.max_capacity IS 'Maximum number of orders allowed for this slot';
COMMENT ON COLUMN warehouse_scheduling_config.scheduling_window_hours IS 'Hours in advance that scheduling is allowed (default: 24, can be extended to 36, 48, etc.)';
COMMENT ON COLUMN scheduled_order_slots.current_count IS 'Current number of orders scheduled for this slot on this date';
