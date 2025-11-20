-- Fix Row-Level Security for cart_items table
-- This script creates proper RLS policies for cart operations

-- First, check if RLS is enabled
-- If you want to disable RLS temporarily (NOT RECOMMENDED for production):
-- ALTER TABLE cart_items DISABLE ROW LEVEL SECURITY;

-- Better approach: Create proper RLS policies

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their own cart items" ON cart_items;
DROP POLICY IF EXISTS "Users can insert their own cart items" ON cart_items;
DROP POLICY IF EXISTS "Users can update their own cart items" ON cart_items;
DROP POLICY IF EXISTS "Users can delete their own cart items" ON cart_items;
DROP POLICY IF EXISTS "Service role can do anything" ON cart_items;

-- Enable RLS (if not already enabled)
ALTER TABLE cart_items ENABLE ROW LEVEL SECURITY;

-- Policy 1: Service role (backend) can do anything
CREATE POLICY "Service role can do anything" ON cart_items
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Policy 2: Authenticated users can view their own cart items
CREATE POLICY "Users can view their own cart items" ON cart_items
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Policy 3: Authenticated users can insert their own cart items
CREATE POLICY "Users can insert their own cart items" ON cart_items
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Policy 4: Authenticated users can update their own cart items
CREATE POLICY "Users can update their own cart items" ON cart_items
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Policy 5: Authenticated users can delete their own cart items
CREATE POLICY "Users can delete their own cart items" ON cart_items
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Policy 6: Allow anonymous users to manage cart (if you support guest checkout)
-- Uncomment these if you want to allow unauthenticated users to use cart
/*
CREATE POLICY "Anonymous users can view cart items" ON cart_items
FOR SELECT
TO anon
USING (true);

CREATE POLICY "Anonymous users can insert cart items" ON cart_items
FOR INSERT
TO anon
WITH CHECK (true);

CREATE POLICY "Anonymous users can update cart items" ON cart_items
FOR UPDATE
TO anon
USING (true)
WITH CHECK (true);

CREATE POLICY "Anonymous users can delete cart items" ON cart_items
FOR DELETE
TO anon
USING (true);
*/

-- Verify policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'cart_items';

-- Success message
SELECT 'Cart items RLS policies created successfully!' as status;
