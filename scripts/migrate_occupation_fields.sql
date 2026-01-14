-- Migration: Change primary_occupation_field from TEXT to TEXT[]
-- This allows candidates to have multiple occupation fields

-- Step 1: Rename old column
ALTER TABLE candidate_profiles
RENAME COLUMN primary_occupation_field TO primary_occupation_field_old;

-- Step 2: Add new array column
ALTER TABLE candidate_profiles
ADD COLUMN primary_occupation_field TEXT[];

-- Step 3: Migrate existing data (convert single value to array)
UPDATE candidate_profiles
SET primary_occupation_field =
  CASE
    WHEN primary_occupation_field_old IS NOT NULL
    THEN ARRAY[primary_occupation_field_old]
    ELSE NULL
  END;

-- Step 4: Drop old column (uncomment after verifying migration)
-- ALTER TABLE candidate_profiles DROP COLUMN primary_occupation_field_old;

-- Verify migration
SELECT
  email,
  primary_occupation_field_old as old_value,
  primary_occupation_field as new_value
FROM candidate_profiles
WHERE primary_occupation_field IS NOT NULL
LIMIT 10;
