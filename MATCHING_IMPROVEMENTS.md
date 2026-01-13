# Matching System Improvements - Deployment Guide

## Overview

This document describes the improvements made to the job matching system to ensure candidates only see jobs in their correct occupation field.

## Problem Statement

**Before:** Candidates were receiving matches across multiple unrelated fields:
- Software developers seeing HR, construction, and management roles
- Cross-domain matches due to semantic similarity (e.g., "Project Manager in IT" vs "Project Manager in Construction")
- Category tags were too broad and permissive

**After:** Hard occupation field filtering ensures candidates only see jobs in their primary field:
- Software developers ONLY see "Data/IT" jobs
- Healthcare workers ONLY see "Hälso- och sjukvård" jobs
- No more cross-domain pollution

---

## Changes Made

### 1. Database Changes ✅ COMPLETED

**Added column:**
```sql
ALTER TABLE candidate_profiles
ADD COLUMN primary_occupation_field TEXT;
```

**Status:** ✅ Already applied to your database

### 2. Backfill Script ✅ COMPLETED

**Created:** `/opt/cv-consulting/scripts/backfill_primary_occupation_field.py`

**What it does:**
- Maps candidate `category_tags` to official occupation fields
- Uses intelligent priority system (e.g., "Software Development" → "Data/IT")
- Automatically populates `primary_occupation_field` for all candidates

**Status:** ✅ Already run (5/6 candidates updated)

**Mapping logic:**
- IT + Software Development → "Data/IT"
- Engineering / Tech → "Tekniskt arbete"
- Automation / Industrial → "Industriell tillverkning"
- Construction → "Bygg och anläggning"
- Healthcare → "Hälso- och sjukvård"
- etc.

### 3. SQL Functions ✅ UPDATED (Needs Deployment)

**Updated:** `/opt/cv-consulting/scripts/match_jobs.sql`

**Changes:**
1. Added `filter_occupation_field` parameter to `match_jobs_initial()`
2. Added `filter_occupation_field` parameter to `match_jobs_profile_wish()`
3. Added hard WHERE clause filter:
   ```sql
   AND (
     filter_occupation_field IS NULL
     OR j.occupation_field_label = filter_occupation_field
   )
   ```

**Status:** ⚠️ **NEEDS TO BE APPLIED TO DATABASE**

### 4. API Routes ✅ UPDATED

**Updated files:**
- `/opt/cv-consulting/src/app/api/match/init/route.ts`
- `/opt/cv-consulting/src/app/api/match/refine/route.ts`

**Changes:**
- Fetch `primary_occupation_field` from candidate profile
- Pass it to SQL RPC functions as `filter_occupation_field`
- Log occupation field for debugging

**Status:** ✅ Code updated (will take effect after restart)

### 5. Candidate Vector Generation ✅ UPDATED

**Updated:** `/opt/cv-consulting/scripts/generate_candidate_vector.py`

**Changes:**
- Added `compute_primary_occupation_field()` function
- Automatically computes and saves `primary_occupation_field` when processing new CVs
- Future candidates will have this field set automatically

**Status:** ✅ Code updated in worker container

---

## Deployment Steps

### Step 1: Apply SQL Changes to Database ⚠️ REQUIRED

You need to apply the updated SQL functions to your Supabase database.

**Option A: Via Supabase Dashboard (Recommended)**

1. Open your Supabase dashboard: https://app.supabase.com/project/[your-project]
2. Go to: **SQL Editor**
3. Copy the entire content of `/opt/cv-consulting/scripts/match_jobs.sql`
4. Paste it into the SQL editor
5. Click **Run** or press `Ctrl+Enter`
6. Verify: You should see "Success. No rows returned"

**Option B: Via psql Command Line**

```bash
# Get your database connection string from Supabase dashboard
# Settings → Database → Connection string → Connection pooling

psql "postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres" \
  -f /opt/cv-consulting/scripts/match_jobs.sql
```

**Option C: Via Supabase CLI**

```bash
supabase db execute -f scripts/match_jobs.sql
```

### Step 2: Restart Your Application

After applying the SQL changes, restart your Docker containers to load the updated API code:

```bash
docker compose restart web
```

### Step 3: Test the Matching System

1. Log in to your application with a test user
2. Upload a CV (or use existing user with CV)
3. Click "Hitta matchningar" (Find matches)
4. **Expected behavior:**
   - Console should log: `Using stored profile vector + category tags + occupation field: 'Data/IT'`
   - All matched jobs should have `occupation_field_label = 'Data/IT'` (or your user's field)
   - NO cross-domain jobs should appear

### Step 4: Verify Database (Optional)

Check that the filters are working:

```sql
-- Check a candidate's occupation field
SELECT
  email,
  primary_occupation_field,
  category_tags
FROM candidate_profiles
WHERE email = 'your-test-email@example.com';

-- Check job distribution by occupation field
SELECT
  occupation_field_label,
  COUNT(*) as job_count
FROM job_ads
WHERE is_active = true
GROUP BY occupation_field_label
ORDER BY job_count DESC;

-- Test the matching function manually
SELECT * FROM match_jobs_initial(
  v_profile := (SELECT profile_vector FROM candidate_profiles WHERE email = 'test@example.com'),
  u_lat := 59.3293,
  u_lon := 18.0686,
  radius_km := 50,
  top_k := 10,
  candidate_tags := ARRAY['IT', 'Software Development'],
  filter_occupation_field := 'Data/IT'
);
```

---

## Architecture Explanation

### Multi-Level Filtering Strategy

Your matching system now uses **3 levels of filtering**:

#### Level 1: Hard Occupation Field Filter (NEW) 🎯
```sql
WHERE j.occupation_field_label = candidate.primary_occupation_field
```
- **Purpose:** Prevents cross-domain matches
- **Example:** Software developer with "Data/IT" → ONLY sees "Data/IT" jobs
- **When:** Always applied (unless NULL for backward compatibility)

#### Level 2: Category Tags (Soft Gate) 🏷️
```sql
WHERE j.category_tags && candidate.category_tags
```
- **Purpose:** Further refines within the occupation field
- **Example:** "Data/IT" candidate with ["Software Development", "Backend"] → prioritizes backend jobs
- **When:** Applied if both candidate and job have tags

#### Level 3: Vector Similarity (Ranking) 📊
```sql
ORDER BY (1 - (j.embedding <=> v_profile)) DESC
```
- **Purpose:** Ranks matches within filtered subset
- **Example:** Among "Data/IT" backend jobs, ranks by semantic similarity to CV
- **When:** Always applied for final ranking

### Flow Diagram

```
User uploads CV
    ↓
[generate_candidate_vector.py]
    ↓
Computes:
  - profile_vector (768-dim embedding)
  - category_tags (["IT", "Software Development"])
  - primary_occupation_field ("Data/IT")  ← NEW
    ↓
User clicks "Find Matches"
    ↓
[/api/match/init]
    ↓
Calls: match_jobs_initial(
  v_profile,
  lat/lon,
  radius,
  top_k,
  category_tags,
  filter_occupation_field: "Data/IT"  ← NEW
)
    ↓
SQL WHERE clause:
  1. is_active = true
  2. application_deadline not expired
  3. occupation_field_label = "Data/IT"  ← NEW HARD FILTER
  4. category_tags overlap (soft gate)
  5. within geographic radius
    ↓
ORDER BY vector similarity
    ↓
Return top 20 matches
    ↓
User refines with preferences
    ↓
[/api/match/refine]
    ↓
Same hard filter applied with wish_vector
    ↓
Return top 50 refined matches
```

---

## Maintenance

### Future Candidate Onboarding

New candidates will automatically have `primary_occupation_field` computed when:
1. They upload a CV
2. `generate_candidate_vector.py` runs
3. Category tags are computed from CV text
4. Primary occupation field is derived from tags

**No manual intervention needed!**

### Re-backfill if Needed

If you need to recompute occupation fields (e.g., after changing category mappings):

```bash
# Force rebuild all candidates
docker compose exec worker python scripts/backfill_primary_occupation_field.py

# Or set environment variable
FORCE_REBUILD_OCCUPATION_FIELD=1 docker compose exec worker \
  python scripts/backfill_primary_occupation_field.py
```

### Monitoring

Check for candidates missing occupation field:

```sql
SELECT
  email,
  category_tags,
  primary_occupation_field
FROM candidate_profiles
WHERE primary_occupation_field IS NULL
  AND category_tags IS NOT NULL;
```

---

## Rollback Plan

If you need to revert these changes:

1. **Remove occupation field filter from API:**
   ```typescript
   // In init/route.ts and refine/route.ts
   // Comment out or remove: filter_occupation_field: primaryOccupationField
   ```

2. **Use old SQL functions:**
   ```sql
   -- Copy backup from git history
   git checkout HEAD~1 scripts/match_jobs.sql
   -- Apply to database
   ```

3. **Restart:**
   ```bash
   docker compose restart web
   ```

---

## Expected Results

### Before Implementation

**User: Software Developer**
- Matched jobs: Lead Data Engineer (✅), HR Business Partner (❌), Category Manager (❌), Electrical Engineer (❌), etc.
- **78-84% match scores across unrelated fields**

### After Implementation

**User: Software Developer**
- Matched jobs: ALL from "Data/IT" field only
- Backend Developer, Data Engineer, DevOps Engineer, Software Architect, etc.
- **80-95% match scores within correct field**

---

## Troubleshooting

### Issue: No matches found after applying filter

**Cause:** Candidate's `primary_occupation_field` doesn't match any job's `occupation_field_label`

**Solution:**
1. Check candidate's field:
   ```sql
   SELECT primary_occupation_field FROM candidate_profiles WHERE email = 'user@example.com';
   ```
2. Check available job fields:
   ```sql
   SELECT DISTINCT occupation_field_label FROM job_ads WHERE is_active = true;
   ```
3. Verify mapping in `backfill_primary_occupation_field.py` is correct

### Issue: Still seeing cross-domain matches

**Possible causes:**
1. SQL not applied → Go to Step 1 and apply `match_jobs.sql`
2. API not passing field → Check logs for "Using stored profile vector + category tags + occupation field"
3. Field is NULL → Run backfill script again

### Issue: Console shows "occupation field: null"

**Cause:** Candidate doesn't have `primary_occupation_field` set

**Solution:**
```bash
docker compose exec worker python scripts/backfill_primary_occupation_field.py
```

---

## Questions?

If you encounter any issues during deployment:

1. Check logs: `docker compose logs -f web worker`
2. Verify SQL was applied successfully in Supabase dashboard
3. Test with a known candidate email address
4. Check that `primary_occupation_field` column exists and is populated

---

**Status Summary:**
- ✅ Database column added
- ✅ Backfill script created and run
- ✅ SQL functions updated
- ✅ API routes updated
- ✅ Candidate vector generation updated
- ⚠️ **ACTION REQUIRED:** Apply SQL to database
- ⚠️ **ACTION REQUIRED:** Restart application
- ⚠️ **ACTION REQUIRED:** Test matching system

**Next Steps:** Follow "Deployment Steps" above!
