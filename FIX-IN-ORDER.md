# Fix Matching System - Run in This Exact Order

## Your User ID
```
d0292a60-bf37-414c-baa7-f63d2dd5f836
```

## ⚠️ IMPORTANT: Run these steps IN ORDER!

---

## STEP 1: Create SQL Function (MUST DO FIRST!)

**Where:** Supabase Dashboard → SQL Editor
**URL:** https://glmmegybqtqqahcbdjvz.supabase.co/project/_/sql/new

**What to do:**
1. Open the file: `/opt/cv-consulting/1-CREATE-FUNCTION-FIRST.sql`
2. Copy ALL the SQL (the entire file)
3. Paste into Supabase SQL Editor
4. Click **"RUN"**

**Expected output:**
```
Success. No rows returned
```

Then you should see a result showing the function was created with 6 arguments.

**Why this first?** The `/api/match/intent` endpoint calls this function. Without it, you get "Failed to fetch matches" error.

---

## STEP 2: Fix Your Occupation Fields

**Where:** Supabase Dashboard → SQL Editor (same place)

**What to do:**
1. Open the file: `/opt/cv-consulting/fix-occupation-fields-CORRECTED.sql`
2. Copy ALL the SQL
3. Paste into Supabase SQL Editor
4. Click **"RUN"**

**Expected output:**
```
-- First SELECT shows your current (wrong) fields
-- UPDATE should say "Success. 1 row updated"
-- Second SELECT shows your new (correct) fields:

primary_occupation_field: {Transport}
occupation_field_candidates: {Transport,"Installation, drift, underhåll","Tekniskt arbete"}
```

**Why?** This changes your classification from "Data/IT" to "Transport/Automation" so you see logistics jobs, not software jobs.

---

## STEP 3: Test the Matching

**Open in browser:**
```
http://localhost:3000/match/results
```

**What you should see:**
- ✅ Three tabs loading
- ✅ Tab 1: Jobs similar to your current role (Control Room Operator, Process Specialist)
- ✅ Tab 2: Career progression jobs (Warehouse Manager, Supply Chain Manager)
- ✅ Tab 3: Related fields (Automation, Operations)

**Expected job types:**
- Lagerchef (Warehouse Manager)
- Driftledare (Operations Manager)
- Transportkoordinator (Transport Coordinator)
- Processoperatör (Process Operator)
- Automationstekniker (Automation Technician)

**Should NOT see:**
- ❌ Software Engineer
- ❌ Game Developer
- ❌ Full Stack Developer

---

## If Still Not Working

### Check 1: Function exists?
Run this in Supabase SQL Editor:
```sql
SELECT proname, pronargs FROM pg_proc
WHERE proname = 'match_jobs_with_occupation_filter';
```

Expected: 1 row with `pronargs = 6`

### Check 2: Occupation fields updated?
```sql
SELECT
  primary_occupation_field,
  occupation_field_candidates
FROM candidate_profiles
WHERE user_id = 'd0292a60-bf37-414c-baa7-f63d2dd5f836';
```

Expected: `primary_occupation_field = {Transport}`

### Check 3: How many jobs in Transport category?
```sql
SELECT
  occupation_field_label,
  COUNT(*) as job_count
FROM job_ads
WHERE occupation_field_label IN ('Transport', 'Installation, drift, underhåll', 'Tekniskt arbete')
  AND removed = false
  AND embedding IS NOT NULL
GROUP BY occupation_field_label;
```

Expected: Should see hundreds or thousands of jobs

### Check 4: API logs
```bash
docker-compose logs -f web | grep -E "match|error"
```

---

## Summary

1. **Step 1:** Create function → Fixes "Failed to fetch matches"
2. **Step 2:** Fix occupation fields → Fixes wrong job categories
3. **Step 3:** Test `/match/results` → Should show correct logistics jobs!

**Time:** 2-3 minutes total

**Files:**
- `/opt/cv-consulting/1-CREATE-FUNCTION-FIRST.sql` (Step 1)
- `/opt/cv-consulting/fix-occupation-fields-CORRECTED.sql` (Step 2)

---

## Why This Works

The matching system works like this:

```
1. Gate by occupation field (Transport, not Data/IT)
   └─ Reduces 50k jobs → 2-5k relevant logistics jobs

2. Filter by location (Stockholm + 50km)
   └─ Further reduces to local jobs

3. Rank by vector similarity
   └─ Your profile_vector vs job embeddings

4. Apply boosts (skills, seniority, distance)
   └─ Final ranking with match %
```

Right now, step 1 is using the wrong occupation field (`Data/IT`), so you're getting software jobs. After the fix, it will use `Transport` and show logistics jobs.

The embeddings and infrastructure are already perfect - it's just a classification issue! 🎯
