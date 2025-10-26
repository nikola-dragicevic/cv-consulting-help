-- Migration: Fix RLS policies for candidate_profiles
-- This migration ensures proper RLS setup and links user_id to auth.users

-- Step 1: Drop existing RLS policies if they exist
DROP POLICY IF EXISTS "Users can view own profile" ON candidate_profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON candidate_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON candidate_profiles;
DROP POLICY IF EXISTS "Service role can do anything" ON candidate_profiles;

-- Step 2: Ensure user_id column exists and has proper constraints
-- (It should already exist based on your data, but let's be safe)
DO $$
BEGIN
    -- Add user_id column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'candidate_profiles' AND column_name = 'user_id'
    ) THEN
        ALTER TABLE candidate_profiles ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;

    -- Create index on user_id for better performance
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes WHERE tablename = 'candidate_profiles' AND indexname = 'idx_candidate_profiles_user_id'
    ) THEN
        CREATE INDEX idx_candidate_profiles_user_id ON candidate_profiles(user_id);
    END IF;

    -- Add unique constraint on user_id (one profile per user)
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'candidate_profiles_user_id_key'
    ) THEN
        ALTER TABLE candidate_profiles ADD CONSTRAINT candidate_profiles_user_id_key UNIQUE (user_id);
    END IF;
END $$;

-- Step 3: Enable RLS on the table
ALTER TABLE candidate_profiles ENABLE ROW LEVEL SECURITY;

-- Step 4: Create new RLS policies

-- Allow users to view their own profile
CREATE POLICY "Users can view own profile"
    ON candidate_profiles
    FOR SELECT
    USING (auth.uid() = user_id);

-- Allow users to insert their own profile
CREATE POLICY "Users can insert own profile"
    ON candidate_profiles
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Allow users to update their own profile
CREATE POLICY "Users can update own profile"
    ON candidate_profiles
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Allow service role (for scripts) to do anything
CREATE POLICY "Service role can do anything"
    ON candidate_profiles
    FOR ALL
    USING (auth.jwt()->>'role' = 'service_role')
    WITH CHECK (auth.jwt()->>'role' = 'service_role');

-- Step 5: Grant necessary permissions
GRANT SELECT, INSERT, UPDATE ON candidate_profiles TO authenticated;
GRANT ALL ON candidate_profiles TO service_role;

-- Step 6: Add helpful comment
COMMENT ON TABLE candidate_profiles IS 'Candidate profiles with RLS enabled. Each user can only access their own profile. Service role has full access for scripts.';
