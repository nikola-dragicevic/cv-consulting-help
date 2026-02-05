-- CORRECTED: Fix occupation fields for user d0292a60-bf37-414c-baa7-f63d2dd5f836
-- Control Room Operator / Process Specialist at DHL/Postnord
-- Skills: WCS, WMS, SQL, Python (for automation), incident management, transport flow

-- Step 1: View current state
SELECT
  full_name,
  primary_occupation_field,
  occupation_field_candidates,
  occupation_group_candidates,
  category_tags,
  persona_current_text
FROM candidate_profiles
WHERE user_id = 'd0292a60-bf37-414c-baa7-f63d2dd5f836';

-- Step 2: Update occupation fields (CORRECTED ARRAY SYNTAX)
UPDATE candidate_profiles
SET
  -- PRIMARY FIELDS: Transport and Installation/maintenance (ARRAY syntax!)
  occupation_field_candidates = ARRAY[
    'Transport',
    'Installation, drift, underhåll',
    'Tekniskt arbete'
  ],

  -- OCCUPATION GROUPS (more specific)
  occupation_group_candidates = ARRAY[
    'Lager och terminal',
    'Maskin- och processdrift',
    'Drift, övervakning och underhåll',
    'Transport och logistik'
  ],

  -- PRIMARY FIELD (ARRAY, not string!)
  primary_occupation_field = ARRAY['Transport'],

  -- CATEGORY TAGS (keep for reference, but not used in matching)
  category_tags = ARRAY[
    'Transport/Logistics',
    'Automation/Industrial',
    'Engineering/Tech',
    'Operations/Process'
  ]

WHERE user_id = 'd0292a60-bf37-414c-baa7-f63d2dd5f836';

-- Step 3: Verify the update
SELECT
  full_name,
  primary_occupation_field,
  occupation_field_candidates,
  occupation_group_candidates,
  category_tags
FROM candidate_profiles
WHERE user_id = 'd0292a60-bf37-414c-baa7-f63d2dd5f836';

-- Expected result:
-- primary_occupation_field: {Transport}
-- occupation_field_candidates: {Transport,"Installation, drift, underhåll","Tekniskt arbete"}
-- occupation_group_candidates: {"Lager och terminal","Maskin- och processdrift",...}
