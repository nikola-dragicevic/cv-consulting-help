# CRITICAL FIX: Vector Dimensions Updated to 768

**Date:** 2025-12-23
**Status:** ✅ FIXED - Ready to apply to database

## 🚨 Issue Found

`nomic-embed-text` produces **768 dimensions**, NOT 1024!

- ❌ Database schema was set to `vector(1024)` (for snowflake-arctic-embed2)
- ❌ All scripts had `DIMS = 1024`
- ❌ Would cause dimension mismatch errors during vectorization

## ✅ Changes Made

### 1. Updated All Scripts
- ✅ `scripts/generate_candidate_vector.py` - DIMS = 768
- ✅ `scripts/enrich_jobs.py` - DIMS = 768
- ✅ `scripts/service.py` - DIMS = 768

### 2. Updated SQL Migrations
- ✅ `supabase/migrations/20251223_fix_matching_functions.sql` - vector(768)
- ✅ Created `supabase/migrations/20251223_update_to_768_dims.sql` - NEW MIGRATION

### 3. Rebuilt Worker
- ✅ Worker now reports: `{"model": "nomic-embed-text", "dims": 768}`

## 📋 Required Actions (IN ORDER!)

### Step 1: Apply Dimension Update Migration (FIRST!)

**Via Supabase Dashboard:**
1. Go to Supabase Dashboard → SQL Editor
2. Paste contents of: `supabase/migrations/20251223_update_to_768_dims.sql`
3. Click "Run"
4. Wait ~2-3 minutes

**What this does:**
```sql
-- Changes vector(1024) → vector(768) for both tables
ALTER TABLE job_ads ALTER COLUMN embedding TYPE vector(768);
ALTER TABLE candidate_profiles ALTER COLUMN profile_vector TYPE vector(768);

-- Resets ALL vectors (required when changing dimensions)
UPDATE job_ads SET embedding = NULL;
UPDATE candidate_profiles SET profile_vector = NULL;

-- Recreates index with new dimensions
CREATE INDEX CONCURRENTLY ... vector(768) ...
```

### Step 2: Apply Location Filtering Fix (SECOND!)

**Via Supabase Dashboard:**
1. Still in SQL Editor
2. Paste contents of: `supabase/migrations/20251223_fix_matching_functions.sql`
3. Click "Run"

**What this does:**
- Recreates `match_jobs_initial()` and `match_jobs_profile_wish()` with vector(768)
- Fixes location filtering with CTE approach

### Step 3: Regenerate All Vectors (ON GPU MACHINE!)

**After both migrations applied:**

```bash
# Pull latest code
git pull origin main

# Rebuild containers (picks up DIMS=768 change)
docker compose up -d --build

# Verify worker is ready
docker exec cv-consulting-worker-1 python -c \
  "import httpx, asyncio; \
   print(asyncio.run(httpx.AsyncClient().get('http://localhost:8000/health')).json())"
# Should show: {"model": "nomic-embed-text", "dims": 768}

# Generate candidate vectors (2 profiles, ~10 seconds)
docker exec cv-consulting-worker-1 python scripts/generate_candidate_vector.py

# Generate job vectors (41,357 jobs, ~30-60 minutes on GPU)
docker exec cv-consulting-worker-1 python scripts/enrich_jobs.py
```

## 🔍 Verification

After regeneration, test:

```bash
node -e "
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function test() {
  const { data: profile } = await supabase
    .from('candidate_profiles')
    .select('profile_vector')
    .eq('email', 'info@jobbnu.se')
    .single();

  console.log('Vector dimensions:', profile.profile_vector.length);
  console.log('Expected: 768');
  console.log('Match:', profile.profile_vector.length === 768 ? 'YES ✅' : 'NO ❌');

  // Test matching
  const { data: jobs } = await supabase.rpc('match_jobs_initial', {
    v_profile: profile.profile_vector,
    u_lat: 59.3293,
    u_lon: 18.0686,
    radius_km: 40,
    top_k: 5
  });

  console.log('\nTop 5 matches:');
  jobs.forEach((j, i) => {
    console.log((i+1) + '. ' + j.headline + ' (' + (j.s_profile * 100).toFixed(1) + '%)');
  });
}

test().catch(console.error);
"
```

Expected output:
```
Vector dimensions: 768
Expected: 768
Match: YES ✅

Top 5 matches:
1. Java Developer Backend (65-75%)
2. Systemutvecklare Java (60-70%)
3. Backend Developer (55-65%)
...
```

## 📊 Technical Details

### Why 768 dimensions?

**nomic-embed-text v1.5:**
- Uses BERT-base architecture
- Standard BERT embedding size: 768
- Context length: 8192 tokens
- Parameters: 137M

**snowflake-arctic-embed2 (old):**
- Custom architecture
- Embedding size: 1024
- Context length: 512 tokens
- Parameters: 560M

### Performance Impact

**Smaller dimensions (768 vs 1024):**
- ✅ **Faster** computation (~25% faster)
- ✅ **Less** storage (~25% reduction)
- ✅ **Lower** memory usage
- ✅ **Better** accuracy (nomic-embed-text is optimized for 768d)

**No quality loss** - the model is designed for 768 dimensions!

## ⚠️ Common Errors

### Error: "expected 1024 dimensions, got 768"
**Solution:** Apply migration Step 1 first!

### Error: "function match_jobs_initial(vector(768)...) does not exist"
**Solution:** Apply migration Step 2!

### Error: "index job_ads_embedding_idx uses wrong dimensions"
**Solution:** Rerun Step 1 migration (it drops and recreates the index)

## 📝 Commit Message

```bash
git add .
git commit -m "Fix critical dimension mismatch: Update to 768 dims for nomic-embed-text

- Update DIMS from 1024 to 768 in all scripts
- Create migration to change vector(1024) → vector(768)
- Update SQL functions to use vector(768)
- Rebuild worker container with correct dimensions

nomic-embed-text v1.5 uses 768 dimensions (BERT-base architecture)
Previous snowflake-arctic-embed2 used 1024 dimensions

This fix prevents 'dimension mismatch' errors during vectorization."

git push origin main
```

---

## 🎯 Summary

**Problem:** nomic-embed-text = 768d, but code/DB expecting 1024d
**Solution:** Updated ALL code and created migration to 768d
**Status:** ✅ Ready to apply (migrations created, code updated, worker rebuilt)
**Next:** Apply 2 migrations → Regenerate vectors on GPU machine
**ETA:** ~30-60 minutes for full vectorization on GPU
