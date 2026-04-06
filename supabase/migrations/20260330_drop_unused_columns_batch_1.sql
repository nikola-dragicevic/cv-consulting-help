ALTER TABLE public.candidate_profiles
  DROP COLUMN IF EXISTS last_match_time,
  DROP COLUMN IF EXISTS persona_past_1_vector,
  DROP COLUMN IF EXISTS persona_past_2_vector,
  DROP COLUMN IF EXISTS persona_past_3_vector,
  DROP COLUMN IF EXISTS occupation_targets,
  DROP COLUMN IF EXISTS must_have_constraints;
