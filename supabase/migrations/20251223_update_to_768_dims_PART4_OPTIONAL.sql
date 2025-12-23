-- Migration Part 4: Recreate index (OPTIONAL - run after vectorization)
-- Date: 2025-12-23
-- Run this AFTER you've regenerated all vectors, not before!

-- This will take 10-30 minutes depending on how many jobs have been vectorized
-- The index speeds up similarity searches dramatically

CREATE INDEX job_ads_embedding_idx
ON job_ads USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Note: Do NOT use CONCURRENTLY here - it doesn't work in SQL Editor
-- The non-concurrent version is fine since you'll run this during off-hours
