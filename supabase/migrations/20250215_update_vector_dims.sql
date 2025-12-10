-- Uppdatera tabeller till 1024 dimensioner (snowflake-arctic-embed2)
ALTER TABLE job_ads ALTER COLUMN embedding TYPE vector(1024);
ALTER TABLE candidate_profiles ALTER COLUMN vector TYPE vector(1024);

-- Nollställ gammal data (eftersom dimensionerna inte matchar längre)
UPDATE job_ads SET embedding = NULL;
UPDATE candidate_profiles SET vector = NULL;