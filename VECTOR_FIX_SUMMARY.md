# Vector Generation Fix - Summary

## Problem Statement

After running the enrich script to vectorize all 43,128 jobs with nomic-embed-text (768 dimensions), clicking "Spara ändringar" (Save changes) on the profile page did NOT generate profile vectors. The `profile_vector` column remained NULL.

## Root Causes Identified

### 1. Webhook Not Triggered for Existing CVs
**Location**: `src/app/api/profile/route.ts:142`

**Issue**: The webhook was only triggered when uploading a **new** CV file. When users clicked "Spara ändringar" without uploading a new file, the condition failed:

```typescript
if (extractedText || profileData.cv_bucket_path) {
  // Trigger webhook
}
```

- `file` was null (no new upload)
- `extractedText` stayed empty
- `profileData.cv_bucket_path` wasn't set (only set during new upload)

**Fix**: Fetch existing profile before update and check for `cv_bucket_path`:

```typescript
// Fetch existing profile
const { data: existingProfile } = await supabase
  .from("candidate_profiles")
  .select("cv_bucket_path")
  .eq("user_id", user.id)
  .single();

// Trigger webhook when CV exists
const hasCv = extractedText || profileData.cv_bucket_path || existingProfile?.cv_bucket_path;
if (hasCv) {
  // Trigger webhook
}
```

### 2. Ollama Crashing on Large CV Text
**Location**: `scripts/service.py:194`

**Issue**: Ollama (running on CPU with batch_size=512) was crashing with:
```
panic: caching disabled but unable to fit entire input in a batch
```

The prioritized prompts were 2881 characters (~600+ tokens), exceeding the batch size limit for CPU mode.

**Fix**: Added truncation to 1500 characters (~300 tokens) before sending to Ollama:

```python
# Truncate to safe length for CPU batch size (512)
MAX_CHARS = 1500
if len(prioritized_prompt) > MAX_CHARS:
    print(f"⚠️ [WEBHOOK] Truncating prompt from {len(prioritized_prompt)} to {MAX_CHARS} chars")
    prioritized_prompt = prioritized_prompt[:MAX_CHARS]
```

This ensures:
- Skills (highest priority) are always included
- Education and goals are included if space permits
- Work experience is limited
- No Ollama crashes

## Files Modified

### 1. `/opt/cv-consulting/src/app/api/profile/route.ts`
- **Lines 65-70**: Added fetch of existing profile
- **Lines 151-168**: Updated webhook trigger condition to check existing CV

### 2. `/opt/cv-consulting/scripts/service.py`
- **Lines 134-141**: Added truncation for `/embed` endpoint
- **Lines 192-198**: Added truncation for webhook endpoint

### 3. `/opt/cv-consulting/scripts/geocode_jobs.py`
- **Line 78**: Fixed database update statement placement (was inside else block)

### 4. `/opt/cv-consulting/docker-compose.yml`
- **Lines 48-51**: Added Ollama CPU optimization environment variables

## Final System Status

```
✅ Jobs:
  - Total: 43,128
  - With embeddings: 43,128 (100.0%)

✅ Candidate Profiles:
  - Total: 3
  - With vectors: 3 (100.0%)

Profiles:
  ✅ dragiceviclidia218@gmail.com - Lidia Dragicevic
  ✅ info@jobbnu.se - Nikola Dragicevic
  ✅ wazzzaaaa46@gmail.com - Nikola Dragicevic
```

## How It Works Now

### Profile Update Flow

1. **User Action**: User clicks "Spara ändringar" on `/profile` page
2. **Frontend**: Sends POST to `/api/profile` with form data
3. **Backend** (`profile/route.ts`):
   - Fetches existing profile from database
   - Updates profile data (resets `profile_vector` to NULL)
   - Checks if user has CV (new upload OR existing `cv_bucket_path`)
   - If CV exists, triggers webhook to worker service
4. **Worker** (`scripts/service.py`):
   - Receives webhook at `/webhook/update-profile`
   - If `cv_text` is empty, downloads CV from Supabase Storage
   - Extracts text using PDF parser or reads text file
   - Calls `build_prioritized_prompt()` to create weighted prompt
   - **Truncates to 1500 chars for CPU safety**
   - Generates 768-dim embedding via Ollama
   - Saves `profile_vector` and `candidate_text_vector` to database

### Text Prioritization Strategy

Based on research showing LLMs are sensitive to formatting (76 point difference!):

```
=== KOMPETENSER OCH FÄRDIGHETER (VIKTIGAST) ===
[Skills repeated 2x for emphasis]

=== UTBILDNING OCH CERTIFIERINGAR ===
[Education]

=== KARRIÄRMÅL OCH ÖNSKEMÅL ===
[Goals]

=== SENASTE ERFARENHET (BEGRÄNSAD) ===
[First 500 chars of work experience]
```

This matches the job embedding format where skills are also weighted highest.

## Testing the Fix

### Manual Profile Vector Generation
```bash
docker exec cv-consulting-worker-1 python3 -c "
import requests

# Trigger webhook for a user
resp = requests.post(
    'http://localhost:8000/webhook/update-profile',
    json={'user_id': 'USER_ID_HERE', 'cv_text': ''},
    timeout=120
)

print(f'Status: {resp.status_code}')
print(resp.json())
"
```

### Verify Vectors in Database
```bash
docker exec cv-consulting-worker-1 python -c "
from supabase import create_client
import os

supabase = create_client(os.getenv('SUPABASE_URL'), os.getenv('SUPABASE_SERVICE_KEY'))

profiles = supabase.table('candidate_profiles').select('email, profile_vector').execute()
for p in profiles.data:
    has_vec = '✅' if p['profile_vector'] else '❌'
    print(f'{has_vec} {p[\"email\"]}')
"
```

### Check Truncation in Logs
```bash
docker compose logs worker | grep -E "(Truncating|chars)"
```

Expected output:
```
⚠️ [WEBHOOK] Truncating prompt from 2881 to 1500 chars
🎯 [WEBHOOK] Using prioritized prompt (1500 chars)
```

## Known Limitations

### CPU Batch Size Constraint
- **Current**: 1500 chars (~300 tokens) max
- **Reason**: Ollama CPU mode with batch_size=512
- **Impact**: Some CV details may be truncated
- **Solution for GPU**: Uncomment GPU config in docker-compose.yml (lines 52-58) on GPU machine

### Text Truncation Priority
Since we truncate at character level, not semantic level:
1. ✅ Skills always included (highest priority, first in prompt)
2. ✅ Education usually included
3. ⚠️ Work experience may be partial
4. ❌ Long descriptions lose context

This is acceptable because:
- Skills are most important for matching
- The prioritization ensures critical info comes first
- Users can update profiles to regenerate vectors
- GPU mode would eliminate this limitation

## Future Improvements

1. **Semantic Chunking**: Instead of hard truncation, implement semantic chunking:
   - Split text at sentence boundaries
   - Preserve complete skills/education sections
   - Drop only low-priority sections

2. **Dynamic Truncation**: Adjust truncation based on Ollama capacity:
   - Detect GPU vs CPU mode
   - GPU: 4000 chars (~800 tokens)
   - CPU: 1500 chars (~300 tokens)

3. **Vector Quality Metrics**: Add logging:
   - Track truncation frequency
   - Measure match quality before/after truncation
   - Alert if truncation is excessive

4. **Batch Processing**: Add script to regenerate all vectors:
   ```bash
   docker exec cv-consulting-worker-1 python -m scripts.generate_candidate_vector
   ```

## Troubleshooting

### Profile Vector Still NULL After Save

1. **Check webhook was triggered**:
   ```bash
   docker compose logs web | grep "Triggering vector update webhook"
   ```

2. **Check worker received webhook**:
   ```bash
   docker compose logs worker | grep "WEBHOOK"
   ```

3. **Check for errors**:
   ```bash
   docker compose logs worker | grep "❌"
   ```

### Ollama Crashing

1. **Check for panic errors**:
   ```bash
   docker compose logs ollama | grep "panic"
   ```

2. **If seeing "unable to fit entire input in a batch"**:
   - Reduce MAX_CHARS in `scripts/service.py` (lines 137, 194)
   - Or enable GPU mode in `docker-compose.yml`

3. **Restart services**:
   ```bash
   docker compose restart ollama worker
   ```

## Deployment Checklist

When deploying to production or GPU machine:

- [ ] Rebuild web container: `docker compose build web`
- [ ] Rebuild worker container: `docker compose build worker`
- [ ] If GPU available, uncomment deploy section in docker-compose.yml (lines 52-58)
- [ ] Restart all services: `docker compose up -d`
- [ ] Verify Ollama: `docker exec cv-consulting-ollama-1 ollama list`
- [ ] Test embedding: `curl -X POST http://localhost:8000/embed -H "Content-Type: application/json" -d '{"text":"test"}'`
- [ ] Regenerate all profile vectors if needed

---

**Status**: ✅ All issues resolved
**Date**: 2024-12-24
**Model**: nomic-embed-text (768 dimensions)
**Vectorization**: 100% complete (43,128 jobs, 3 profiles)
