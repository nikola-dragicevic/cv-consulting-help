# Troubleshooting RLS Error - Step by Step

## Current Issue

You're getting: **"CV upload failed: new row violates row-level security policy"**

Even after:
- Deleting all users and profiles
- Registering again
- Running the migration scripts

## Root Cause

The `user_id` UNIQUE constraint might not be set up correctly, causing the upsert to fail. When Supabase tries to upsert, it needs to know which column to match on. Without a unique constraint on `user_id`, the upsert treats it as an INSERT, which then fails RLS.

## Complete Fix - Follow These Steps EXACTLY

### Step 1: Clean Slate in Supabase Dashboard

1. Go to **Supabase Dashboard → Database → Tables**
2. Find `candidate_profiles` table
3. Click on the table → Go to **"Constraints"** tab at the top
4. Check if you have a constraint named `candidate_profiles_user_id_key` or similar
5. If not, that's your problem!

### Step 2: Run the Verification Migration

Go to **Supabase Dashboard → SQL Editor** and paste the entire contents of:

```
supabase/migrations/20250125_verify_and_fix_constraints.sql
```

Click **Run**. This will:
- Show you the current state of your table
- Drop all existing policies
- Create the unique constraint on `user_id`
- Recreate proper RLS policies
- Verify everything is set up correctly

**IMPORTANT**: Look at the output. It should say:
```
RLS Policies created: 5
user_id unique constraint exists: true
```

### Step 3: Verify the Setup

Still in SQL Editor, run:

```sql
-- Check unique constraint exists
SELECT constraint_name, constraint_type
FROM information_schema.table_constraints
WHERE table_name = 'candidate_profiles'
  AND constraint_name LIKE '%user_id%';

-- Should return: candidate_profiles_user_id_key | UNIQUE

-- Check RLS policies exist
SELECT policyname, cmd, roles
FROM pg_policies
WHERE tablename = 'candidate_profiles';

-- Should return 5 policies (insert, select, update, delete for authenticated + all for service_role)
```

### Step 4: Test with Better Logging

The code now has detailed logging. After running the migration:

1. **Restart your Next.js dev server**: `npm run dev` or `yarn dev`
2. **Open browser console** (F12)
3. **Go to `/profile`**
4. **Fill in your details and upload a CV**
5. **Click "Spara ändringar"**
6. **Check the terminal logs** (where Next.js is running)

You should see logs like:
```
Processing profile update for user: <uuid> <email>
Uploading CV file: testcv.pdf Size: 12345
CV uploaded successfully to: https://...
Existing profile: Not found
Profile data to save: { user_id: ..., email: ..., full_name: ... }
Profile upsert successful: [ { id: ..., ... } ]
```

### Step 5: If Still Getting RLS Error

If you still get the error after Step 2, check the **terminal logs** for the detailed error. The code now logs:

```javascript
Upsert error details: {
  message: "...",
  details: "...",
  hint: "...",
  code: "..."
}
```

**Common error codes:**

- **`42501`** = RLS policy violation
  - Solution: Check policies are created correctly
  - Make sure you're logged in (check auth.uid() in browser console)

- **`23505`** = Unique constraint violation
  - Solution: There's already a profile with this user_id
  - Check: `SELECT * FROM candidate_profiles WHERE user_id = '<your-user-id>';`

- **`23503`** = Foreign key constraint violation
  - Solution: The user_id doesn't exist in auth.users
  - This shouldn't happen if you're logged in

### Step 6: Manual Verification

Run this in SQL Editor to see what's happening:

```sql
-- Check your auth user exists
SELECT id, email, created_at
FROM auth.users
WHERE email = 'your-email@example.com';
-- Note the 'id' value

-- Check if profile exists for this user
SELECT id, user_id, email, full_name, cv_file_url
FROM candidate_profiles
WHERE user_id = '<paste-id-from-above>';

-- If profile exists, try to manually update it
UPDATE candidate_profiles
SET full_name = 'Test Name'
WHERE user_id = '<paste-id-from-above>';
-- If this fails, you have an RLS policy issue

-- If profile doesn't exist, try to manually insert
INSERT INTO candidate_profiles (user_id, email, full_name)
VALUES ('<paste-id-from-above>', 'your-email@example.com', 'Test Name');
-- If this fails, you have an RLS policy issue
```

### Step 7: Nuclear Option - Disable RLS Temporarily

**Only do this for testing!** Never in production.

```sql
-- Temporarily disable RLS
ALTER TABLE candidate_profiles DISABLE ROW LEVEL SECURITY;

-- Try uploading CV now via the UI

-- If it works, the problem is definitely the RLS policies
-- Re-enable RLS
ALTER TABLE candidate_profiles ENABLE ROW LEVEL SECURITY;

-- Then re-run the migration from Step 2
```

## Understanding the Fix

### What Changed in the Code

1. **Better logging**: You can now see exactly what's happening
2. **Storage path fix**: Changed from `cvs/${user.id}/...` to `${user.id}/...` (bucket is already "cvs")
3. **Explicit upsert options**: Added `ignoreDuplicates: false` and `.select()` to see the result
4. **Existing profile check**: Logs whether a profile already exists

### What the Migration Does

1. **Drops all old policies**: Clean slate to avoid conflicts
2. **Ensures user_id column exists**: With proper foreign key to auth.users
3. **Creates unique constraint**: `candidate_profiles_user_id_key` - **THIS IS CRITICAL**
4. **Creates 5 RLS policies**:
   - INSERT policy for authenticated users
   - SELECT policy for authenticated users
   - UPDATE policy for authenticated users
   - DELETE policy for authenticated users
   - ALL policy for service_role (scripts)

### Why Upsert Needs Unique Constraint

```javascript
// This line requires a unique constraint on user_id
.upsert(profileData, { onConflict: "user_id" })

// Without it, Supabase doesn't know how to match existing rows
// So it tries to INSERT, which fails if:
// 1. RLS blocks the insert
// 2. Another unique constraint is violated
```

## Expected Behavior After Fix

1. **First time**: User uploads CV → INSERT new profile row
2. **Second time**: User uploads CV → UPDATE existing profile row
3. **Scripts**: Can read/write all profiles (service_role bypass)

## Verification Checklist

Before trying to upload CV, verify:

- [ ] Unique constraint exists: `candidate_profiles_user_id_key`
- [ ] RLS is enabled on `candidate_profiles`
- [ ] 5 RLS policies exist
- [ ] You're logged in (check `/api/profile` returns 200, not 401)
- [ ] Next.js dev server is restarted
- [ ] Browser console and terminal are open for logs

## Still Not Working?

If you've done all the above and it still fails, share:

1. The **terminal logs** when you click "Spara ändringar"
2. The **output** from running the verification queries in Step 6
3. The **exact error message** from the browser

The detailed logging should tell us exactly where it's failing.

---

**TL;DR**: Run `supabase/migrations/20250125_verify_and_fix_constraints.sql` in Supabase SQL Editor, restart Next.js, and try again. Check terminal logs for details.
