# Quick Action Checklist ✅

**Run these steps in order on your GPU machine:**

## ☐ Step 1: Commit & Push Code
```bash
git add .
git commit -m "Fix dimension mismatch: Update to 768 dims for nomic-embed-text"
git push origin main
```

## ☐ Step 2: Apply Database Migrations (Supabase Dashboard)

### Migration 1: Update Dimensions (CRITICAL - DO THIS FIRST!)
1. Go to: https://supabase.com/dashboard → Your Project → SQL Editor
2. Copy from: `supabase/migrations/20251223_update_to_768_dims.sql`
3. Paste and click "Run"
4. Wait 2-3 minutes ⏱️

### Migration 2: Fix Location Filtering
1. Still in SQL Editor
2. Copy from: `supabase/migrations/20251223_fix_matching_functions.sql`
3. Paste and click "Run"
4. Should complete instantly ⚡

## ☐ Step 3: Pull & Rebuild on GPU Machine
```bash
git pull origin main
docker compose up -d --build
```

## ☐ Step 4: Verify Worker
```bash
docker exec cv-consulting-worker-1 python -c \
  "import httpx, asyncio; \
   print(asyncio.run(httpx.AsyncClient().get('http://localhost:8000/health')).json())"
```
**Expected:** `{"status": "ok", "model": "nomic-embed-text", "dims": 768}`

## ☐ Step 5: Generate Vectors (GPU)

### Candidates (2 profiles, ~10 seconds)
```bash
docker exec cv-consulting-worker-1 python scripts/generate_candidate_vector.py
```

### Jobs (41,357 jobs, ~30-60 minutes)
```bash
docker exec cv-consulting-worker-1 python scripts/enrich_jobs.py
```

## ☐ Step 6: Test Matching
Go to your website and search for jobs in Stockholm!

**Expected results:**
- ✅ All jobs within 40km of Stockholm
- ✅ Java/Backend Developer roles at top
- ✅ Match scores 60-75% for relevant positions

---

## 🚨 If Something Goes Wrong

**Error: "dimension mismatch"**
→ Run Migration 1 again

**Error: "function does not exist"**
→ Run Migration 2 again

**Jobs still irrelevant**
→ Check vectors were regenerated (Step 5)

**Still issues?**
→ Check `DIMENSION_FIX_CRITICAL.md` for details
