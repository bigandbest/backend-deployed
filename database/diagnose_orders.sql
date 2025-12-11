-- Diagnostic query to check user ID mismatch in orders
-- Run this in Supabase SQL Editor to see what's happening

-- 1. Check what user IDs exist in orders table
SELECT DISTINCT user_id, COUNT(*) as order_count
FROM orders
GROUP BY user_id
ORDER BY order_count DESC;

-- 2. Check what user IDs exist in auth.users
SELECT id, email
FROM auth.users
ORDER BY created_at DESC
LIMIT 10;

-- 3. Check what user IDs exist in custom users table
SELECT id, email
FROM public.users
ORDER BY created_at DESC
LIMIT 10;

-- 4. Find orders that don't have a matching user in custom users table
SELECT o.id as order_id, o.user_id, o.created_at, o.total
FROM orders o
LEFT JOIN public.users u ON o.user_id = u.id
WHERE u.id IS NULL
LIMIT 10;

-- 5. If you find mismatched user IDs, update them
-- IMPORTANT: Replace 'OLD_USER_ID' and 'NEW_USER_ID' with actual values
-- Uncomment and run this ONLY after verifying the IDs above:

-- UPDATE orders 
-- SET user_id = 'NEW_USER_ID'  -- Your current auth user ID
-- WHERE user_id = 'OLD_USER_ID';  -- The old user ID from orders table
