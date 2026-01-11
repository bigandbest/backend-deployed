-- Smart Order Scheduling System Database Schema
-- This migration creates tables for scheduled orders with automatic execution

-- Table: scheduled_orders
-- Stores orders scheduled for future execution
CREATE TABLE IF NOT EXISTS scheduled_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    
    -- Order Details
    cart_items JSONB NOT NULL, -- [{product_id, variant_id, quantity, price, name}]
    address_id UUID,
    
    -- Scheduling
    scheduled_at TIMESTAMPTZ NOT NULL,
    timezone VARCHAR(50) NOT NULL DEFAULT 'UTC',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Status: SCHEDULED, PROCESSING, PLACED, FAILED, CANCELLED, EXPIRED
    status VARCHAR(20) NOT NULL DEFAULT 'SCHEDULED',
    
    -- Payment
    payment_method VARCHAR(20) NOT NULL, -- RAZORPAY, COD, WALLET
    payment_intent_id VARCHAR(255),
    payment_status VARCHAR(20) DEFAULT 'PENDING',
    total_amount DECIMAL(10,2) NOT NULL,
    
    -- Execution Control
    execution_attempts INT DEFAULT 0,
    last_execution_attempt TIMESTAMPTZ,
    idempotency_key VARCHAR(255) UNIQUE NOT NULL,
    lock_token VARCHAR(255),
    lock_expires_at TIMESTAMPTZ,
    
    -- Result
    placed_order_id UUID,
    failure_reason TEXT,
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    
    -- Constraints
    CONSTRAINT future_schedule CHECK (scheduled_at > created_at),
    CONSTRAINT valid_status CHECK (status IN ('SCHEDULED', 'PROCESSING', 'PLACED', 'FAILED', 'CANCELLED', 'EXPIRED'))
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_scheduled_orders_execution 
    ON scheduled_orders(scheduled_at, status) 
    WHERE status = 'SCHEDULED';

CREATE INDEX IF NOT EXISTS idx_scheduled_orders_user 
    ON scheduled_orders(user_id, status);

CREATE INDEX IF NOT EXISTS idx_scheduled_orders_lock 
    ON scheduled_orders(lock_token, lock_expires_at);

CREATE INDEX IF NOT EXISTS idx_scheduled_orders_idempotency 
    ON scheduled_orders(idempotency_key);

-- Table: order_execution_logs
-- Tracks all execution attempts for scheduled orders
CREATE TABLE IF NOT EXISTS order_execution_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scheduled_order_id UUID NOT NULL REFERENCES scheduled_orders(id) ON DELETE CASCADE,
    
    attempt_number INT NOT NULL,
    executed_at TIMESTAMPTZ DEFAULT NOW(),
    
    status VARCHAR(20) NOT NULL, -- SUCCESS, FAILED, RETRY
    
    -- Validation Results
    inventory_check_passed BOOLEAN DEFAULT false,
    payment_check_passed BOOLEAN DEFAULT false,
    
    error_message TEXT,
    error_code VARCHAR(50),
    
    -- Execution Details
    execution_duration_ms INT,
    worker_id VARCHAR(100),
    
    metadata JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_execution_logs_scheduled_order 
    ON order_execution_logs(scheduled_order_id, executed_at DESC);

CREATE INDEX IF NOT EXISTS idx_execution_logs_status 
    ON order_execution_logs(status, executed_at DESC);

-- Table: payment_retry_logs
-- Tracks payment retry attempts
CREATE TABLE IF NOT EXISTS payment_retry_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scheduled_order_id UUID NOT NULL REFERENCES scheduled_orders(id) ON DELETE CASCADE,
    execution_log_id UUID REFERENCES order_execution_logs(id),
    
    retry_number INT NOT NULL,
    attempted_at TIMESTAMPTZ DEFAULT NOW(),
    
    payment_method VARCHAR(20),
    amount DECIMAL(10,2),
    
    status VARCHAR(20), -- SUCCESS, FAILED, PENDING
    error_code VARCHAR(50),
    error_message TEXT,
    
    next_retry_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_payment_retry_logs_scheduled_order 
    ON payment_retry_logs(scheduled_order_id, attempted_at DESC);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_scheduled_orders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE TRIGGER trigger_update_scheduled_orders_updated_at
    BEFORE UPDATE ON scheduled_orders
    FOR EACH ROW
    EXECUTE FUNCTION update_scheduled_orders_updated_at();

-- Comments for documentation
COMMENT ON TABLE scheduled_orders IS 'Stores orders scheduled for future automatic execution';
COMMENT ON COLUMN scheduled_orders.idempotency_key IS 'Unique key to prevent duplicate order execution';
COMMENT ON COLUMN scheduled_orders.lock_token IS 'Distributed lock token for concurrent execution prevention';
COMMENT ON COLUMN scheduled_orders.metadata IS 'Additional data like price lock settings, notes, etc.';
