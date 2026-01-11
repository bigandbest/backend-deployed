
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


CREATE TABLE IF NOT EXISTS coupons (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) UNIQUE NOT NULL,
    
    -- Discount Configuration
    discount_type VARCHAR(20) NOT NULL CHECK (discount_type IN ('FLAT', 'PERCENTAGE')),
    discount_value DECIMAL(10,2) NOT NULL CHECK (discount_value > 0),
    max_discount DECIMAL(10,2),
    min_order_value DECIMAL(10,2) DEFAULT 0,
    
    -- Restrictions
    allowed_brands JSONB DEFAULT '[]',
    new_user_only BOOLEAN DEFAULT false,
    usage_limit_total INTEGER,
    usage_limit_per_user INTEGER DEFAULT 1,
    
    -- Validity
    valid_from TIMESTAMPTZ NOT NULL,
    valid_to TIMESTAMPTZ NOT NULL,
    timezone VARCHAR(50) DEFAULT 'UTC',
    
    -- Status
    status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DISABLED', 'EXPIRED')),
    
    -- Metadata
    description TEXT,
    terms_conditions TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT valid_date_range CHECK (valid_from < valid_to),
    CONSTRAINT valid_max_discount CHECK (
        discount_type = 'FLAT' OR max_discount IS NULL OR max_discount > 0
    )
);

-- Indexes for coupons table
CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(LOWER(code));
CREATE INDEX IF NOT EXISTS idx_coupons_status ON coupons(status);
CREATE INDEX IF NOT EXISTS idx_coupons_validity ON coupons(valid_from, valid_to);
CREATE INDEX IF NOT EXISTS idx_coupons_brands ON coupons USING GIN(allowed_brands);
CREATE INDEX IF NOT EXISTS idx_coupons_created_at ON coupons(created_at DESC);

-- =====================================================
-- 2. COUPON USAGE TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS coupon_usage (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    coupon_id UUID NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    order_id UUID UNIQUE NOT NULL,
    
    -- Usage Details
    discount_applied DECIMAL(10,2) NOT NULL CHECK (discount_applied >= 0),
    order_value DECIMAL(10,2) NOT NULL CHECK (order_value >= 0),
    final_amount DECIMAL(10,2) NOT NULL CHECK (final_amount >= 0),
    
    -- Idempotency
    idempotency_key VARCHAR(100) UNIQUE NOT NULL,
    
    -- Status
    status VARCHAR(20) DEFAULT 'APPLIED' CHECK (status IN ('RESERVED', 'APPLIED', 'REFUNDED', 'CANCELLED')),
    
    -- Timestamps
    reserved_at TIMESTAMPTZ,
    applied_at TIMESTAMPTZ DEFAULT NOW(),
    refunded_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for coupon_usage table
CREATE INDEX IF NOT EXISTS idx_usage_coupon ON coupon_usage(coupon_id);
CREATE INDEX IF NOT EXISTS idx_usage_user ON coupon_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_order ON coupon_usage(order_id);
CREATE INDEX IF NOT EXISTS idx_usage_status ON coupon_usage(status);
CREATE INDEX IF NOT EXISTS idx_usage_idempotency ON coupon_usage(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_usage_created_at ON coupon_usage(created_at DESC);

-- =====================================================
-- 3. COUPON RESERVATIONS TABLE (Concurrency Control)
-- =====================================================
CREATE TABLE IF NOT EXISTS coupon_reservations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    coupon_id UUID NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    session_id VARCHAR(100) NOT NULL,
    
    -- Reservation Details
    reserved_amount DECIMAL(10,2) NOT NULL CHECK (reserved_amount >= 0),
    order_value DECIMAL(10,2) NOT NULL CHECK (order_value >= 0),
    
    -- Lock Management
    lock_token VARCHAR(100) UNIQUE NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT unique_user_coupon UNIQUE(coupon_id, user_id, session_id)
);

-- Indexes for coupon_reservations table
CREATE INDEX IF NOT EXISTS idx_reservations_coupon ON coupon_reservations(coupon_id);
CREATE INDEX IF NOT EXISTS idx_reservations_user ON coupon_reservations(user_id);
CREATE INDEX IF NOT EXISTS idx_reservations_expiry ON coupon_reservations(expires_at);
CREATE INDEX IF NOT EXISTS idx_reservations_lock ON coupon_reservations(lock_token);

-- =====================================================
-- 4. COUPON AUDIT LOGS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS coupon_audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    coupon_id UUID REFERENCES coupons(id) ON DELETE SET NULL,
    user_id UUID,
    action VARCHAR(50) NOT NULL,
    
    -- Change Tracking
    old_values JSONB,
    new_values JSONB,
    
    -- Context
    ip_address INET,
    user_agent TEXT,
    metadata JSONB,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for coupon_audit_logs table
CREATE INDEX IF NOT EXISTS idx_audit_coupon ON coupon_audit_logs(coupon_id);
CREATE INDEX IF NOT EXISTS idx_audit_user ON coupon_audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON coupon_audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_created ON coupon_audit_logs(created_at DESC);

-- =====================================================
-- 5. TRIGGERS
-- =====================================================

-- Auto-update updated_at column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to coupons table
DROP TRIGGER IF EXISTS update_coupons_updated_at ON coupons;
CREATE TRIGGER update_coupons_updated_at 
    BEFORE UPDATE ON coupons
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Apply trigger to coupon_usage table
DROP TRIGGER IF EXISTS update_usage_updated_at ON coupon_usage;
CREATE TRIGGER update_usage_updated_at 
    BEFORE UPDATE ON coupon_usage
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 6. UTILITY FUNCTIONS
-- =====================================================

-- Auto-expire coupons
CREATE OR REPLACE FUNCTION auto_expire_coupons()
RETURNS INTEGER AS $$
DECLARE
    expired_count INTEGER;
BEGIN
    UPDATE coupons
    SET status = 'EXPIRED'
    WHERE status = 'ACTIVE'
    AND valid_to < NOW();
    
    GET DIAGNOSTICS expired_count = ROW_COUNT;
    RETURN expired_count;
END;
$$ LANGUAGE plpgsql;

-- Clean expired reservations
CREATE OR REPLACE FUNCTION clean_expired_reservations()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM coupon_reservations
    WHERE expires_at < NOW();
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Get coupon usage statistics
CREATE OR REPLACE FUNCTION get_coupon_stats(coupon_uuid UUID)
RETURNS TABLE(
    total_usage BIGINT,
    total_discount DECIMAL,
    unique_users BIGINT,
    avg_discount DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*)::BIGINT as total_usage,
        COALESCE(SUM(discount_applied), 0) as total_discount,
        COUNT(DISTINCT user_id)::BIGINT as unique_users,
        COALESCE(AVG(discount_applied), 0) as avg_discount
    FROM coupon_usage
    WHERE coupon_id = coupon_uuid
    AND status = 'APPLIED';
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 7. SAMPLE DATA (Optional - for testing)
-- =====================================================

-- Insert a sample coupon (commented out by default)

INSERT INTO coupons (
    code,
    discount_type,
    discount_value,
    max_discount,
    min_order_value,
    valid_from,
    valid_to,
    description,
    usage_limit_total,
    usage_limit_per_user
) VALUES (
    'WELCOME50',
    'PERCENTAGE',
    10.00,
    50.00,
    100.00,
    NOW(),
    NOW() + INTERVAL '30 days',
    'Welcome offer - 10% off up to ₹50',
    1000,
    1
);


