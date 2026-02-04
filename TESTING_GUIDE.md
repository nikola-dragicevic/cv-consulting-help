# Testing Guide: Intent-Based Matching System

## ✅ What's Been Fixed

1. **API Route** ([src/app/api/match/intent/route.ts](src/app/api/match/intent/route.ts))
   - ✅ All helper functions added (applyStructuredBoosts, calculateSkillsOverlap, etc.)
   - ✅ Consistent return types (all return buckets)
   - ✅ Error handling for missing vectors
   - ✅ Related occupation fields mapping

2. **Results Page** ([src/app/match/results/page.tsx](src/app/match/results/page.tsx))
   - ✅ Proper TypeScript types
   - ✅ JobList and JobCard components
   - ✅ Loading and error states
   - ✅ Three tabs for multi-track results

3. **SQL Function** ([supabase/migrations/20260204_create_match_function.sql](supabase/migrations/20260204_create_match_function.sql))
   - ✅ Occupation field filtering
   - ✅ Location gating with earth_distance
   - ✅ Vector similarity search
   - ✅ Proper permissions

## 🚀 Next Steps (Do These Now)

### Step 1: Run the SQL Migration

Run this in Supabase SQL Editor or via psql:

```bash
psql $DATABASE_URL -f /opt/cv-consulting/supabase/migrations/20260204_create_match_function.sql
```

**Or via Supabase Dashboard:**
1. Go to SQL Editor
2. Copy contents of `supabase/migrations/20260204_create_match_function.sql`
3. Execute

### Step 2: Restart Python Worker

```bash
docker-compose restart worker
```

Wait for it to fully start (check logs):
```bash
docker-compose logs -f worker
```

You should see: `⚡ Unified Service Starting... Model: nomic-embed-text`

### Step 3: Test the Webhook (Manual Entry)

First, create a test profile via the UI:
1. Go to `/profile`
2. Choose "Fyll i manuellt"
3. Fill in:
   - **Step 0 - Intent**: "Visa flera karriärspår (rekommenderas)"
   - **Seniority**: "Senior"
   - **Current Role**: "Logistikchef på DHL, ansvarig för lagerautomation och WMS-system"
   - **Target Role**: "Supply Chain Manager med fokus på automation och digital transformation"
   - **Skills**: "WMS, WCS, SAP, Python, Excel, PLC-programmering, Lean, Six Sigma"
   - **Education**: "Civilingenjör i Maskinteknik, B-körkort"
4. Save

Check the webhook logs:
```bash
docker-compose logs -f worker | grep WEBHOOK
```

You should see:
```
📥 [WEBHOOK] Generating candidate vector for user: <user_id>
🎯 [WEBHOOK] Manual entry mode - generating persona vectors...
✅ persona_current_vector generated (768 dims)
✅ persona_target_vector generated (768 dims)
✅ profile_vector (combined) generated (768 dims)
✅ [WEBHOOK] Generated 2 persona vectors
✅ [WEBHOOK] Success for <user_id>
```

### Step 4: Verify Vectors in Supabase

Open Supabase Table Editor → `candidate_profiles` → your row

Check these columns are NOT NULL:
- ✅ `persona_current_vector`
- ✅ `persona_target_vector`
- ✅ `profile_vector`
- ✅ `entry_mode` = 'manual_entry'
- ✅ `intent` = 'show_multiple_tracks'

### Step 5: Test the Matching API

Test via curl or directly in the app:

```bash
# Get your access token from browser localStorage or via:
# supabase.auth.getSession()

curl -X POST http://localhost:3000/api/match/intent \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

Expected response:
```json
{
  "intent": "show_multiple_tracks",
  "buckets": {
    "current": [...],  // Jobs matching current role
    "target": [...],   // Jobs matching target role
    "adjacent": [...]  // Related field jobs
  },
  "matchType": "multiple_tracks"
}
```

### Step 6: Test the Results Page

Navigate to `/match/results` in your browser.

You should see:
1. **Three tabs**: "Liknande nuvarande roll", "Karriärutveckling", "Relaterade områden"
2. **Job cards** with:
   - Match percentage badge
   - Company and location
   - Occupation fields
   - Match reasons (e.g., "Skills: WMS, SAP, Python")
3. **Loading state** while fetching
4. **Empty states** if no matches

## 🔍 Troubleshooting

### Issue: "No current role vector available"

**Cause**: Profile doesn't have `persona_current_vector` or `profile_vector`

**Fix**:
1. Check `entry_mode` in database
2. If `manual_entry`, ensure persona fields are filled
3. Re-save profile to trigger webhook
4. Check worker logs for errors

### Issue: "Function match_jobs_with_occupation_filter does not exist"

**Cause**: SQL migration not run

**Fix**: Run Step 1 above

### Issue: Empty results in all tabs

**Cause**:
1. No jobs in database with embeddings
2. Location too restrictive
3. Occupation fields don't match any jobs

**Fix**:
1. Check `job_ads` table has rows with `embedding IS NOT NULL`
2. Update `commute_radius` in profile (default 50km)
3. Check `occupation_field_candidates` vs available job fields

### Issue: Match reasons not showing

**Cause**: `skills_text` empty or no skill overlap

**Fix**: Fill in skills in profile

## ✨ What to Test

### Test Case 1: CV Upload Flow (Original)
1. Create new user
2. Upload CV via `/profile`
3. Check `entry_mode` = 'cv_upload'
4. Check `profile_vector` generated
5. Test matching works

### Test Case 2: Manual Entry - Current Role
1. Fill in current role only
2. Set intent = "match_current_role"
3. Save and trigger webhook
4. Check only "current" bucket has results

### Test Case 3: Manual Entry - Target Role
1. Fill in target role
2. Set intent = "transition_to_target"
3. Should see jobs matching target, not current

### Test Case 4: Manual Entry - Multiple Tracks (Killer Feature!)
1. Fill in BOTH current and target
2. Set intent = "show_multiple_tracks"
3. Should see different jobs in each tab:
   - **Current**: Jobs like your current role
   - **Target**: Career progression jobs
   - **Adjacent**: Related field opportunities

### Test Case 5: Skills Boost
1. Add specific skills: "Python, SAP, WMS"
2. Match to jobs with those keywords in description
3. Should see higher match % for jobs mentioning skills
4. Check "matchReasons" shows "Skills: Python, SAP..."

## 📊 Success Criteria

- ✅ Webhook generates persona vectors for manual entry
- ✅ Webhook generates profile vector for CV upload
- ✅ Matching API returns jobs in correct buckets based on intent
- ✅ Results page displays three tabs with jobs
- ✅ Match percentages and reasons display correctly
- ✅ Skills boost increases match scores
- ✅ Location filtering works (no jobs >50km away)
- ✅ Occupation field filtering reduces noise

## 🎉 When Everything Works

You'll have a revolutionary job matching system where:
1. Users control their career intent (current role vs career switch)
2. Separate vectors for past/current/target capture career transitions
3. Multi-track results show opportunities across different career paths
4. Smart boosting considers skills, location, seniority
5. Transparent "why matched" reasons build trust

This is exactly what the CURRENTPLANOFMOTION.md described!

## 📝 Next Enhancements (After Testing)

1. **Occupation field extraction** from persona text (via worker)
2. **Better related fields** (load from occupation_field_relations.json)
3. **Seniority detection** from job titles
4. **Must-have constraints** (licenses, remote work)
5. **User can pick categories** (for "pick_categories" intent)
6. **Explanation UI** showing why jobs were filtered/ranked
