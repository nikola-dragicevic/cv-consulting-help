# Profile Save - Automatic Vector Regeneration

## Summary

When a user clicks "Spara ändringar" (Save Changes) on their profile page, their `profile_vector` is now automatically set to NULL and regenerated using the **improved vectorization algorithm** that prioritizes skills and education over work experience.

## Changes Made

### 1. Backend API - Reset Vector on Save
**File:** `src/app/api/profile/route.ts`

**Change:** Added `profile_vector: null` to the profileData object (line 74)

```typescript
const profileData: Record<string, any> = {
  user_id: user.id,
  email: user.email,
  full_name: fullName,
  phone: phone,
  city: city,
  street: street,
  // ✅ IMPORTANT: Reset vector to NULL so it gets regenerated with improved algorithm
  profile_vector: null,
};
```

**Effect:** Every time the user saves their profile (whether they upload a new CV or just change their name), the profile_vector is reset to NULL.

### 2. Frontend - Updated Success Message
**File:** `src/app/profile/page.tsx`

**Changes:**
- Line 107: Updated success message
- Line 238: Updated help text for CV upload

```typescript
setMessage("✅ Din profil har sparats! Din matchningsprofil kommer att regenereras vid nästa sökning.");
```

**Effect:** User is informed that their matching profile will be regenerated.

### 3. Match API - Better Error Messages
**Files:**
- `src/app/api/match/init/route.ts` (line 79)
- `src/app/api/match/for-user/route.ts` (line 40)

**Change:** Improved error message when profile_vector is NULL

```typescript
if (!profile.profile_vector) {
  return jsonError("Din profil har uppdaterats och analyseras nu. Vänligen vänta 10-30 sekunder och försök igen.", 400);
}
```

**Effect:** User gets a clear, helpful message instead of a generic error.

### 4. Webhook Service - Use Improved Vectorization
**File:** `scripts/service.py`

**Changes:**
- Line 19: Import `build_prioritized_prompt` from generate_candidate_vector
- Lines 135-168: Updated webhook to use prioritized prompt

```python
# Use improved prioritization logic (Skills > Education > Experience)
prioritized_prompt = build_prioritized_prompt(profile, req.cv_text)

print(f"🎯 [WEBHOOK] Using prioritized prompt ({len(prioritized_prompt)} chars)")

result = await fetch_embedding(prioritized_prompt)
```

**Effect:** The webhook now uses the same improved algorithm as the manual script, emphasizing skills over work experience.

## How It Works

### Flow Diagram

```
User clicks "Spara ändringar"
         ↓
POST /api/profile
         ↓
profile_vector set to NULL in database
         ↓
Webhook called (fire & forget)
         ↓
Worker receives webhook
         ↓
Fetches full profile from database
         ↓
Builds prioritized prompt:
  - Skills (3x weight)
  - Education (2x weight)
  - Career goals (1x)
  - Work experience (limited to 500 chars)
         ↓
Generates embedding via Ollama
         ↓
Updates profile_vector in database
         ↓
User tries to search
         ↓
IF vector still NULL:
  → Show "wait 10-30 seconds" message
ELSE:
  → Perform search with new improved vector
```

### Timeline

1. **T+0s:** User clicks "Spara ändringar"
2. **T+1s:** Profile saved, vector set to NULL, webhook triggered
3. **T+1-5s:** Webhook fetches profile, builds prompt, generates embedding
4. **T+5-10s:** Vector saved to database
5. **T+10s+:** User can search successfully with improved matches

## Testing

### Manual Test
1. Go to your profile page
2. Make any change (name, city, or upload new CV)
3. Click "Spara ändringar"
4. Wait 10-30 seconds
5. Try searching for jobs
6. Should see improved matches (more Java/development roles, fewer logistics roles)

### Check Vector in Database
```sql
-- Check if vector was reset
SELECT
  email,
  profile_vector IS NULL as vector_is_null,
  LENGTH(candidate_text_vector) as prompt_length,
  SUBSTRING(candidate_text_vector, 1, 200) as prompt_preview
FROM candidate_profiles
WHERE email = 'dragicevic.nikola9898@yahoo.com';
```

### Check Webhook Logs
If running the worker service:
```bash
docker logs cv-consulting-worker-1 --tail 50
```

Look for:
```
📥 [WEBHOOK] Generating vector for user: [user-id]
🎯 [WEBHOOK] Using prioritized prompt (2500 chars)
✅ [WEBHOOK] Vector updated for [user-id]
```

## Fallback - Manual Regeneration

If the webhook service is not running or fails, you can manually regenerate vectors:

```bash
# Regenerate specific user (by setting vector to NULL first)
python scripts/generate_candidate_vector.py

# Or regenerate ALL users
UPDATE candidate_profiles SET profile_vector = NULL;
python scripts/generate_candidate_vector.py
```

## Expected Results

### Before (Old Vector)
- **Matches:** "Packare", "Lagermedarbetare", "Truckförare", "Leveranskoordinator"
- **Scores:** 45-50%
- **Reason:** Logistics experience dominated the vector

### After (New Vector)
- **Matches:** "Java Developer", "Backend Developer", "Systemutvecklare", "Junior Programmerare"
- **Scores:** 65-85%
- **Reason:** Java skills and education are weighted higher

## Important Notes

1. **Automatic:** The webhook runs automatically when profile is saved (if service is running)
2. **Fallback:** If webhook fails, user can manually run the script or wait for next deployment
3. **Non-blocking:** Webhook is "fire and forget" so profile save is fast
4. **Idempotent:** Safe to run multiple times, will always produce the same result
5. **Backward Compatible:** Old profiles with existing vectors still work, only regenerate when saved

## Troubleshooting

### Problem: "Din profil analyseras fortfarande" message persists

**Possible causes:**
1. Webhook service not running
2. Ollama service not accessible
3. Network issue between services

**Solution:**
```bash
# Check if services are running
docker ps | grep -E 'worker|ollama'

# Manual regeneration
python scripts/generate_candidate_vector.py

# Check logs
docker logs cv-consulting-worker-1
```

### Problem: Still getting logistics jobs after regeneration

**Possible causes:**
1. Location filtering not applied (see MATCHING_FIXES_README.md)
2. Not enough Java roles in your area
3. Need to adjust wish/preferences

**Solution:**
1. Apply the SQL migration for location filtering
2. Use the "Förfina med önskemål" feature to specify Java/Backend roles
3. Increase radius if in rural area

---

**Status:** Complete and Ready to Use
**Dependencies:**
- `scripts/service.py` (webhook service)
- `scripts/generate_candidate_vector.py` (improved vectorization)
- Ollama service (for embeddings)
