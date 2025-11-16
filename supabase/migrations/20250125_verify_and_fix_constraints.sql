-- Verification and Fix Script for candidate_profiles
-- Run this to check current state and fix issues

-- Step 1: Check current state
DO $$
BEGIN
    RAISE NOTICE '=== VERIFICATION REPORT ===';
    RAISE NOTICE 'Checking candidate_profiles table...';
END $$;

-- Step 2: Show current RLS status
SELECT
    schemaname,
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables
WHERE tablename = 'candidate_profiles';

-- Step 3: Show existing constraints
SELECT
    con.conname AS constraint_name,
    con.contype AS constraint_type,
    CASE con.contype
        WHEN 'p' THEN 'PRIMARY KEY'
        WHEN 'u' THEN 'UNIQUE'
        WHEN 'f' THEN 'FOREIGN KEY'
        WHEN 'c' THEN 'CHECK'
        ELSE con.contype::TEXT
    END AS constraint_description
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
WHERE rel.relname = 'candidate_profiles';

-- Step 4: Show existing policies
SELECT
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE tablename = 'candidate_profiles';

-- Step 5: Drop ALL existing policies (clean slate)
DROP POLICY IF EXISTS "Users can view own profile" ON candidate_profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON candidate_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON candidate_profiles;
DROP POLICY IF EXISTS "Users can delete own profile" ON candidate_profiles;
DROP POLICY IF EXISTS "Service role can do anything" ON candidate_profiles;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON candidate_profiles;
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON candidate_profiles;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON candidate_profiles;

-- Step 6: Ensure user_id column exists with proper type
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'candidate_profiles'
          AND column_name = 'user_id'
    ) THEN
        ALTER TABLE candidate_profiles
        ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
        RAISE NOTICE 'Added user_id column';
    ELSE
        RAISE NOTICE 'user_id column already exists';
    END IF;
END $$;

-- Step 7: Drop old unique constraint if it exists (we'll recreate it)
ALTER TABLE candidate_profiles DROP CONSTRAINT IF EXISTS candidate_profiles_user_id_key;
ALTER TABLE candidate_profiles DROP CONSTRAINT IF EXISTS candidate_profiles_email_key;

-- Step 8: Add unique constraint on user_id (required for upsert)
ALTER TABLE candidate_profiles ADD CONSTRAINT candidate_profiles_user_id_key UNIQUE (user_id);

-- Step 9: Create index for performance
DROP INDEX IF EXISTS idx_candidate_profiles_user_id;
CREATE INDEX idx_candidate_profiles_user_id ON candidate_profiles(user_id);

-- Step 10: Enable RLS
ALTER TABLE candidate_profiles ENABLE ROW LEVEL SECURITY;

-- Step 11: Create comprehensive RLS policies

-- Allow authenticated users to INSERT their own profile
CREATE POLICY "authenticated_users_insert_own_profile"
    ON candidate_profiles
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

-- Allow authenticated users to SELECT their own profile
CREATE POLICY "authenticated_users_select_own_profile"
    ON candidate_profiles
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- Allow authenticated users to UPDATE their own profile
CREATE POLICY "authenticated_users_update_own_profile"
    ON candidate_profiles
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Allow authenticated users to DELETE their own profile
CREATE POLICY "authenticated_users_delete_own_profile"
    ON candidate_profiles
    FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);

-- Allow service_role full access (for scripts)
CREATE POLICY "service_role_all_access"
    ON candidate_profiles
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Step 12: Grant necessary permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON candidate_profiles TO authenticated;
GRANT ALL ON candidate_profiles TO service_role;

-- Step 13: Verify the setup
DO $$
DECLARE
    policy_count INT;
    constraint_count INT;
BEGIN
    SELECT COUNT(*) INTO policy_count
    FROM pg_policies
    WHERE tablename = 'candidate_profiles';

    SELECT COUNT(*) INTO constraint_count
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE rel.relname = 'candidate_profiles'
      AND con.conname = 'candidate_profiles_user_id_key';

    RAISE NOTICE '=== SETUP COMPLETE ===';
    RAISE NOTICE 'RLS Policies created: %', policy_count;
    RAISE NOTICE 'user_id unique constraint exists: %', constraint_count > 0;

    IF policy_count = 0 THEN
        RAISE WARNING 'No policies were created! Check for errors above.';
    END IF;

    IF constraint_count = 0 THEN
        RAISE WARNING 'user_id unique constraint missing! Upsert will not work.';
    END IF;
END $$;

-- Step 14: Show final policies
SELECT
    policyname,
    cmd,
    roles
FROM pg_policies
WHERE tablename = 'candidate_profiles'
ORDER BY policyname;
