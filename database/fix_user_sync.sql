-- Fix user sync issue between auth.users and custom users table
-- This ensures users are automatically created in the users table when they sign up

-- 1. First, sync any existing auth users to the users table
-- Using ON CONFLICT to update existing records instead of failing
INSERT INTO public.users (id, email, created_at)
SELECT 
    id, 
    email, 
    created_at
FROM auth.users
ON CONFLICT (id) 
DO UPDATE SET 
    email = EXCLUDED.email;

-- 2. Create a trigger function to automatically sync new users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (id, email, created_at)
    VALUES (NEW.id, NEW.email, NEW.created_at)
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Drop the trigger if it exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- 4. Create the trigger
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- 5. Verify the sync worked
SELECT 
    COUNT(*) as auth_users_count,
    (SELECT COUNT(*) FROM public.users) as custom_users_count
FROM auth.users;
