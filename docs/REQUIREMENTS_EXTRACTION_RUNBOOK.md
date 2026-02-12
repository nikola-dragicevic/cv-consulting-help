# Requirements Extraction Runbook

## Apply migration

Run `supabase/migrations/20260211_add_job_requirements_normalized.sql` in your Supabase SQL editor.

## Run extraction backfill

From project root:

```bash
python3 scripts/extract_job_requirements.py
```

Optional env overrides:

```bash
REQ_PARSE_MODE=all REQ_PARSE_BATCH_SIZE=300 python3 scripts/extract_job_requirements.py
```

- `REQ_PARSE_MODE=missing` (default): only jobs not yet in normalized table
- `REQ_PARSE_MODE=all`: re-parse all jobs
- `REQ_PARSE_ONLY_ACTIVE=true` (default): only active jobs

## Offline fallback behavior

If DB connectivity fails (for example DNS/network issue to Supabase), fallback is now **opt-in**:

- set `REQ_PARSE_OFFLINE_FALLBACK_JSON=jobs_50.json` to enable it

and writes parsed records to:

- `REQ_PARSE_OUTPUT_JSON=scripts/parsed_requirements_output.json` (default)

Manual offline mode:

```bash
REQ_PARSE_INPUT_JSON=jobs_50.json venv/bin/python scripts/extract_job_requirements.py
```

## Validate coverage

```sql
select
  count(*) as total_rows,
  avg(parse_confidence) as avg_parse_confidence,
  count(*) filter (where array_length(must_have_skills, 1) > 0) as with_must_skills,
  count(*) filter (where array_length(must_have_licenses, 1) > 0) as with_must_licenses,
  count(*) filter (where jsonb_array_length(must_have_languages) > 0) as with_must_languages
from job_requirements_normalized;
```

Inspect low-confidence rows:

```sql
select
  jrn.job_id,
  jrn.parse_confidence,
  jrn.missing_extraction_flags,
  ja.headline
from job_requirements_normalized jrn
join job_ads ja on ja.id = jrn.job_id
order by jrn.parse_confidence asc
limit 50;
```

## Notes

- Current parser is deterministic and description-first.
- `must_have`/`nice_to_have` structured fields are treated as optional hints.
- LLM fallback is intentionally excluded in v1 for cost and repeatability.
