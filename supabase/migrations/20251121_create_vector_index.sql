-- migration block to create the high-performance vector index

-- 1. DROP INDEX (Ta bort gammalt, eventuellt felaktigt, index)
DROP INDEX IF EXISTS job_ads_embedding_idx;

-- 2. CREATE INDEX CONCURRENTLY
-- Detta skapar indexet utan att låsa tabellen och löser både
-- "memory required" och "transaction block" felen.
CREATE INDEX CONCURRENTLY IF NOT EXISTS job_ads_embedding_idx
ON job_ads USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100); 

-- Observera: Detta tar 10-30 minuter att slutföra.