# Quick Testing Guide - Fixed Issues

## ✅ What Was Fixed

1. **Tabs Component**: Created `/src/components/ui/tabs.tsx`
2. **Radix UI**: Installed `@radix-ui/react-tabs`
3. **Webhook Trigger**: Fixed to trigger for manual entry mode (not just CV uploads)

## 🚀 Test Now (Step by Step)

### Step 1: Rebuild Next.js (for new Tabs component)

```bash
# Stop and rebuild
docker-compose down
docker-compose up -d --build
```

Wait for it to start:
```bash
docker-compose logs -f web
```

Look for: `Ready in X ms` or `Local: http://localhost:3000`

### Step 2: Test the Profile Page

1. Open browser: `http://localhost:3000/profile`
2. Choose **"Fyll i manuellt"**
3. Fill in these fields:

**Step 0 - Välj din intention:**
- Intent: "Visa flera karriärspår (rekommenderas)"
- Seniority: "Senior"

**Din karriärresa:**
- Current: "Logistikchef på DHL, ansvarig för lagerautomation och WMS-system"
- Target: "Supply Chain Manager med fokus på automation och digital transformation"

**Kompetenser & Verktyg:**
```
WMS, WCS, SAP, Python, Excel, PLC-programmering, Lean, Six Sigma
```

**Utbildning & Certifieringar:**
```
Civilingenjör i Maskinteknik, B-körkort
```

4. Check GDPR checkbox
5. Click **"Spara ändringar"**

### Step 3: Watch the Logs (In another terminal)

```bash
docker-compose logs -f worker | grep -E "WEBHOOK|persona"
```

You should see:
```
📥 [WEBHOOK] Generating candidate vector for user: <id>
🎯 [WEBHOOK] Manual entry mode - generating persona vectors...
✅ persona_current_vector generated (768 dims)
✅ persona_target_vector generated (768 dims)
✅ profile_vector (combined) generated (768 dims)
✅ [WEBHOOK] Generated 2 persona vectors
✅ [WEBHOOK] Success for <id>
```

### Step 4: Verify in Supabase

1. Go to Supabase Dashboard → Table Editor → `candidate_profiles`
2. Find your user row
3. Check these columns are **NOT NULL**:
   - `persona_current_vector`
   - `persona_target_vector`
   - `profile_vector`
   - `entry_mode` = "manual_entry"
   - `intent` = "show_multiple_tracks"

### Step 5: Test Direct Webhook (Optional)

Run the test script:
```bash
./test-webhook.sh
```

This will:
1. Check worker health
2. Get your user_id from database
3. Trigger webhook directly
4. Show response

### Step 6: Run SQL Migration

```bash
psql $DATABASE_URL -f /opt/cv-consulting/supabase/migrations/20260204_create_match_function.sql
```

Or via Supabase Dashboard → SQL Editor → paste and run.

### Step 7: Test the Matching API

Create a test file:
```bash
cat > test-match-api.sh << 'EOF'
#!/bin/bash
# Get access token from Supabase (you'll need to get this from browser localStorage)
# Or just test via the UI

echo "Testing via UI at: http://localhost:3000/match/results"
EOF

chmod +x test-match-api.sh
```

Then visit: `http://localhost:3000/match/results`

You should see:
- ✅ Three tabs loading
- ✅ Job cards appearing in tabs
- ✅ Match percentages
- ✅ Match reasons

## 🐛 Troubleshooting

### Issue: Still no webhook logs

**Check:**
```bash
# 1. Is worker running?
docker-compose ps worker

# 2. Can web container reach worker?
docker-compose exec web curl -s http://worker:8000/health

# 3. Check web logs for webhook trigger
docker-compose logs --tail 50 web | grep webhook
```

**You should see in web logs:**
```
🚀 Triggering vector update webhook for user: <id> mode: manual_entry
```

### Issue: Tabs component still not found

**Rebuild Next.js:**
```bash
docker-compose restart web
# Or force rebuild:
docker-compose up -d --build web
```

### Issue: "Function match_jobs_with_occupation_filter does not exist"

**Run the SQL migration:**
```bash
psql $DATABASE_URL -f /opt/cv-consulting/supabase/migrations/20260204_create_match_function.sql
```

### Issue: Empty results in all tabs

**Possible causes:**
1. No jobs with embeddings in database
2. Location too restrictive
3. Occupation fields don't match

**Check:**
```sql
-- How many jobs have embeddings?
SELECT COUNT(*) FROM job_ads WHERE embedding IS NOT NULL;

-- Check your profile location
SELECT full_name, city, location_lat, location_lon FROM candidate_profiles;
```

## ✅ Success Checklist

- [ ] Tabs component installed and working
- [ ] Profile page saves manual entry
- [ ] Webhook triggers and generates vectors
- [ ] Vectors appear in Supabase
- [ ] SQL function created
- [ ] `/match/results` page loads
- [ ] Three tabs show jobs
- [ ] Match percentages display

## 📝 Next Steps After Testing

1. Test all 4 intent modes:
   - `match_current_role` (only current jobs)
   - `transition_to_target` (only target jobs)
   - `show_multiple_tracks` (all three tabs)
   - `pick_categories` (same as current for now)

2. Test CV upload mode still works

3. Verify skills boost works (jobs with matching skills get higher %)

4. Check match reasons are helpful

## 🎉 You're Done When...

You can:
1. Fill in manual profile
2. See vectors generated in logs
3. Visit `/match/results`
4. See jobs in three tabs
5. See match percentages and reasons
6. Switch between tabs and see different jobs

**This is the revolutionary multi-track career matching system! 🚀**
