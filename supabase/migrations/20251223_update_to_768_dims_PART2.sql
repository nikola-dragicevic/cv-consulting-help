-- Migration Part 2: NULL job vectors in batches
-- Date: 2025-12-23
-- This updates in smaller chunks to avoid timeout

-- NULL job embeddings (41,357 rows, but just setting to NULL is fast)
-- This should complete in 5-10 seconds
UPDATE job_ads SET embedding = NULL, embedding_text = NULL WHERE embedding IS NOT NULL;

-- If this times out, run these smaller batches instead:
-- UPDATE job_ads SET embedding = NULL WHERE embedding IS NOT NULL LIMIT 10000;
-- (repeat 4-5 times until all are NULL)
