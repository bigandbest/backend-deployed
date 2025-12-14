-- Enquiry & Negotiated Bidding System - Complete Database Schema
-- This schema supports hybrid B2C + B2B enquiry and bidding functionality

-- ============================================================================
-- 1. PRODUCT ENQUIRIES TABLE
-- ============================================================================
-- Stores user enquiries for products (out of stock or custom pricing)
CREATE TABLE IF NOT EXISTS product_enquiries (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    product_id UUID NOT NULL,
    variant_id UUID,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    message TEXT,
    expected_price DECIMAL(10,2),
    
    -- Status lifecycle: OPEN -> NEGOTIATING -> LOCKED -> COMPLETED/EXPIRED/CLOSED
    status VARCHAR(50) DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'NEGOTIATING', 'LOCKED', 'COMPLETED', 'EXPIRED', 'CLOSED')),
    
    -- Admin notes (visible only to admin)
    admin_notes TEXT,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL '7 days'),
    
    -- Metadata
    closed_reason VARCHAR(255),
    closed_by VARCHAR(50) -- 'ADMIN' or 'USER' or 'AUTO_EXPIRED'
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_product_enquiries_user ON product_enquiries(user_id);
CREATE INDEX IF NOT EXISTS idx_product_enquiries_product ON product_enquiries(product_id);
CREATE INDEX IF NOT EXISTS idx_product_enquiries_status ON product_enquiries(status);
CREATE INDEX IF NOT EXISTS idx_product_enquiries_created ON product_enquiries(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_product_enquiries_expires ON product_enquiries(expires_at);

-- ============================================================================
-- 2. ENQUIRY MESSAGES TABLE
-- ============================================================================
-- Chat messages between user and admin for negotiation
CREATE TABLE IF NOT EXISTS enquiry_messages (
    id SERIAL PRIMARY KEY,
    enquiry_id INTEGER NOT NULL REFERENCES product_enquiries(id) ON DELETE CASCADE,
    
    -- Sender information
    sender_type VARCHAR(10) NOT NULL CHECK (sender_type IN ('USER', 'ADMIN')),
    sender_id UUID NOT NULL, -- user_id or admin_id
    sender_name VARCHAR(255),
    
    -- Message content
    message TEXT NOT NULL,
    
    -- Message metadata
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Optional: attachment support for future
    attachment_url TEXT,
    attachment_type VARCHAR(50)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_enquiry_messages_enquiry ON enquiry_messages(enquiry_id);
CREATE INDEX IF NOT EXISTS idx_enquiry_messages_created ON enquiry_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_enquiry_messages_unread ON enquiry_messages(is_read) WHERE is_read = FALSE;

-- ============================================================================
-- 3. ENQUIRY BIDS TABLE
-- ============================================================================
-- Admin's price offers to users
CREATE TABLE IF NOT EXISTS enquiry_bids (
    id SERIAL PRIMARY KEY,
    enquiry_id INTEGER NOT NULL REFERENCES product_enquiries(id) ON DELETE CASCADE,
    
    -- Bid type
    bid_type VARCHAR(50) DEFAULT 'SINGLE_PRODUCT' CHECK (bid_type IN ('SINGLE_PRODUCT', 'MULTI_PRODUCT')),
    
    -- Pricing (for single product bids, multi-product uses bid_products table)
    base_price DECIMAL(10,2), -- Price excluding GST
    quantity INTEGER,
    
    -- Validity
    validity_hours INTEGER DEFAULT 24,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    
    -- Status: ACTIVE -> ACCEPTED/REJECTED -> LOCKED -> EXPIRED
    status VARCHAR(50) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ACCEPTED', 'REJECTED', 'LOCKED', 'EXPIRED')),
    
    -- Admin who created the bid
    created_by UUID,
    
    -- Terms and conditions
    terms TEXT,
    notes TEXT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_enquiry_bids_enquiry ON enquiry_bids(enquiry_id);
CREATE INDEX IF NOT EXISTS idx_enquiry_bids_status ON enquiry_bids(status);
CREATE INDEX IF NOT EXISTS idx_enquiry_bids_expires ON enquiry_bids(expires_at);

-- ============================================================================
-- 4. BID PRODUCTS TABLE
-- ============================================================================
-- Products included in a bid (supports multi-product offers)
CREATE TABLE IF NOT EXISTS bid_products (
    id SERIAL PRIMARY KEY,
    bid_id INTEGER NOT NULL REFERENCES enquiry_bids(id) ON DELETE CASCADE,
    
    -- Product information
    product_id UUID NOT NULL,
    variant_id UUID,
    product_name VARCHAR(255), -- Snapshot at bid time
    variant_details TEXT,
    
    -- Pricing
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price DECIMAL(10,2) NOT NULL, -- Price per unit excluding GST
    total_price DECIMAL(10,2) NOT NULL, -- quantity * unit_price
    
    -- GST information (snapshot at bid time)
    gst_percentage DECIMAL(5,2) DEFAULT 0,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_bid_products_bid ON bid_products(bid_id);
CREATE INDEX IF NOT EXISTS idx_bid_products_product ON bid_products(product_id);

-- ============================================================================
-- 5. LOCKED BIDS TABLE
-- ============================================================================
-- Finalized bids ready for checkout with stock reservation
CREATE TABLE IF NOT EXISTS locked_bids (
    id SERIAL PRIMARY KEY,
    bid_id INTEGER NOT NULL REFERENCES enquiry_bids(id) ON DELETE CASCADE,
    enquiry_id INTEGER NOT NULL REFERENCES product_enquiries(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Pricing breakdown
    subtotal DECIMAL(10,2) NOT NULL, -- Total before GST
    gst_amount DECIMAL(10,2) NOT NULL,
    final_amount DECIMAL(10,2) NOT NULL, -- subtotal + gst_amount
    
    -- Stock reservation
    stock_reserved BOOLEAN DEFAULT FALSE,
    stock_reserved_at TIMESTAMP,
    
    -- Payment deadline (default: 30 minutes from lock time)
    payment_deadline TIMESTAMP NOT NULL,
    
    -- Status: PENDING_PAYMENT -> PAID/EXPIRED/CANCELLED
    status VARCHAR(50) DEFAULT 'PENDING_PAYMENT' CHECK (status IN ('PENDING_PAYMENT', 'PAID', 'EXPIRED', 'CANCELLED')),
    
    -- Order reference (set after successful payment)
    order_id INTEGER,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    paid_at TIMESTAMP,
    
    -- Cancellation info
    cancelled_reason TEXT,
    cancelled_by VARCHAR(50)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_locked_bids_user ON locked_bids(user_id);
CREATE INDEX IF NOT EXISTS idx_locked_bids_bid ON locked_bids(bid_id);
CREATE INDEX IF NOT EXISTS idx_locked_bids_enquiry ON locked_bids(enquiry_id);
CREATE INDEX IF NOT EXISTS idx_locked_bids_status ON locked_bids(status);
CREATE INDEX IF NOT EXISTS idx_locked_bids_deadline ON locked_bids(payment_deadline);
CREATE INDEX IF NOT EXISTS idx_locked_bids_order ON locked_bids(order_id) WHERE order_id IS NOT NULL;

-- ============================================================================
-- 6. CART ITEMS EXTENSION
-- ============================================================================
-- Extend existing cart_items table to support bid products
ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS is_bid_product BOOLEAN DEFAULT FALSE;
ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS locked_bid_id INTEGER REFERENCES locked_bids(id) ON DELETE CASCADE;
ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS bid_unit_price DECIMAL(10,2);

-- Index for bid products in cart
CREATE INDEX IF NOT EXISTS idx_cart_items_bid ON cart_items(locked_bid_id) WHERE locked_bid_id IS NOT NULL;

-- ============================================================================
-- 7. DATABASE FUNCTIONS
-- ============================================================================

-- Function to auto-expire old enquiries
CREATE OR REPLACE FUNCTION expire_old_enquiries()
RETURNS INTEGER AS $$
DECLARE
    expired_count INTEGER;
BEGIN
    UPDATE product_enquiries
    SET 
        status = 'EXPIRED',
        closed_reason = 'Auto-expired due to inactivity',
        closed_by = 'AUTO_EXPIRED',
        updated_at = CURRENT_TIMESTAMP
    WHERE 
        status IN ('OPEN', 'NEGOTIATING')
        AND expires_at < CURRENT_TIMESTAMP;
    
    GET DIAGNOSTICS expired_count = ROW_COUNT;
    RETURN expired_count;
END;
$$ LANGUAGE plpgsql;

-- Function to auto-expire old bids
CREATE OR REPLACE FUNCTION expire_old_bids()
RETURNS INTEGER AS $$
DECLARE
    expired_count INTEGER;
BEGIN
    UPDATE enquiry_bids
    SET 
        status = 'EXPIRED',
        expires_at = CURRENT_TIMESTAMP
    WHERE 
        status IN ('ACTIVE', 'ACCEPTED')
        AND expires_at < CURRENT_TIMESTAMP;
    
    GET DIAGNOSTICS expired_count = ROW_COUNT;
    RETURN expired_count;
END;
$$ LANGUAGE plpgsql;

-- Function to release stock from expired locked bids
CREATE OR REPLACE FUNCTION release_expired_bid_stock()
RETURNS INTEGER AS $$
DECLARE
    expired_count INTEGER;
    bid_record RECORD;
    product_record RECORD;
BEGIN
    -- Find all expired locked bids with reserved stock
    FOR bid_record IN 
        SELECT lb.id, lb.bid_id, lb.stock_reserved
        FROM locked_bids lb
        WHERE lb.status = 'PENDING_PAYMENT'
        AND lb.payment_deadline < CURRENT_TIMESTAMP
        AND lb.stock_reserved = TRUE
    LOOP
        -- Get all products in this bid
        FOR product_record IN
            SELECT product_id, variant_id, quantity
            FROM bid_products
            WHERE bid_id = bid_record.bid_id
        LOOP
            -- Release stock back to products table
            UPDATE products
            SET stock_quantity = stock_quantity + product_record.quantity
            WHERE id = product_record.product_id;
            
            -- If variant exists, release variant stock too
            IF product_record.variant_id IS NOT NULL THEN
                UPDATE product_variants
                SET stock_quantity = stock_quantity + product_record.quantity
                WHERE id = product_record.variant_id;
            END IF;
        END LOOP;
        
        -- Update locked bid status
        UPDATE locked_bids
        SET 
            status = 'EXPIRED',
            stock_reserved = FALSE,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = bid_record.id;
        
        -- Remove bid products from cart
        DELETE FROM cart_items
        WHERE locked_bid_id = bid_record.id;
        
        expired_count := expired_count + 1;
    END LOOP;
    
    RETURN COALESCE(expired_count, 0);
END;
$$ LANGUAGE plpgsql;

-- Function to calculate GST for a bid
CREATE OR REPLACE FUNCTION calculate_bid_gst(
    p_bid_id INTEGER,
    p_user_state VARCHAR(100) DEFAULT NULL
)
RETURNS TABLE (
    subtotal DECIMAL(10,2),
    gst_amount DECIMAL(10,2),
    final_amount DECIMAL(10,2)
) AS $$
DECLARE
    v_subtotal DECIMAL(10,2) := 0;
    v_gst_amount DECIMAL(10,2) := 0;
    v_final_amount DECIMAL(10,2) := 0;
    product_record RECORD;
BEGIN
    -- Calculate subtotal and GST for all products in bid
    FOR product_record IN
        SELECT 
            bp.total_price,
            bp.gst_percentage,
            p.gst_percentage as current_gst
        FROM bid_products bp
        LEFT JOIN products p ON bp.product_id = p.id
        WHERE bp.bid_id = p_bid_id
    LOOP
        v_subtotal := v_subtotal + product_record.total_price;
        
        -- Use GST from bid snapshot, fallback to current product GST
        v_gst_amount := v_gst_amount + (
            product_record.total_price * 
            COALESCE(product_record.gst_percentage, product_record.current_gst, 0) / 100
        );
    END LOOP;
    
    v_final_amount := v_subtotal + v_gst_amount;
    
    RETURN QUERY SELECT v_subtotal, v_gst_amount, v_final_amount;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 8. TRIGGERS
-- ============================================================================

-- Trigger to update updated_at timestamp on product_enquiries
CREATE OR REPLACE FUNCTION update_enquiry_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_enquiry_timestamp
    BEFORE UPDATE ON product_enquiries
    FOR EACH ROW
    EXECUTE FUNCTION update_enquiry_timestamp();

-- Trigger to set bid expiry time
CREATE OR REPLACE FUNCTION set_bid_expiry()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.expires_at IS NULL THEN
        NEW.expires_at = CURRENT_TIMESTAMP + (NEW.validity_hours || ' hours')::INTERVAL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_set_bid_expiry
    BEFORE INSERT ON enquiry_bids
    FOR EACH ROW
    EXECUTE FUNCTION set_bid_expiry();

-- Trigger to update locked_bids timestamp
CREATE OR REPLACE FUNCTION update_locked_bid_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_locked_bid_timestamp
    BEFORE UPDATE ON locked_bids
    FOR EACH ROW
    EXECUTE FUNCTION update_locked_bid_timestamp();

-- ============================================================================
-- 9. SAMPLE DATA (for testing)
-- ============================================================================

-- Note: Uncomment below to insert sample data for testing
/*
-- Sample enquiry
INSERT INTO product_enquiries (user_id, product_id, quantity, message, expected_price)
VALUES (
    (SELECT id FROM auth.users LIMIT 1),
    (SELECT id FROM products LIMIT 1),
    100,
    'Need bulk order for corporate event',
    5000.00
);

-- Sample message
INSERT INTO enquiry_messages (enquiry_id, sender_type, sender_id, sender_name, message)
VALUES (
    1,
    'USER',
    (SELECT id FROM auth.users LIMIT 1),
    'Test User',
    'Can you provide a quote for 100 units?'
);
*/

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- Run this script in your Supabase SQL editor or via psql
-- Verify tables created: \dt product_enquiries enquiry_messages enquiry_bids bid_products locked_bids
