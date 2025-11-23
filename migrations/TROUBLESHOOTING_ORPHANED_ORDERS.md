# Handling Orphaned COD Orders - Troubleshooting Guide

## Problem
The migration script encountered COD orders with `user_id` values that don't exist in the `users` table. This is a foreign key constraint violation.

## Root Cause
Some COD orders were created with invalid or deleted user IDs, creating "orphaned" records that reference non-existent users.

---

## Solution 1: Identify Orphaned Orders

Run this query to see which orders are orphaned:

```sql
-- Find all orphaned COD orders
SELECT 
    c.id,
    c.user_id,
    c.user_name,
    c.user_email,
    c.product_name,
    c.product_total_price,
    c.created_at
FROM cod_orders c
WHERE NOT EXISTS (
    SELECT 1 FROM users u WHERE u.id = c.user_id::uuid
)
ORDER BY c.created_at DESC;
```

---

## Solution 2: Handle Orphaned Orders

You have three options:

### Option A: Create Placeholder Users (Recommended)

Create placeholder user accounts for orphaned orders:

```sql
-- Create a placeholder user for each orphaned user_id
INSERT INTO users (
    id,
    email,
    name,
    phone,
    role,
    is_active,
    created_at
)
SELECT DISTINCT
    c.user_id::uuid,
    COALESCE(c.user_email, 'orphaned_' || c.user_id || '@placeholder.com'),
    COALESCE(c.user_name, 'Orphaned User'),
    '0000000000',
    'customer',
    false, -- Mark as inactive
    c.created_at
FROM cod_orders c
WHERE NOT EXISTS (
    SELECT 1 FROM users u WHERE u.id = c.user_id::uuid
)
ON CONFLICT (id) DO NOTHING;
```

**Then re-run the migration script.**

---

### Option B: Skip Orphaned Orders (Current Behavior)

The updated migration script automatically skips orphaned orders. They will remain in the `cod_orders` table but won't be migrated.

**Pros:**
- Safe - no data corruption
- Preserves original data
- Can be reviewed later

**Cons:**
- Orphaned orders won't appear in unified view
- Historical data incomplete

**To accept this:**
Just run the migration script as-is. It will skip orphaned orders and report how many were skipped.

---

### Option C: Delete Orphaned Orders (Use with Caution)

If orphaned orders are test data or invalid, you can delete them:

```sql
-- BACKUP FIRST!
CREATE TABLE cod_orders_orphaned_backup AS
SELECT c.* FROM cod_orders c
WHERE NOT EXISTS (
    SELECT 1 FROM users u WHERE u.id = c.user_id::uuid
);

-- Then delete orphaned orders
DELETE FROM cod_orders
WHERE NOT EXISTS (
    SELECT 1 FROM users u WHERE u.id = cod_orders.user_id::uuid
);
```

**⚠️ WARNING:** This permanently deletes data. Only use if you're certain these are invalid orders.

---

## Recommended Approach

**For Production Data:**

1. **Identify orphaned orders:**
```sql
SELECT COUNT(*) as orphaned_count
FROM cod_orders c
WHERE NOT EXISTS (
    SELECT 1 FROM users u WHERE u.id = c.user_id::uuid
);
```

2. **Create placeholder users (Option A):**
```sql
-- Run the INSERT INTO users query from Option A above
```

3. **Re-run migration:**
```sql
-- Run the updated merge_cod_orders.sql script
```

4. **Verify results:**
```sql
-- Check migration summary
SELECT 
    COUNT(*) as total_cod_orders,
    COUNT(CASE WHEN payment_method = 'cod' THEN 1 END) as migrated_to_orders
FROM cod_orders;

-- Should match or be close
SELECT COUNT(*) FROM orders WHERE payment_method = 'cod';
```

---

## Step-by-Step Migration Process

### Step 1: Backup Everything
```sql
-- Backup cod_orders
CREATE TABLE cod_orders_backup AS SELECT * FROM cod_orders;

-- Backup users
CREATE TABLE users_backup AS SELECT * FROM users;

-- Backup orders
CREATE TABLE orders_backup AS SELECT * FROM orders;
```

### Step 2: Check for Orphaned Records
```sql
-- Count orphaned orders
SELECT COUNT(*) FROM cod_orders c
WHERE NOT EXISTS (
    SELECT 1 FROM users u WHERE u.id = c.user_id::uuid
);
```

### Step 3: Create Placeholder Users (if needed)
```sql
-- Create placeholder users for orphaned orders
INSERT INTO users (
    id,
    email,
    name,
    phone,
    role,
    is_active,
    created_at,
    account_type
)
SELECT DISTINCT
    c.user_id::uuid,
    COALESCE(c.user_email, 'orphaned_' || c.user_id || '@placeholder.com'),
    COALESCE(c.user_name, 'Orphaned User ' || c.user_id),
    COALESCE(SUBSTRING(c.user_email FROM 1 FOR 10), '0000000000'),
    'customer',
    false,
    c.created_at,
    'individual'
FROM cod_orders c
WHERE NOT EXISTS (
    SELECT 1 FROM users u WHERE u.id = c.user_id::uuid
)
ON CONFLICT (id) DO NOTHING;
```

### Step 4: Verify Placeholder Users Created
```sql
-- Check that all user_ids now exist
SELECT COUNT(*) as remaining_orphaned
FROM cod_orders c
WHERE NOT EXISTS (
    SELECT 1 FROM users u WHERE u.id = c.user_id::uuid
);
-- Should return 0
```

### Step 5: Run Migration Script
```sql
-- Execute the updated merge_cod_orders.sql
\i backend-deployed/migrations/merge_cod_orders.sql
```

### Step 6: Verify Migration
```sql
-- Check migration results
SELECT 
    'COD Orders (source)' as table_name,
    COUNT(*) as count
FROM cod_orders
UNION ALL
SELECT 
    'Orders (COD migrated)' as table_name,
    COUNT(*) as count
FROM orders WHERE payment_method = 'cod'
UNION ALL
SELECT 
    'Order Items (COD)' as table_name,
    COUNT(*) as count
FROM order_items oi
INNER JOIN orders o ON o.id = oi.order_id
WHERE o.payment_method = 'cod';
```

---

## Verification Queries

### Check Data Integrity
```sql
-- All COD orders should have valid user_ids
SELECT COUNT(*) as invalid_users
FROM orders
WHERE payment_method = 'cod'
AND NOT EXISTS (
    SELECT 1 FROM users u WHERE u.id = orders.user_id
);
-- Should return 0

-- All COD orders should have order_items
SELECT o.id, o.user_name, o.product_name
FROM orders o
LEFT JOIN order_items oi ON oi.order_id = o.id
WHERE o.payment_method = 'cod'
AND oi.id IS NULL;
-- Should return 0 rows

-- Check for duplicates
SELECT user_id, created_at, COUNT(*)
FROM orders
WHERE payment_method = 'cod'
GROUP BY user_id, created_at
HAVING COUNT(*) > 1;
-- Should return 0 rows
```

### Compare Totals
```sql
-- Compare order counts
SELECT 
    (SELECT COUNT(*) FROM cod_orders) as original_count,
    (SELECT COUNT(*) FROM orders WHERE payment_method = 'cod') as migrated_count,
    (SELECT COUNT(*) FROM cod_orders) - (SELECT COUNT(*) FROM orders WHERE payment_method = 'cod') as difference;
```

---

## Rollback Procedure

If something goes wrong:

```sql
-- Restore from backups
DROP TABLE orders;
CREATE TABLE orders AS SELECT * FROM orders_backup;

DROP TABLE users;
CREATE TABLE users AS SELECT * FROM users_backup;

DROP TABLE cod_orders;
CREATE TABLE cod_orders AS SELECT * FROM cod_orders_backup;

-- Verify restoration
SELECT COUNT(*) FROM orders;
SELECT COUNT(*) FROM users;
SELECT COUNT(*) FROM cod_orders;
```

---

## Prevention for Future

To prevent orphaned records in the future:

1. **Add Foreign Key Constraint:**
```sql
-- Ensure cod_orders has proper foreign key (if keeping the table)
ALTER TABLE cod_orders
ADD CONSTRAINT fk_cod_orders_user
FOREIGN KEY (user_id) 
REFERENCES users(id) 
ON DELETE CASCADE;
```

2. **Application-Level Validation:**
```javascript
// In codOrderController.js
const { data: user } = await supabase
  .from('users')
  .select('id')
  .eq('id', user_id)
  .single();

if (!user) {
  return res.status(400).json({
    success: false,
    error: 'Invalid user_id: User does not exist'
  });
}
```

---

## Summary

**The updated migration script now:**
- ✅ Checks for orphaned records before migration
- ✅ Reports how many orders will be skipped
- ✅ Only migrates orders with valid user_ids
- ✅ Provides detailed migration summary
- ✅ Prevents foreign key constraint violations

**To proceed:**
1. Decide which option to use (A, B, or C)
2. If using Option A, create placeholder users first
3. Run the updated migration script
4. Review the migration summary
5. Verify data integrity

---

**Last Updated**: 2025-11-23
**Issue**: Foreign Key Constraint Violation
**Status**: ✅ Resolved
