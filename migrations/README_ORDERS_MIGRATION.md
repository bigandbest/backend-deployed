# Orders Table Unification - Migration Guide

## Overview
This migration merges the `cod_orders` and `orders` tables into a single unified `orders` table while keeping the API endpoints separate for backward compatibility.

## Changes Made

### 1. Database Schema Changes
- Added new columns to `orders` table:
  - `user_name` (VARCHAR)
  - `user_email` (VARCHAR)
  - `user_location` (VARCHAR)
  - `product_name` (TEXT)
  - `product_total_price` (NUMERIC)
- `payment_method` column now distinguishes between 'cod' and 'prepaid' orders
- Created indexes for better query performance

### 2. Backend Changes

#### COD Order Controller (`backend-deployed/controller/codOrderController.js`)
- **UPDATED**: All functions now use the unified `orders` table
- **FILTER**: All queries filter by `payment_method = 'cod'`
- **BACKWARD COMPATIBLE**: API responses maintain the same structure
- Functions updated:
  - `createCodOrder` - Creates order in `orders` table with `payment_method='cod'`
  - `getAllCodOrders` - Fetches from `orders` WHERE `payment_method='cod'`
  - `updateCodOrderStatus` - Updates in `orders` table
  - `getCodOrderById` - Fetches single COD order
  - `deleteCodOrder` - Deletes from `orders` table
  - `getCodOrdersStats` - Statistics for COD orders only
  - `getUserCodOrders` - User's COD orders

#### Order Controller (`backend-deployed/controller/orderController.js`)
- **UPDATED**: `getAllOrders` now accepts `payment_method` query parameter
- Default behavior: Shows only prepaid orders (`payment_method='prepaid'`)
- Use `payment_method=all` to fetch all orders (COD + Prepaid)
- Use `payment_method=cod` to fetch only COD orders

### 3. API Endpoints

#### COD Orders Routes (Unchanged URLs)
```
POST   /api/cod-orders/create          - Create COD order
GET    /api/cod-orders/all             - Get all COD orders (Admin)
GET    /api/cod-orders/stats           - Get COD statistics
GET    /api/cod-orders/:id             - Get COD order by ID
PUT    /api/cod-orders/status/:id      - Update COD order status
DELETE /api/cod-orders/:id             - Delete COD order
GET    /api/cod-orders/user/:user_id   - Get user's COD orders
```

#### Regular Orders Routes
```
GET    /api/order/all?payment_method=prepaid  - Get prepaid orders (default)
GET    /api/order/all?payment_method=cod      - Get COD orders
GET    /api/order/all?payment_method=all      - Get all orders
POST   /api/order/place                       - Place prepaid order
... (other existing endpoints)
```

### 4. Frontend Changes

#### New Unified Orders Page
- **File**: `admin-deployed/src/Pages/Orders/UnifiedOrders.jsx`
- **Features**:
  - View all orders (COD + Prepaid) in one place
  - Filter by payment method (All, COD, Prepaid)
  - Filter by status
  - Visual badges for payment method
  - Same functionality as separate pages

#### Existing Pages (Still Work)
- `admin-deployed/src/Pages/Orders/index.jsx` - Regular orders (prepaid)
- `admin-deployed/src/Pages/CodOrders/CodOrders.jsx` - COD orders only

## Migration Steps

### Step 1: Run Database Migration
```sql
-- Execute the migration script
psql -U your_username -d your_database -f backend-deployed/migrations/merge_cod_orders.sql
```

Or run it in your Supabase SQL Editor:
1. Go to Supabase Dashboard → SQL Editor
2. Copy contents of `backend-deployed/migrations/merge_cod_orders.sql`
3. Execute the script

### Step 2: Verify Data Migration
```sql
-- Check that COD orders were migrated
SELECT COUNT(*) FROM orders WHERE payment_method = 'cod';

-- Check that order_items were created
SELECT o.id, o.payment_method, COUNT(oi.id) as item_count
FROM orders o
LEFT JOIN order_items oi ON oi.order_id = o.id
WHERE o.payment_method = 'cod'
GROUP BY o.id, o.payment_method;
```

### Step 3: Deploy Backend Changes
```bash
cd backend-deployed
npm install  # If any new dependencies
# Deploy to your hosting platform
```

### Step 4: Deploy Frontend Changes
```bash
cd admin-deployed
npm install  # If any new dependencies
# Build and deploy
```

### Step 5: Test API Endpoints
```bash
# Test COD orders endpoint
curl http://your-api-url/api/cod-orders/all

# Test unified orders endpoint
curl http://your-api-url/api/order/all?payment_method=all
```

## Rollback Plan

If you need to rollback:

1. **Restore cod_orders table** (if you created backup):
```sql
-- If you created backup
CREATE TABLE cod_orders AS SELECT * FROM cod_orders_backup;

-- Restore old controller files from git
git checkout HEAD~1 backend-deployed/controller/codOrderController.js
```

2. **Revert backend code**:
```bash
cd backend-deployed
git revert <commit-hash>
```

## Benefits

1. **Single Source of Truth**: All orders in one table
2. **Easier Reporting**: Query all orders together
3. **Better Analytics**: Unified order statistics
4. **Simplified Maintenance**: One table to manage
5. **Backward Compatible**: Existing API endpoints still work
6. **Flexible Querying**: Filter by payment method as needed

## Important Notes

⚠️ **DO NOT drop the `cod_orders` table immediately**
- Keep it as backup for at least 1-2 weeks
- Verify all functionality works correctly
- Only drop after thorough testing

⚠️ **Test thoroughly before production**
- Test COD order creation
- Test prepaid order creation
- Test order updates and deletions
- Test all admin pages
- Test user order history

## Support

If you encounter any issues:
1. Check the migration logs
2. Verify database schema matches expected structure
3. Check API response formats
4. Review backend logs for errors

## Future Improvements

- [ ] Add migration status tracking
- [ ] Implement data validation checks
- [ ] Add automated tests for unified orders
- [ ] Create admin dashboard for order analytics
- [ ] Add export functionality for all orders
