# Matching System Fix Plan
**Date:** 2026-02-05
**Problem:** Wrong job matches despite good infrastructure
**Goal:** Match Nikola (Control Room Operator) to logistics/automation jobs, NOT software development

---

## 🎯 The Real Problem (Root Cause Analysis)

### Current State
- Infrastructure: ✅ READY (768-dim vectors, indexes built, persona vectors generated)
- Semantic representation: ❌ BROKEN (occupation field extraction is wrong)
- Matching logic: ❌ INCOMPLETE (no hard gating by occupation field)

### Why Matches Are Wrong
1. **Occupation Field Misclassification**
   - Nikola is classified as `primary_occupation_field = ["Data/IT"]`
   - **Why?** Category tagger sees: SQL, Python, WMS, automation keywords
   - **Should be:** "Transport", "Installation, drift, underhåll", "Industriell tillverkning"

2. **No Hard Gating**
   - Current matching doesn't enforce occupation field filtering
   - Pure semantic similarity matches keywords across ALL fields
   - Result: "Game Developer" matches because of technical keywords

3. **Wrong Persona Vector Used**
   - Intent is "transition_to_target"
   - Should use `persona_target_vector` to match target roles
   - But occupation fields are wrong, so still matches wrong jobs

---

## ✅ The Solution (3-Stage Pipeline)

### Stage 1: Hard Gate by Occupation Field (CRITICAL)
**Before any semantic matching**, reduce the job universe:

```
50,000 jobs → Filter by occupation_field_label → 2,000-5,000 relevant jobs
```

**Rules:**
- ONLY consider jobs from candidate's occupation fields
- For Nikola: "Transport", "Installation, drift, underhåll", "Industriell tillverkning"
- NO "Data/IT" jobs unless that's genuinely their field

**Impact:** Eliminates 95% of wrong matches immediately

### Stage 2: Semantic Ranking (Within Gate)
Inside the gated job universe, rank by:
- **75%** Cosine similarity (persona_target_vector <=> job.embedding)
- **10%** Occupation group match bonus
- **10%** Skills/keyword overlap
- **5%** Seniority level match
- **-10%** Distance penalty (if far away)

**Impact:** Ranks relevant jobs by true relevance

### Stage 3: Structured Boosts & Explanation
- Boost jobs with matching job titles ("Process Specialist", "Control Room Operator")
- Boost jobs mentioning key skills ("WMS", "warehouse automation", "incident management")
- Generate match reasons: "Matched because: WMS, automation, logistics, incident management"

---

## 🔧 Implementation Steps

### STEP 1: Fix Occupation Field Extraction (30 min)
**Problem:** Category tagger prioritizes "Data/IT" over everything

**Fix:** Update category scoring logic to prevent IT hijacking

```python
# In scripts/generate_candidate_vector.py

# Current (WRONG):
if "Software Development" in tags or "IT" in tags:
    return ["Data/IT"]  # IT always wins

# New (CORRECT):
# Score each occupation field by evidence
scores = {
    "Transport": 0,
    "Data/IT": 0,
    "Tekniskt arbete": 0,
    # ...
}

# +3 for job title match
if "transportledare" in job_titles or "logistik" in job_titles:
    scores["Transport"] += 3

# +2 for occupation_label match (from past roles)
if "automation" in role_descriptions:
    scores["Installation, drift, underhåll"] += 2
    scores["Industriell tillverkning"] += 2

# +1 for skills match
if "WMS" in skills or "warehouse" in skills:
    scores["Transport"] += 1

# +1 for IT skills BUT ONLY IF no stronger signal
if "Python" in skills and max(scores.values()) == 0:
    scores["Data/IT"] += 1

# Return TOP 2-3 fields
return sorted(scores.items(), key=lambda x: -x[1])[:3]
```

**Test:** Nikola should get `["Transport", "Installation, drift, underhåll", "Industriell tillverkning"]`

### STEP 2: Add Hard Gating to Matching API (20 min)
Update `/api/match/intent/route.ts`:

```typescript
async function matchTargetRole(profile: any, supabase: any) {
  const vector = profile.persona_target_vector;

  // CRITICAL: Get correct occupation fields
  const occupationFields = profile.occupation_field_candidates ||
                          profile.primary_occupation_field || [];

  if (!occupationFields.length) {
    throw new Error("No occupation fields defined. Cannot match.");
  }

  // Hard gate: ONLY jobs from these fields
  const { data: jobs } = await supabase.rpc("match_jobs_with_occupation_filter", {
    candidate_vector: vector,
    candidate_lat: profile.location_lat,
    candidate_lon: profile.location_lon,
    radius_m: profile.commute_radius || 50000,
    occupation_fields: occupationFields,  // 🔒 HARD FILTER
    limit_count: 100
  });

  // ...
}
```

**Test:** Should only return Transport/Automation/Industrial jobs

### STEP 3: Manual Fix for Nikola (Immediate)
Run this SQL NOW to test with correct fields:

```sql
UPDATE candidate_profiles
SET
  primary_occupation_field = ARRAY['Transport', 'Installation, drift, underhåll'],
  occupation_field_candidates = ARRAY['Transport', 'Installation, drift, underhåll', 'Industriell tillverkning']
WHERE email = 'wazzzaaaa46@gmail.com';
```

Then refresh `/match/results`.

**Expected:** Should see:
- ✅ Warehouse automation roles
- ✅ Logistics coordinator positions
- ✅ Process control specialist jobs
- ✅ Automation technician roles
- ❌ NO software development
- ❌ NO game development

### STEP 4: Add Job Title Matching (15 min)
Boost jobs with similar titles:

```typescript
function jobMatchesSeniority(job: any, profile: any): number {
  const profileTitles = [
    profile.persona_current_text,
    profile.persona_target_text
  ].filter(Boolean).join(" ").toLowerCase();

  const jobTitle = (job.title || "").toLowerCase();

  // Exact role match
  if (profileTitles.includes("control room") && jobTitle.includes("control")) return 0.15;
  if (profileTitles.includes("process specialist") && jobTitle.includes("process")) return 0.15;
  if (profileTitles.includes("automation") && jobTitle.includes("automation")) return 0.10;
  if (profileTitles.includes("logistics") && jobTitle.includes("logistik")) return 0.10;
  if (profileTitles.includes("technician") && jobTitle.includes("tekniker")) return 0.08;

  return 0;
}
```

### STEP 5: Show Match Explanation (10 min)
Add to match reasons:

```typescript
function generateMatchReasons(job: any, profile: any): string[] {
  const reasons = [];

  // Occupation field match
  if (profile.occupation_field_candidates?.includes(job.occupation_field_label)) {
    reasons.push(`Correct field: ${job.occupation_field_label}`);
  }

  // Skills overlap
  const skills = (profile.skills_text || "").toLowerCase();
  const desc = (job.description || "").toLowerCase();

  if (skills.includes("wms") && desc.includes("wms")) reasons.push("WMS experience");
  if (skills.includes("automation") && desc.includes("automation")) reasons.push("Automation");
  if (skills.includes("warehouse") && desc.includes("lager")) reasons.push("Warehouse ops");

  // Location
  if (job.distance_m < 20000) {
    reasons.push(`Near you: ${(job.distance_m/1000).toFixed(0)}km`);
  }

  return reasons;
}
```

---

## 🧪 Testing Plan

### Test 1: Nikola's Profile (Control Room Operator)
**Setup:**
```sql
-- Set correct occupation fields
UPDATE candidate_profiles
SET occupation_field_candidates = ARRAY['Transport', 'Installation, drift, underhåll', 'Industriell tillverkning']
WHERE email = 'wazzzaaaa46@gmail.com';
```

**Expected Results:**
| Match | Score | Why |
|-------|-------|-----|
| ✅ Lagerchef (Warehouse Manager) | 85% | Transport + WMS + management |
| ✅ Processtekniker (Process Technician) | 82% | Automation + process + technical |
| ✅ Automation tekniker | 80% | Direct role match |
| ✅ Driftledare lager | 78% | Logistics + operations |
| ❌ Senior Software Engineer | 0% | Filtered out (Data/IT field) |
| ❌ Game Developer | 0% | Filtered out (Data/IT field) |

### Test 2: Pure Software Developer
**Setup:** Create test profile with:
- Current: "Frontend Developer at Spotify"
- Target: "Senior React Developer"
- Skills: "React, TypeScript, Next.js"

**Expected:** Should get ONLY "Data/IT" jobs

### Test 3: Career Switcher (Nurse → Doctor)
**Setup:**
- Current: "Nurse at Karolinska"
- Target: "Junior Doctor"
- Education: "Medical degree completed"

**Expected:**
- Use `persona_target_vector` (not current)
- Filter to "Hälso- och sjukvård" field
- Show doctor roles, not nursing roles

---

## 📊 Success Metrics

### Before Fix
- Top 10 matches: 7/10 are Data/IT (WRONG)
- User satisfaction: "These matches are completely wrong"
- Precision: ~30%

### After Fix (Target)
- Top 10 matches: 9/10 are correct occupation field
- Match reasons are explainable
- Precision: ~80%

---

## 🚀 Implementation Order

1. **NOW:** Run manual SQL fix for Nikola → Test immediately
2. **Phase 1 (1 hour):** Fix occupation field scoring logic
3. **Phase 2 (30 min):** Add hard gating to matching API
4. **Phase 3 (30 min):** Add job title boost & match explanations
5. **Phase 4 (30 min):** Regenerate all candidate occupation fields with new logic

**Total time:** ~3 hours to completely fix matching

---

## 💡 Key Insights

1. **Infrastructure was never the problem** - Embeddings, indexes, vectors all work perfectly
2. **The bug is in occupation field extraction** - IT hijacks everything with tech keywords
3. **Hard gating is non-negotiable** - Must filter BEFORE semantic matching
4. **Match explanation builds trust** - Show WHY each job matched

---

## 🎯 The Vision

**What users should experience:**
1. Upload CV or fill manual entry
2. System correctly identifies: "You're in Transport/Logistics/Automation"
3. Shows 3 tabs:
   - **Similar to current:** Control room operator, process specialist roles
   - **Career progression:** Senior process specialist, warehouse manager
   - **Adjacent:** Automation technician, logistics coordinator

**NO MORE:**
- ❌ Random software development jobs
- ❌ Game programming roles
- ❌ Senior architect positions for juniors
- ❌ "Why am I seeing this?" confusion
