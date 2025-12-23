-- Migration: Update vector dimensions from 1024 to 768 for nomic-embed-text
-- Date: 2025-12-23
-- Reason: Switching from snowflake-arctic-embed2 (1024d) to nomic-embed-text (768d)

-- Drop existing vector index (will be recreated with new dimensions)
DROP INDEX IF EXISTS job_ads_embedding_idx;

-- Update job_ads table to 768 dimensions
ALTER TABLE job_ads ALTER COLUMN embedding TYPE vector(768);

-- Update candidate_profiles table to 768 dimensions
-- Note: profile_vector is the new column name (used to be 'vector')
ALTER TABLE candidate_profiles ALTER COLUMN profile_vector TYPE vector(768);

-- Reset all embeddings since dimensions changed
UPDATE job_ads SET embedding = NULL, embedding_text = NULL WHERE embedding IS NOT NULL;
UPDATE candidate_profiles SET profile_vector = NULL WHERE profile_vector IS NOT NULL;

-- Recreate vector index with new dimensions
CREATE INDEX CONCURRENTLY IF NOT EXISTS job_ads_embedding_idx
ON job_ads USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Note: This index creation will take 10-30 minutes but can run in background
-- The CONCURRENTLY keyword allows queries to continue during index creation
