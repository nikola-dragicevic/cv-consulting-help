-- Add dedicated intake columns for CV/Cover Letter orders.
-- Purpose: keep fulfillment data in document_orders, separate from candidate_profiles.

ALTER TABLE public.document_orders
  ADD COLUMN IF NOT EXISTS intake_submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS intake_full_name text,
  ADD COLUMN IF NOT EXISTS intake_email text,
  ADD COLUMN IF NOT EXISTS intake_phone text,
  ADD COLUMN IF NOT EXISTS intake_address text,
  ADD COLUMN IF NOT EXISTS intake_profile_summary text,
  ADD COLUMN IF NOT EXISTS intake_skills_text text,
  ADD COLUMN IF NOT EXISTS intake_certifications_text text,
  ADD COLUMN IF NOT EXISTS intake_languages_text text,
  ADD COLUMN IF NOT EXISTS intake_driver_license text,
  ADD COLUMN IF NOT EXISTS intake_additional_info text,
  ADD COLUMN IF NOT EXISTS intake_include_full_address_in_cv boolean,
  ADD COLUMN IF NOT EXISTS intake_include_experience_3 boolean,
  ADD COLUMN IF NOT EXISTS intake_include_additional_education boolean,
  ADD COLUMN IF NOT EXISTS intake_experiences jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS intake_education_primary jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS intake_education_additional jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS letter_job_title text,
  ADD COLUMN IF NOT EXISTS letter_company_name text,
  ADD COLUMN IF NOT EXISTS letter_job_ad_text text,
  ADD COLUMN IF NOT EXISTS letter_why_this_role text,
  ADD COLUMN IF NOT EXISTS letter_why_this_company text,
  ADD COLUMN IF NOT EXISTS letter_key_examples text,
  ADD COLUMN IF NOT EXISTS letter_explain_in_letter text,
  ADD COLUMN IF NOT EXISTS letter_tone text,
  ADD COLUMN IF NOT EXISTS letter_language text;

CREATE INDEX IF NOT EXISTS document_orders_intake_email_idx
  ON public.document_orders (intake_email);

CREATE INDEX IF NOT EXISTS document_orders_intake_full_name_idx
  ON public.document_orders (intake_full_name);

UPDATE public.document_orders
SET
  intake_submitted_at = COALESCE(
    intake_submitted_at,
    NULLIF(intake_payload->>'submittedAt', '')::timestamptz
  ),
  intake_full_name = COALESCE(intake_full_name, NULLIF(intake_payload->'data'->>'fullName', '')),
  intake_email = COALESCE(intake_email, NULLIF(intake_payload->'data'->>'email', '')),
  intake_phone = COALESCE(intake_phone, NULLIF(intake_payload->'data'->>'phone', '')),
  intake_address = COALESCE(intake_address, NULLIF(intake_payload->'data'->>'address', '')),
  intake_profile_summary = COALESCE(intake_profile_summary, NULLIF(intake_payload->'data'->>'profileSummary', '')),
  intake_skills_text = COALESCE(intake_skills_text, NULLIF(intake_payload->'data'->>'skills', '')),
  intake_certifications_text = COALESCE(intake_certifications_text, NULLIF(intake_payload->'data'->>'certifications', '')),
  intake_languages_text = COALESCE(intake_languages_text, NULLIF(intake_payload->'data'->>'languages', '')),
  intake_driver_license = COALESCE(intake_driver_license, NULLIF(intake_payload->'data'->>'driverLicense', '')),
  intake_additional_info = COALESCE(intake_additional_info, NULLIF(intake_payload->'data'->>'additionalInfo', '')),
  intake_include_full_address_in_cv = COALESCE(
    intake_include_full_address_in_cv,
    CASE
      WHEN lower(COALESCE(intake_payload->'data'->>'includeFullAddressInCv', '')) = 'true' THEN true
      WHEN lower(COALESCE(intake_payload->'data'->>'includeFullAddressInCv', '')) = 'false' THEN false
      ELSE NULL
    END
  ),
  intake_include_experience_3 = COALESCE(
    intake_include_experience_3,
    CASE
      WHEN lower(COALESCE(intake_payload->'data'->>'includeExperience3', '')) = 'true' THEN true
      WHEN lower(COALESCE(intake_payload->'data'->>'includeExperience3', '')) = 'false' THEN false
      ELSE NULL
    END
  ),
  intake_include_additional_education = COALESCE(
    intake_include_additional_education,
    CASE
      WHEN lower(COALESCE(intake_payload->'data'->>'includeAdditionalEducation', '')) = 'true' THEN true
      WHEN lower(COALESCE(intake_payload->'data'->>'includeAdditionalEducation', '')) = 'false' THEN false
      ELSE NULL
    END
  ),
  intake_experiences = CASE
    WHEN jsonb_typeof(intake_payload->'data'->'experiences') = 'array' THEN intake_payload->'data'->'experiences'
    ELSE intake_experiences
  END,
  intake_education_primary = CASE
    WHEN jsonb_typeof(intake_payload->'data'->'education') = 'object' THEN intake_payload->'data'->'education'
    ELSE intake_education_primary
  END,
  intake_education_additional = CASE
    WHEN jsonb_typeof(intake_payload->'data'->'education2') = 'object' THEN intake_payload->'data'->'education2'
    ELSE intake_education_additional
  END,
  letter_job_title = COALESCE(letter_job_title, NULLIF(intake_payload->'data'->>'jobTitle', '')),
  letter_company_name = COALESCE(letter_company_name, NULLIF(intake_payload->'data'->>'companyName', '')),
  letter_job_ad_text = COALESCE(letter_job_ad_text, NULLIF(intake_payload->'data'->>'jobAdText', '')),
  letter_why_this_role = COALESCE(letter_why_this_role, NULLIF(intake_payload->'data'->>'whyThisRole', '')),
  letter_why_this_company = COALESCE(letter_why_this_company, NULLIF(intake_payload->'data'->>'whyThisCompany', '')),
  letter_key_examples = COALESCE(letter_key_examples, NULLIF(intake_payload->'data'->>'keyExamples', '')),
  letter_explain_in_letter = COALESCE(letter_explain_in_letter, NULLIF(intake_payload->'data'->>'explainInLetter', '')),
  letter_tone = COALESCE(letter_tone, NULLIF(intake_payload->'data'->>'tone', '')),
  letter_language = COALESCE(letter_language, NULLIF(intake_payload->'data'->>'letterLanguage', ''))
WHERE intake_payload IS NOT NULL;

COMMENT ON COLUMN public.document_orders.intake_submitted_at IS 'Client-side timestamp when user submitted intake before Stripe checkout.';
COMMENT ON COLUMN public.document_orders.intake_experiences IS 'Normalized experience rows copied from intake form (up to 3).';
COMMENT ON COLUMN public.document_orders.intake_education_primary IS 'Primary education object from intake form.';
COMMENT ON COLUMN public.document_orders.intake_education_additional IS 'Optional additional education object from intake form.';
COMMENT ON COLUMN public.document_orders.letter_job_ad_text IS 'Raw job ad text used to tailor personal letter.';
