-- Migration: Update vector dimensions from 1024 to 768 for nomic-embed-text
-- Date: 2025-12-23
-- Reason: Switching from snowflake-arctic-embed2 (1024d) to nomic-embed-text (768d)

-- CRITICAL: Must NULL existing vectors BEFORE changing column type!
-- You cannot convert vector(1024) to vector(768) - they're incompatible

-- Step 1: Drop existing vector index (will be recreated with new dimensions)
DROP INDEX IF EXISTS job_ads_embedding_idx;

-- Step 2: NULL all existing vectors (required before type change)
UPDATE job_ads SET embedding = NULL WHERE embedding IS NOT NULL;
UPDATE candidate_profiles SET profile_vector = NULL WHERE profile_vector IS NOT NULL;

-- Step 3: Now we can safely change the column types
ALTER TABLE job_ads ALTER COLUMN embedding TYPE vector(768);
ALTER TABLE candidate_profiles ALTER COLUMN profile_vector TYPE vector(768);

-- Recreate vector index with new dimensions
CREATE INDEX CONCURRENTLY IF NOT EXISTS job_ads_embedding_idx
ON job_ads USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Note: This index creation will take 10-30 minutes but can run in background
-- The CONCURRENTLY keyword allows queries to continue during index creation
