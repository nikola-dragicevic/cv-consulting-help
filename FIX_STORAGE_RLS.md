# Fix Storage RLS Error - URGENT

## The REAL Problem

The error is NOT from the `candidate_profiles` table - it's from **Supabase Storage**!

```
Storage upload error: Error [StorageApiError]: new row violates row-level security policy
status: 403
```

The `cvs` storage bucket doesn't have RLS policies allowing users to upload files.

## Quick Fix - Run This SQL NOW

### Option 1: Run the Migration (Recommended)

1. Go to **Supabase Dashboard → SQL Editor**
2. Copy and paste the **entire contents** of:
   ```
   supabase/migrations/20250125_fix_storage_rls.sql
   ```
3. Click **Run**
4. Check output shows:
   ```
   CVs bucket exists: true
   Storage policies created: 6
   ```

### Option 2: Manual Fix in Dashboard (Faster)

1. **Go to Supabase Dashboard → Storage**
2. **Click on the `cvs` bucket** (or create it if it doesn't exist)
3. **Click "Policies" tab**
4. **Click "New Policy"**
5. **Select "Custom"**
6. **Create these 4 policies:**

#### Policy 1: Upload Own CV
```sql
Policy name: Users can upload their own CVs
Allowed operations: INSERT
Target roles: authenticated

WITH CHECK expression:
bucket_id = 'cvs' AND (storage.foldername(name))[1] = auth.uid()::text
```

#### Policy 2: View Own CV
```sql
Policy name: Users can view their own CVs
Allowed operations: SELECT
Target roles: authenticated

USING expression:
bucket_id = 'cvs' AND (storage.foldername(name))[1] = auth.uid()::text
```

#### Policy 3: Update Own CV
```sql
Policy name: Users can update their own CVs
Allowed operations: UPDATE
Target roles: authenticated

USING expression:
bucket_id = 'cvs' AND (storage.foldername(name))[1] = auth.uid()::text

WITH CHECK expression:
bucket_id = 'cvs' AND (storage.foldername(name))[1] = auth.uid()::text
```

#### Policy 4: Delete Own CV
```sql
Policy name: Users can delete their own CVs
Allowed operations: DELETE
Target roles: authenticated

USING expression:
bucket_id = 'cvs' AND (storage.foldername(name))[1] = auth.uid()::text
```

#### Policy 5: Public Read (Optional - for viewing CVs via public URL)
```sql
Policy name: Public can view CVs
Allowed operations: SELECT
Target roles: public

USING expression:
bucket_id = 'cvs'
```

### Option 3: Quick Temporary Fix (For Testing Only!)

If you just want to test quickly, **temporarily disable RLS on storage**:

1. Go to **Supabase Dashboard → Storage**
2. Click **`cvs` bucket**
3. Click **Settings** (gear icon)
4. Toggle **"Enable RLS"** to OFF

⚠️ **WARNING**: This makes all CVs accessible to everyone! Only use for testing, then enable RLS and add policies.

## How the Storage Path Works

Your code uploads to:
```javascript
const path = `${user.id}/${crypto.randomUUID()}_${file.name}`;
// Example: "d0292a60-bf37-414c-baa7-f63d2dd5f836/abc123_CV.pdf"
```

The RLS policy checks:
```sql
(storage.foldername(name))[1] = auth.uid()::text
```

This means:
- Each user has their own folder (their user_id)
- Users can only upload to their own folder
- Users can only view files in their own folder

## Verify After Fix

Run this in **SQL Editor**:

```sql
-- Check if bucket exists
SELECT id, name, public FROM storage.buckets WHERE id = 'cvs';

-- Check storage policies
SELECT
    policyname,
    cmd,
    roles
FROM pg_policies
WHERE tablename = 'objects'
  AND schemaname = 'storage'
  AND policyname LIKE '%cv%'
ORDER BY policyname;
```

Should show:
- 1 bucket: `cvs`
- 6 policies (or at least 4 for authenticated users)

## Test CV Upload Again

After running the migration:

1. **Refresh your browser** (Ctrl+F5)
2. **Go to `/profile`**
3. **Upload a CV**
4. **Check terminal logs**

You should see:
```
Processing profile update for user: <uuid> <email>
Uploading CV file: CV.pdf Size: 64047
CV uploaded successfully to: https://...
Existing profile: Not found (or Found)
Profile data to save: { ... }
Profile upsert successful: [ { ... } ]
```

## If Still Failing

### Check Browser Console (F12)

Look for any errors related to fetch or network.

### Check Terminal Logs

The detailed logs will show exactly where it fails:
- ✅ If you see "CV uploaded successfully" → Storage RLS is fixed
- ❌ If you still see "Storage upload error" → Policies weren't created correctly

### Verify User ID Match

```sql
-- Your user ID
SELECT id, email FROM auth.users WHERE email = 'your-email@example.com';

-- Your uploaded files
SELECT name, bucket_id FROM storage.objects WHERE bucket_id = 'cvs';
```

The folder name (first part of path) should match your user ID.

## Understanding the Error

```
StorageApiError: new row violates row-level security policy
status: 403
```

This means:
- ✅ Authentication works (you're logged in)
- ✅ The bucket exists
- ❌ RLS policy blocks the INSERT operation
- **Solution**: Add INSERT policy for authenticated users

## Complete Fix Order

1. ✅ Fix Storage RLS (this file) ← **DO THIS FIRST**
2. ⏭️ Fix candidate_profiles RLS (already created migration)
3. ⏭️ Test full flow: Upload CV → Profile updated → Run vectorization

---

**TL;DR**: Run `supabase/migrations/20250125_fix_storage_rls.sql` in Supabase SQL Editor, then try uploading CV again.
