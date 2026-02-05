# ⚠️ CRITICAL: Apply SQL Migration

The matching system needs a SQL function to work. Here's how to apply it:

## Option 1: Supabase Dashboard (Recommended - 30 seconds)

1. **Open Supabase SQL Editor:**
   ```
   https://glmmegybqtqqahcbdjvz.supabase.co/project/_/sql/new
   ```

2. **Copy the SQL from:**
   ```bash
   cat /opt/cv-consulting/supabase/migrations/20260204_create_match_function.sql
   ```

3. **Paste in SQL Editor and click "RUN"**

4. **Verify success:**
   ```bash
   curl -X POST http://localhost:3000/api/match/intent \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer YOUR_TOKEN"
   ```

## Option 2: Direct SQL (Copy-Paste Ready)

Here's the complete SQL - copy and paste into Supabase SQL Editor:

```sql
CREATE OR REPLACE FUNCTION match_jobs_with_occupation_filter(
  candidate_vector vector(768),
  candidate_lat FLOAT,
  candidate_lon FLOAT,
  radius_m INT,
  occupation_fields TEXT[],
  limit_count INT DEFAULT 100
)
RETURNS TABLE (
  id BIGINT,
  title TEXT,
  company TEXT,
  city TEXT,
  description TEXT,
  occupation_field_label TEXT,
  occupation_group_label TEXT,
  occupation_label TEXT,
  similarity FLOAT,
  distance_m FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    j.id,
    j.title,
    j.company,
    j.city,
    j.description,
    j.occupation_field_label,
    j.occupation_group_label,
    j.occupation_label,
    1 - (j.embedding <=> candidate_vector) AS similarity,
    earth_distance(
      ll_to_earth(j.lat, j.lon),
      ll_to_earth(candidate_lat, candidate_lon)
    ) AS distance_m
  FROM job_ads j
  WHERE
    ll_to_earth(j.lat, j.lon) <@ earth_box(ll_to_earth(candidate_lat, candidate_lon), radius_m)
    AND earth_distance(ll_to_earth(j.lat, j.lon), ll_to_earth(candidate_lat, candidate_lon)) <= radius_m
    AND (
      occupation_fields IS NULL
      OR array_length(occupation_fields, 1) IS NULL
      OR j.occupation_field_label = ANY(occupation_fields)
    )
    AND j.removed IS FALSE
    AND j.embedding IS NOT NULL
  ORDER BY
    j.embedding <=> candidate_vector ASC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql STABLE;

GRANT EXECUTE ON FUNCTION match_jobs_with_occupation_filter TO authenticated;
GRANT EXECUTE ON FUNCTION match_jobs_with_occupation_filter TO service_role;
```

## After applying, test immediately:

```bash
# Test the endpoint
curl http://localhost:3000/match/results

# Or visit in browser:
http://localhost:3000/match/results
```

## Why this is needed:

The `/api/match/intent` endpoint calls `supabase.rpc("match_jobs_with_occupation_filter", ...)` which requires this function to exist in the database. Without it, you get "Failed to fetch matches" error.

## What this fixes:

✅ Occupation field filtering (Transport, Automation, not Data/IT)
✅ Location-based gating (Stockholm + 50km radius)
✅ Vector similarity ranking
✅ Three-tab results (Current, Target, Adjacent)
