-- Migration Part 3: Change column types to vector(768)
-- Date: 2025-12-23
-- This is instant since all vectors are already NULL

-- Change column types to 768 dimensions
ALTER TABLE job_ads ALTER COLUMN embedding TYPE vector(768);
ALTER TABLE candidate_profiles ALTER COLUMN profile_vector TYPE vector(768);

-- Done! Index will be recreated automatically when vectors are regenerated
-- OR you can manually create it with Part 4
