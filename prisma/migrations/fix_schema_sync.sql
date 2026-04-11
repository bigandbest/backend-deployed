-- Fix schema sync: Add missing columns and update Decimal precisions
-- This addresses the production error: "Unknown argument `delivery_otp`"

-- 1. Add delivery_otp to orders table
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_otp VARCHAR(6);

-- 2. Remove @unique constraint from idempotency_key (if it exists)
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_idempotency_key_key;

-- 3. Add missing columns to referral_configs
ALTER TABLE referral_configs ADD COLUMN IF NOT EXISTS applicable_first_order BOOLEAN DEFAULT true;
ALTER TABLE referral_configs ADD COLUMN IF NOT EXISTS enable_device_tracking BOOLEAN DEFAULT false;
ALTER TABLE referral_configs ADD COLUMN IF NOT EXISTS enable_notifications BOOLEAN DEFAULT true;
ALTER TABLE referral_configs ADD COLUMN IF NOT EXISTS reminder_before_expiry INTEGER DEFAULT 3;
ALTER TABLE referral_configs ADD COLUMN IF NOT EXISTS updated_by UUID;

-- 4. Add missing columns to user_referral_profiles
ALTER TABLE user_referral_profiles ADD COLUMN IF NOT EXISTS referral_code_created_at TIMESTAMPTZ;
ALTER TABLE user_referral_profiles ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'ACTIVE';

-- 5. Update Decimal precisions in referral_configs
ALTER TABLE referral_configs ALTER COLUMN referrer_reward_amount TYPE NUMERIC(14,2);
ALTER TABLE referral_configs ALTER COLUMN referee_reward_amount TYPE NUMERIC(14,2);
ALTER TABLE referral_configs ALTER COLUMN min_order_value TYPE NUMERIC(14,2);
ALTER TABLE referral_configs ALTER COLUMN min_withdrawal_amount TYPE NUMERIC(14,2);
ALTER TABLE referral_configs ALTER COLUMN max_earning_per_user TYPE NUMERIC(14,2);

-- 6. Update Decimal precisions in user_referral_profiles
ALTER TABLE user_referral_profiles ALTER COLUMN total_earnings TYPE NUMERIC(14,2);
ALTER TABLE user_referral_profiles ALTER COLUMN available_balance TYPE NUMERIC(14,2);
ALTER TABLE user_referral_profiles ALTER COLUMN pending_balance TYPE NUMERIC(14,2);
ALTER TABLE user_referral_profiles ALTER COLUMN withdrawn_amount TYPE NUMERIC(14,2);
ALTER TABLE user_referral_profiles ALTER COLUMN expired_amount TYPE NUMERIC(14,2);
ALTER TABLE user_referral_profiles ALTER COLUMN used_for_purchase TYPE NUMERIC(14,2);
