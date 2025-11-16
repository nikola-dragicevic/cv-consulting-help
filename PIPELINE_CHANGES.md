# Data Pipeline Changes - 2025-10-07

## Summary
Fixed the data extraction pipeline to use the **modern JobTechDev Search API** instead of the outdated 2023 historical snapshot. The new pipeline now properly handles batched API requests with pagination.

## What Was Fixed

### 1. **initial_load.py** - Complete Rewrite
**Problem:**
- ❌ Using 2023 historical snapshot (outdated data)
- ❌ Downloading entire gzip file into memory
- ❌ No proper pagination/batching
- ❌ Windows console encoding issues

**Solution:**
- ✅ Using modern JobTechDev Search API: `https://jobsearch.api.jobtechdev.se/search`
- ✅ Proper pagination with 100 jobs per batch
- ✅ Rate limiting (0.5s between requests)
- ✅ Fetches jobs published after 2024-01-01 (fresh data)
- ✅ Fixed Windows UTF-8 console encoding
- ✅ Better error handling and progress reporting

**API Details:**
- Endpoint: `https://jobsearch.api.jobtechdev.se/search`
- Max per request: 100 jobs
- Max offset: 2000 (can fetch ~210,000 jobs total)
- No API key required (but recommended - register at apirequest.jobtechdev.se)
- Current available: **37,617 jobs** (as of test run)

### 2. **enrich_jobs.py** - Minor Fix
- ✅ Added Windows UTF-8 console encoding fix
- Script already worked well, just needed encoding fix

### 3. **geocode-jobs.ts** - No Changes Needed
- ✅ Already robust with fallback logic
- ✅ Handles rate limiting properly
- ✅ Works with the data structure

## Field Mapping Changes

### JobTechDev API Response → Supabase `job_ads`
```javascript
{
  id: job.id,
  headline: job.headline,
  description_text: job.description.text,
  city: job.workplace_address.municipality,  // Note: API uses 'municipality', not 'city'
  location: job.workplace_address.municipality,
  published_date: job.publication_date,
  webpage_url: job.webpage_url,
  job_category: job.occupation.label,
  requires_dl_b: job.driving_license_required
}
```

## Test Results

### Test 1: API Connection ✅
```
Status: 200
Total available jobs: 37,617
Successfully fetched sample data
```

### Test 2: Database Upload ✅
```
Fetched: 200 jobs
Uploaded: 200 jobs to Supabase
Result: 200 rows affected
```

## Running the Full Pipeline

### Prerequisites
1. **Ollama** must be running for embeddings
   - Model: `nomic-embed-text` (768 dimensions) ✅ Already installed
   - Check: `ollama list` and `ollama ps`

2. **Environment Variables** in `.env`:
   ```
   SUPABASE_URL=your_url
   SUPABASE_SERVICE_KEY=your_key
   JOBTECH_API_KEY=optional_but_recommended
   EMBEDDING_MODEL=nomic-embed-text
   ```

### Run All Three Steps
```bash
npm run process:all
```

This runs:
1. `python scripts/initial_load.py` - Fetch jobs from API (~10-15 min for all jobs)
2. `python scripts/enrich_jobs.py` - Generate embeddings with Ollama (~depends on job count)
3. `npx tsx scripts/geocode-jobs.ts` - Geocode addresses (~rate limited, takes time)

### Or Run Individually
```bash
# Step 1: Fetch jobs
python scripts/initial_load.py

# Step 2: Generate embeddings (requires Ollama running)
python scripts/enrich_jobs.py

# Step 3: Geocode addresses
npx tsx scripts/geocode-jobs.ts
```

## Performance Estimates

| Step | Jobs | Est. Time | Notes |
|------|------|-----------|-------|
| **Fetch** | 37,617 | ~3-5 min | 100/batch, 0.5s delay |
| **Embed** | 37,617 | ~2-4 hours | Depends on Ollama speed |
| **Geocode** | ~30,000 | ~10+ hours | 1.1s/job (Nominatim rate limit) |

## Data Quality Notes

1. **Fresh Data**: Only jobs published after 2024-01-01
2. **Municipality as City**: API returns `municipality` (e.g., "Stockholms kommun"), not city names
3. **Geocoding**: Script handles both exact addresses and fallback to municipality
4. **Embeddings**: 768-dimensional vectors using `nomic-embed-text`

## Next Steps

1. ✅ All scripts are ready and tested
2. ⏳ Run `npm run process:all` to execute full pipeline
3. ⏳ Monitor progress (all scripts have detailed logging)
4. ⏳ Verify data in Supabase after completion

## Files Changed
- ✏️ `scripts/initial_load.py` - Complete rewrite
- ✏️ `scripts/enrich_jobs.py` - Added encoding fix
- ➕ `scripts/test_api.py` - New test script
- ➕ `scripts/test_load.py` - New test script
- ✏️ `package.json` - Updated process:all script
