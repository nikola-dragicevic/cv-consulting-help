# Apply Assist MVP Plan

## Product Direction

Shift from employer-side representation to candidate-side application assistance.

Primary dashboard actions:

1. `Generera email`
   - AI-generated application email personalized to the job
   - built from candidate profile + uploaded CV + job ad

2. `Ansök`
   - if `contact_email` exists: send through connected Gmail/Outlook
   - else: open external apply helper

3. `Intervjuuppföljning`
   - candidate-facing follow-up helper after interview booking

## Job Ad Data Model

Added / planned on `job_ads`:

- `contact_email`
- `has_contact_email`
- `contact_email_source`
- `application_channel`
- `application_channel_reason`

`application_channel` MVP values:

- `direct_email`
- `external_apply`
- `unknown`

## Nightly Ingestion Logic

The nightly updater should:

1. scan `description_text`
2. scan flattened source snapshot text
3. if no email is found and `webpage_url` exists:
   - fetch the page HTML
   - regex-scan for email addresses
4. set:
   - `contact_email`
   - `has_contact_email`
   - `application_channel`

## Dashboard UX Split

Two candidate job lists:

- `Direct outreach via email`
  - jobs where `has_contact_email = true`

- `Ansök externt`
  - jobs where `application_channel = 'external_apply'`

## External Apply Helper

MVP:

1. open application page
2. prefill:
   - name
   - email
   - phone
   - CV upload
   - generated email / cover-letter text
3. user reviews
4. user clicks final submit

This should be assisted automation first, not fully autonomous submission.

## Reuse From Existing Code

Reusable today:

- admin email generation
- admin send flow patterns
- admin interview follow-up logic
- admin contact scan heuristics

## Recommended Build Order

1. persist `contact_email` and `application_channel` on `job_ads`
2. surface direct-email vs external-apply sections in dashboard
3. candidate-facing email generation
4. send through connected Gmail/Outlook
5. interview follow-up helper
6. assisted external apply
