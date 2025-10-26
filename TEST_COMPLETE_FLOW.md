# Complete CV Upload & Vectorization Test

## Current Status ✅

Great progress! Here's what's working:

1. ✅ **User Registration**: Working with email confirmation
2. ✅ **User Login**: Session persists correctly
3. ✅ **Header UI**: Shows logged-in state (after fix)
4. ✅ **CV Upload**: File uploaded successfully to storage
5. ✅ **Profile Save**: Data saved to `candidate_profiles` table
6. ⏳ **Vectorization**: Script found the CV, but path issue (just fixed)

## Next Steps

### Step 1: Install Python Dependencies

The vectorization script needs PyMuPDF to parse PDFs:

```bash
# Navigate to scripts directory
cd scripts

# Install dependencies
pip install -r requirements.txt

# Or install individually:
pip install PyMuPDF httpx supabase python-dotenv
```

### Step 2: Verify Ollama is Running

The script needs Ollama for embeddings:

```bash
# Check if Ollama is running
ollama list

# Should show:
# nomic-embed-text  latest  ...

# If not installed, pull the model:
ollama pull nomic-embed-text

# Start Ollama (if not running):
ollama serve
```

### Step 3: Run Vectorization Script

```bash
# From project root
python scripts/generate_candidate_vector.py
```

**Expected output:**
```
📦 Using embedding model: nomic-embed-text
🔗 Supabase URL: https://...
🚀 Starting candidate vectorization...
📋 Found 1 candidates to process...

[1/1] Embedding: Nikola Dragicevic (wazzzaaaa46@gmail.com)
🔗 Signed URL: https://...
📄 Downloading CV to: ./downloads/d0292a60-bf37-414c-baa7-f63d2dd5f836_4472cc1e-..._CV.pdf
✅ Downloaded 64047 bytes
📝 Extracted 2456 characters from PDF
✅ Saved vector (768 dims).
```

### Step 4: Verify Vector Was Saved

In Supabase SQL Editor:

```sql
SELECT
    id,
    full_name,
    email,
    cv_file_url IS NOT NULL as has_cv,
    vector IS NOT NULL as has_vector,
    array_length(vector, 1) as vector_dimensions
FROM candidate_profiles
WHERE email = 'wazzzaaaa46@gmail.com';
```

**Expected result:**
```
has_cv: true
has_vector: true
vector_dimensions: 768
```

## Troubleshooting

### Error: "No module named 'fitz'"

**Solution:**
```bash
pip install PyMuPDF
```

PyMuPDF provides the `fitz` module for PDF parsing.

### Error: "Failed to parse CV: [Errno 2] No such file or directory"

**This was fixed!** The script now:
1. Flattens the storage path (replaces `/` with `_`)
2. Downloads to: `./downloads/user-id_uuid_filename.pdf`

### Error: "Connection refused" or "Ollama not found"

**Solution:**
```bash
# Make sure Ollama is running
ollama serve

# In another terminal, test:
curl http://localhost:11434/api/embeddings -d '{
  "model": "nomic-embed-text",
  "prompt": "test"
}'
```

### Error: "supabase module not found"

**Solution:**
```bash
pip install supabase
```

### Script Runs But Vector is Still NULL

**Check:**

1. **Ollama model is available:**
   ```bash
   ollama list | grep nomic-embed-text
   ```

2. **Script didn't fail silently:**
   - Look for errors in terminal
   - Check `logs/failed_candidates.jsonl` for failures

3. **Database connection:**
   ```bash
   # Check .env has correct values
   cat .env | grep SUPABASE
   ```

## Complete Flow Verification

### End-to-End Test:

1. **Register new user**:
   ```
   Go to /signup → Enter email/password → Confirm email
   ```

2. **Login**:
   ```
   Go to /login → Enter credentials → Redirects to /profile
   ```

3. **Upload CV**:
   ```
   Fill profile form → Select CV file → Click "Spara ändringar"
   ```

4. **Check Storage**:
   ```sql
   SELECT name, bucket_id, created_at
   FROM storage.objects
   WHERE bucket_id = 'cvs'
   ORDER BY created_at DESC
   LIMIT 5;
   ```

5. **Check Profile**:
   ```sql
   SELECT full_name, email, cv_file_url, vector IS NULL as needs_vectorization
   FROM candidate_profiles
   ORDER BY created_at DESC
   LIMIT 5;
   ```

6. **Run Vectorization**:
   ```bash
   python scripts/generate_candidate_vector.py
   ```

7. **Verify Vector**:
   ```sql
   SELECT
       full_name,
       email,
       vector IS NOT NULL as vectorized,
       array_length(vector, 1) as dims
   FROM candidate_profiles
   WHERE vector IS NOT NULL;
   ```

## What Each Component Does

### Frontend (`/profile` page):
- Collects user data (name, phone, city, street)
- Allows CV file upload
- Sends to `/api/profile`

### API (`/api/profile` route):
1. Authenticates user (checks session)
2. Uploads CV file to Supabase Storage (`cvs` bucket)
3. Saves/updates profile in `candidate_profiles` table
4. Sets `vector = null` (triggers re-vectorization)

### Storage (`cvs` bucket):
- Stores PDF files
- Path: `{user_id}/{uuid}_{filename}.pdf`
- RLS: Users can only access their own files

### Database (`candidate_profiles` table):
- Stores profile data
- Links to `auth.users` via `user_id`
- Contains `vector` column (768 dimensions)
- RLS: Users can only access their own profile

### Vectorization Script (`generate_candidate_vector.py`):
1. Finds profiles where `vector IS NULL`
2. Downloads CV from storage
3. Extracts text from PDF (PyMuPDF)
4. Generates 768-dim embedding (Ollama + nomic-embed-text)
5. Updates `vector` column

## Success Criteria

### ✅ Complete Success Looks Like:

1. User can register and login
2. Header shows user email when logged in
3. User can upload CV without errors
4. Storage shows the file in correct path
5. `candidate_profiles` has the profile data
6. `cv_file_url` points to the uploaded file
7. Vectorization script downloads and parses CV
8. `vector` column contains 768 float values
9. No errors in terminal or browser console

### Current Status:

1. ✅ Registration/Login working
2. ✅ Header fixed (shows email)
3. ✅ CV upload working (storage RLS fixed)
4. ✅ Profile saved to database
5. ⏳ Vectorization: Path issue fixed, needs testing

## Run the Test Now!

```bash
# 1. Install dependencies
pip install -r scripts/requirements.txt

# 2. Make sure Ollama is running
ollama serve

# 3. Run vectorization
python scripts/generate_candidate_vector.py

# Expected: ✅ Saved vector (768 dims).
```

Then check Supabase to verify the vector was saved!
