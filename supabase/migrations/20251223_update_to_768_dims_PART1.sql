-- Migration Part 1: Drop index and NULL candidate vectors
-- Date: 2025-12-23
-- This part is fast (~1 second)

-- Step 1: Drop existing vector index
DROP INDEX IF EXISTS job_ads_embedding_idx;

-- Step 2: NULL candidate vectors (only 3 profiles, instant)
UPDATE candidate_profiles SET profile_vector = NULL WHERE profile_vector IS NOT NULL;

-- Note: Job vectors will be nulled in Part 2 (to avoid timeout)
