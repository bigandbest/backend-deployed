-- Performance Optimization Indexes for Wallet and Order Tracking
-- Run these SQL commands in your Supabase SQL Editor to improve query performance

-- ============================================
-- WALLET TABLES INDEXES
-- ============================================

-- Index on wallets.user_id for faster wallet lookups
CREATE INDEX IF NOT EXISTS idx_wallets_user_id ON wallets(user_id);

-- Index on wallet_transactions.user_id for faster transaction queries
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_user_id ON wallet_transactions(user_id);

-- Index on wallet_transactions.created_at for faster sorting
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_created_at ON wallet_transactions(created_at DESC);

-- Composite index for wallet transactions by user and type
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_user_type ON wallet_transactions(user_id, transaction_type);

-- Index on wallet_transactions.idempotency_key for duplicate prevention
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_idempotency ON wallet_transactions(idempotency_key);

-- Index on wallet_topups_pending.razorpay_order_id for webhook processing
CREATE INDEX IF NOT EXISTS idx_wallet_topups_razorpay_order ON wallet_topups_pending(razorpay_order_id);

-- Index on wallet_topups_pending.status for pending order queries
CREATE INDEX IF NOT EXISTS idx_wallet_topups_status ON wallet_topups_pending(status);

-- ============================================
-- ORDER TRACKING TABLES INDEXES
-- ============================================

-- Index on orders.user_id for faster user order queries
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);

-- Index on orders.tracking_number for tracking number searches
CREATE INDEX IF NOT EXISTS idx_orders_tracking_number ON orders(tracking_number);

-- Index on orders.status for status-based filtering
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

-- Index on orders.created_at for sorting
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);

-- Index on order_items.order_id for faster order item lookups
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);

-- Index on order_items.product_id for product-based queries
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON order_items(product_id);

-- Index on order_tracking.order_id for faster tracking lookups
CREATE INDEX IF NOT EXISTS idx_order_tracking_order_id ON order_tracking(order_id);

-- Index on order_tracking.timestamp for sorting
CREATE INDEX IF NOT EXISTS idx_order_tracking_timestamp ON order_tracking(timestamp DESC);

-- ============================================
-- ANALYZE TABLES FOR QUERY PLANNER
-- ============================================

-- Update statistics for the query planner
ANALYZE wallets;
ANALYZE wallet_transactions;
ANALYZE wallet_topups_pending;
ANALYZE orders;
ANALYZE order_items;
ANALYZE order_tracking;

-- ============================================
-- NOTES
-- ============================================

-- These indexes will significantly improve query performance for:
-- 1. Wallet balance lookups by user_id
-- 2. Transaction history queries with pagination
-- 3. Order tracking by order_id or tracking_number
-- 4. Order item lookups for order details
-- 5. Webhook processing for payment confirmations

-- Monitor index usage with:
-- SELECT schemaname, tablename, indexname, idx_scan, idx_tup_read, idx_tup_fetch
-- FROM pg_stat_user_indexes
-- WHERE schemaname = 'public'
-- ORDER BY idx_scan DESC;
