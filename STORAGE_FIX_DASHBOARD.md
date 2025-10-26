# Fix Storage RLS via Supabase Dashboard

## The Problem

You can't create storage policies via SQL migration - you must use the Supabase Dashboard UI.

## Step-by-Step Fix (5 minutes)

### Step 1: Open Storage Settings

1. Go to **Supabase Dashboard** (https://supabase.com/dashboard)
2. Select your project
3. Click **Storage** in the left sidebar
4. You should see the **`cvs`** bucket listed

### Step 2: Configure the Bucket

1. Click on the **`cvs`** bucket
2. Check if **"Public bucket"** toggle is ON (it should be, so CV URLs work)
3. Click the **"Policies"** button at the top

### Step 3: Create Policies

You'll create **4 policies** (one for each operation):

---

#### Policy 1: Upload

1. Click **"New Policy"**
2. Select **"For full customization"** (or "Custom")
3. Fill in:
   - **Policy name**: `Users can upload own CVs`
   - **Allowed operation**: Check **INSERT**
   - **Target roles**: Select **authenticated**
   - **Policy definition**:
     - **WITH CHECK**: Click and paste this:
       ```sql
       bucket_id = 'cvs' AND (storage.foldername(name))[1] = auth.uid()::text
       ```
4. Click **"Review"** then **"Save policy"**

---

#### Policy 2: Select/View

1. Click **"New Policy"**
2. Select **"For full customization"**
3. Fill in:
   - **Policy name**: `Users can view own CVs`
   - **Allowed operation**: Check **SELECT**
   - **Target roles**: Select **authenticated**
   - **Policy definition**:
     - **USING**: Click and paste this:
       ```sql
       bucket_id = 'cvs' AND (storage.foldername(name))[1] = auth.uid()::text
       ```
4. Click **"Review"** then **"Save policy"**

---

#### Policy 3: Update

1. Click **"New Policy"**
2. Select **"For full customization"**
3. Fill in:
   - **Policy name**: `Users can update own CVs`
   - **Allowed operation**: Check **UPDATE**
   - **Target roles**: Select **authenticated**
   - **Policy definition**:
     - **USING**: Click and paste:
       ```sql
       bucket_id = 'cvs' AND (storage.foldername(name))[1] = auth.uid()::text
       ```
     - **WITH CHECK**: Click and paste:
       ```sql
       bucket_id = 'cvs' AND (storage.foldername(name))[1] = auth.uid()::text
       ```
4. Click **"Review"** then **"Save policy"**

---

#### Policy 4: Delete

1. Click **"New Policy"**
2. Select **"For full customization"**
3. Fill in:
   - **Policy name**: `Users can delete own CVs`
   - **Allowed operation**: Check **DELETE**
   - **Target roles**: Select **authenticated**
   - **Policy definition**:
     - **USING**: Click and paste:
       ```sql
       bucket_id = 'cvs' AND (storage.foldername(name))[1] = auth.uid()::text
       ```
4. Click **"Review"** then **"Save policy"**

---

### Step 4: (Optional) Add Public Read Policy

If you want CVs to be viewable by anyone with the URL:

1. Click **"New Policy"**
2. Select **"For full customization"**
3. Fill in:
   - **Policy name**: `Public can view CVs`
   - **Allowed operation**: Check **SELECT**
   - **Target roles**: Select **public**
   - **Policy definition**:
     - **USING**: Click and paste:
       ```sql
       bucket_id = 'cvs'
       ```
4. Click **"Review"** then **"Save policy"**

---

## Verify Policies Are Created

In the Policies view, you should see:

```
✅ Users can upload own CVs       [INSERT] [authenticated]
✅ Users can view own CVs         [SELECT] [authenticated]
✅ Users can update own CVs       [UPDATE] [authenticated]
✅ Users can delete own CVs       [DELETE] [authenticated]
✅ Public can view CVs            [SELECT] [public] (optional)
```

## What These Policies Do

The key part is:
```sql
(storage.foldername(name))[1] = auth.uid()::text
```

This means:
- Your code uploads files to: `{user_id}/filename.pdf`
- The policy checks: "Does the folder name match the logged-in user's ID?"
- ✅ If YES → Allow operation
- ❌ If NO → Block operation (RLS violation)

**Example:**
- User ID: `d0292a60-bf37-414c-baa7-f63d2dd5f836`
- Upload path: `d0292a60-bf37-414c-baa7-f63d2dd5f836/CV.pdf`
- Policy check: Folder `d0292a60-bf37-414c-baa7-f63d2dd5f836` == User ID? ✅ YES → Allow

## Test After Creating Policies

1. **Go back to your app** (refresh browser)
2. **Navigate to `/profile`**
3. **Upload a CV**
4. **Check terminal logs**:
   ```
   Uploading CV file: CV.pdf Size: 64047
   CV uploaded successfully to: https://...  ✅ This should work now!
   ```

## If Still Getting Error

### Check Your User ID

In browser console (F12), type:
```javascript
(await import('@/lib/supabaseBrowser')).getBrowserSupabase().auth.getUser()
```

Note the `id` value.

### Check File Path

The code should be uploading to:
```
{user.id}/{randomUUID}_{filename}
```

Look at terminal logs - it should show the path.

### Verify Policy Expression

Make sure you copied the policy expressions **exactly** - especially:
```sql
(storage.foldername(name))[1]
```

The `[1]` is important - it gets the first folder in the path.

## Alternative: Disable RLS (TESTING ONLY)

If you just want to test quickly:

1. Go to **Storage → cvs bucket → Configuration**
2. Find **"Row Level Security (RLS)"**
3. Toggle it **OFF**
4. Try uploading

⚠️ **WARNING**: This makes all CVs public and writable by anyone! Only use for testing.

## After Storage Works

Once CV upload succeeds, you'll need to run the **candidate_profiles** RLS migration:

```
supabase/migrations/20250125_verify_and_fix_constraints.sql
```

This fixes the database table policies (separate from storage).

---

**TL;DR**:
1. Go to Supabase Dashboard → Storage → cvs → Policies
2. Create 4 policies (INSERT, SELECT, UPDATE, DELETE for authenticated)
3. Use the expressions from above
4. Test CV upload again
