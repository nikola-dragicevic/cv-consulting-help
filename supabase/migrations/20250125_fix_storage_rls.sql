-- Migration: Fix RLS policies for Storage bucket 'cvs'
-- This allows authenticated users to upload their own CVs

-- Step 1: Ensure the 'cvs' bucket exists
INSERT INTO storage.buckets (id, name, public)
VALUES ('cvs', 'cvs', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Step 2: Drop existing policies on the bucket (clean slate)
DROP POLICY IF EXISTS "Users can upload their own CVs" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their own CVs" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own CVs" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own CVs" ON storage.objects;
DROP POLICY IF EXISTS "Public can view CVs" ON storage.objects;
DROP POLICY IF EXISTS "Service role can do anything with CVs" ON storage.objects;

-- Step 3: Enable RLS on storage.objects (if not already enabled)
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Step 4: Create policies for authenticated users

-- Allow authenticated users to upload files to their own folder in cvs bucket
CREATE POLICY "authenticated_users_upload_own_cv"
    ON storage.objects
    FOR INSERT
    TO authenticated
    WITH CHECK (
        bucket_id = 'cvs'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

-- Allow authenticated users to view their own CVs
CREATE POLICY "authenticated_users_view_own_cv"
    ON storage.objects
    FOR SELECT
    TO authenticated
    USING (
        bucket_id = 'cvs'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

-- Allow authenticated users to update their own CVs
CREATE POLICY "authenticated_users_update_own_cv"
    ON storage.objects
    FOR UPDATE
    TO authenticated
    USING (
        bucket_id = 'cvs'
        AND (storage.foldername(name))[1] = auth.uid()::text
    )
    WITH CHECK (
        bucket_id = 'cvs'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

-- Allow authenticated users to delete their own CVs
CREATE POLICY "authenticated_users_delete_own_cv"
    ON storage.objects
    FOR DELETE
    TO authenticated
    USING (
        bucket_id = 'cvs'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

-- Allow public read access (since bucket is public)
-- This allows anyone with the URL to view the CV
CREATE POLICY "public_can_view_cvs"
    ON storage.objects
    FOR SELECT
    TO public
    USING (bucket_id = 'cvs');

-- Allow service_role full access to cvs bucket (for scripts)
CREATE POLICY "service_role_all_access_cvs"
    ON storage.objects
    FOR ALL
    TO service_role
    USING (bucket_id = 'cvs')
    WITH CHECK (bucket_id = 'cvs');

-- Step 5: Grant necessary permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO authenticated;
GRANT ALL ON storage.objects TO service_role;

-- Step 6: Verify the setup
DO $$
DECLARE
    policy_count INT;
    bucket_exists BOOLEAN;
BEGIN
    -- Check if bucket exists
    SELECT EXISTS (
        SELECT 1 FROM storage.buckets WHERE id = 'cvs'
    ) INTO bucket_exists;

    -- Count policies for cvs bucket
    SELECT COUNT(*) INTO policy_count
    FROM pg_policies
    WHERE tablename = 'objects'
      AND schemaname = 'storage'
      AND (
          policyname LIKE '%cv%'
          OR policyname LIKE '%cvs%'
      );

    RAISE NOTICE '=== STORAGE BUCKET SETUP COMPLETE ===';
    RAISE NOTICE 'CVs bucket exists: %', bucket_exists;
    RAISE NOTICE 'Storage policies created: %', policy_count;

    IF NOT bucket_exists THEN
        RAISE WARNING 'CVs bucket does not exist! Check for errors above.';
    END IF;

    IF policy_count = 0 THEN
        RAISE WARNING 'No storage policies were created! Check for errors above.';
    END IF;
END $$;

-- Step 7: Show final policies for verification
SELECT
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd
FROM pg_policies
WHERE tablename = 'objects'
  AND schemaname = 'storage'
  AND (policyname LIKE '%cv%' OR policyname LIKE '%cvs%')
ORDER BY policyname;
