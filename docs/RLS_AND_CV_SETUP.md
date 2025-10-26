# RLS Setup and CV Upload Workflow

## Problem Summary

The error "new row violates row-level security policy" occurs because:

1. **Missing `user_id`**: Existing `candidate_profiles` rows have `user_id = null`
2. **RLS Policy**: Supabase RLS requires `user_id = auth.uid()` for authenticated users
3. **Authentication vs Profiles**: Supabase `auth.users` is separate from your custom `candidate_profiles` table

## Architecture Decision: Use Both Tables

**Yes, you should use BOTH tables:**

1. **`auth.users` (Supabase managed)**:
   - Email/password authentication
   - Session management
   - Secure, automatic user management
   - Accessible via `auth.uid()`

2. **`candidate_profiles` (Your custom table)**:
   - Extended user data (CV, preferences, vectors)
   - Job matching information
   - Linked to `auth.users` via `user_id` foreign key

**Why both?** Supabase `auth.users` is optimized for authentication but limited in what you can store. Your `candidate_profiles` table can store unlimited custom data and is linked via `user_id`.

## Setup Steps

### 1. Run the SQL Migration in Supabase

Go to **Supabase Dashboard → SQL Editor** and run:

```bash
# The migration file is already created at:
supabase/migrations/20250125_fix_rls_policies.sql
```

Copy the contents and execute in Supabase SQL Editor. This will:
- Create proper RLS policies
- Add `user_id` constraints and indexes
- Set up service role access for scripts

### 2. Create Helper Function for Linking Profiles

Run this SQL in Supabase SQL Editor:

```sql
-- Create a helper function to query auth.users by email
CREATE OR REPLACE FUNCTION get_user_by_email(email_param TEXT)
RETURNS TABLE (id UUID, email TEXT)
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
    RETURN QUERY
    SELECT auth.users.id, auth.users.email::TEXT
    FROM auth.users
    WHERE auth.users.email = email_param;
END;
$$ LANGUAGE plpgsql;

-- Grant execute to service_role
GRANT EXECUTE ON FUNCTION get_user_by_email(TEXT) TO service_role;
```

### 3. Link Existing Profiles to Users

Run the Python script to link existing profiles with null `user_id`:

```bash
python scripts/link_profiles_to_users.py
```

This will match profiles to users by email address.

## CV Upload and Vectorization Workflow

### User Registration → Profile Creation Flow

1. **User registers** (`/signup`) → Email confirmation → Login
2. **User logs in** → Session created with `auth.uid()`
3. **User goes to `/profile`** → Profile form loads
4. **User uploads CV** → API creates/updates `candidate_profiles` with `user_id`

### CV Processing Pipeline

```
User uploads CV → /api/profile (POST)
    ↓
1. Upload to Supabase Storage (cvs bucket)
    ↓
2. Insert/Update candidate_profiles row:
   - user_id = auth.uid()
   - cv_file_url = public URL
   - vector = null (invalidated)
    ↓
3. Run vectorization script (manually or cron):
   python scripts/generate_candidate_vector.py
    ↓
4. Script does:
   - Download CV from Supabase Storage
   - Parse PDF → extract text
   - Generate embedding with Ollama
   - Update vector column
```

### Manual Vectorization

After a user uploads a CV, run:

```bash
# Vectorize all candidates with null vectors
python scripts/generate_candidate_vector.py
```

This script:
- Finds profiles where `vector IS NULL`
- Downloads CV from Supabase Storage
- Parses PDF and extracts text
- Generates 768-dim embedding using Ollama (nomic-embed-text)
- Updates the `vector` column

## RLS Policies Explained

### For Authenticated Users (Client-side)

```sql
-- Users can only see/edit their own profile
CREATE POLICY "Users can view own profile"
    ON candidate_profiles FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can update own profile"
    ON candidate_profiles FOR UPDATE
    USING (auth.uid() = user_id);
```

### For Service Role (Scripts)

```sql
-- Scripts with service_role key bypass RLS
CREATE POLICY "Service role can do anything"
    ON candidate_profiles FOR ALL
    USING (auth.jwt()->>'role' = 'service_role');
```

The vectorization script uses `SUPABASE_SERVICE_KEY` which has the `service_role` permission, allowing it to read/write all profiles.

## Security Best Practices

### ✅ DO:
- Always use `auth.uid()` to get the current user ID
- Use `user_id` as the link between `auth.users` and `candidate_profiles`
- Keep `SUPABASE_SERVICE_KEY` secret (never in client code)
- Use RLS policies for all user tables

### ❌ DON'T:
- Don't store sensitive data in `auth.users` (use your custom table)
- Don't use `SUPABASE_SERVICE_KEY` in frontend code
- Don't create profiles without linking to `user_id`
- Don't disable RLS unless absolutely necessary

## Testing the Flow

1. **Register a new user**:
   ```
   Go to /signup → Enter email/password → Confirm email
   ```

2. **Login**:
   ```
   Go to /login → Enter credentials → Should redirect to /profile
   ```

3. **Upload CV**:
   ```
   Go to /profile → Fill form → Upload PDF → Save
   ```

4. **Verify in Supabase**:
   ```sql
   SELECT id, email, full_name, user_id, cv_file_url, vector IS NOT NULL as has_vector
   FROM candidate_profiles;
   ```

5. **Run vectorization**:
   ```bash
   python scripts/generate_candidate_vector.py
   ```

6. **Verify vector**:
   ```sql
   SELECT id, email, vector IS NOT NULL as has_vector
   FROM candidate_profiles;
   ```

## Troubleshooting

### "Row violates RLS policy"
- Check that `user_id` is set in the profile row
- Verify user is authenticated (`auth.uid()` returns a value)
- Ensure RLS policies are created correctly

### "No email sent"
- Check Supabase Auth settings → Email provider enabled
- Verify email templates have `{{ .ConfirmationURL }}`
- Check spam folder

### "CV not vectorized"
- Ensure Ollama is running: `ollama serve`
- Check model is available: `ollama list | grep nomic-embed-text`
- Verify `SUPABASE_SERVICE_KEY` is set in `.env`

### "Cannot download CV from Storage"
- Verify `cvs` bucket exists in Supabase Storage
- Check bucket is public or use signed URLs
- Ensure storage permissions are set correctly

## Next Steps

1. Run the SQL migration
2. Run the linking script for existing profiles
3. Test registration → login → profile → CV upload
4. Set up cron job or webhook to auto-run vectorization script
5. Consider adding a "Processing..." indicator in UI while vector is being generated
