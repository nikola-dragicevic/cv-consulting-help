# Precomputed Matching Architecture

This document describes the next-generation dashboard matching flow for JobbNu.

## Goal

Increase match quality without overloading the database when many users are active at the same time.

The old dashboard pipeline starts from a taxonomy-filtered pool. That is fast, but it can produce weak result sets in smaller areas because relevant jobs outside the candidate's current `category_tags` never enter scoring.

The new pipeline changes the order:

1. filter active jobs by the candidate's radius first
2. sort the radius-filtered pool by vector similarity
3. re-score that pool in the worker
4. save the best jobs per user
5. let the dashboard read from saved rows

## Core Matching Model

For each user:

1. Retrieve the top `500` active jobs within the candidate's radius, ordered by vector similarity.
2. Re-score each retrieved job with:
   - vector similarity
   - keyword hits
   - keyword misses
   - seniority penalty
   - taxonomy bonus
3. Save the top `500` jobs in `candidate_job_matches`.

The dashboard then reads from `candidate_job_matches` and applies:

- radius filtering
- plan limits
- direct-email / external-apply splitting

The old live `/api/match/for-user` flow stays alive as a fallback until the precomputed path is stable.

## Scoring Model

Current worker-side scoring formula:

- `base_score = 0.70 * vector_similarity + 0.20 * keyword_hit_rate - 0.10 * keyword_miss_rate - seniority_penalty`
- `taxonomy_bonus = 0.15 * taxonomy_hit_count`
- `taxonomy_bonus = min(taxonomy_bonus, 0.45)`
- `final_score = clamp(base_score + taxonomy_bonus, 0, 1)`

Cheap seniority implementation:

- candidate side uses `candidate_profiles.seniority_level`
- job side uses lightweight title/description heuristics such as `junior`, `trainee`, `senior`, `lead`, `manager`, `erfaren` and explicit year phrases
- when the job appears to require a higher level than the candidate profile, a negative score penalty is applied

## Taxonomy Bonus

Current implementation intentionally uses only:

- `candidate_profiles.category_tags`
- `job_ads.occupation_group_label`

We are deliberately **not** boosting on `occupation_field_label` right now because field-level parents are too broad and can add irrelevant jobs.

The `0.45` cap stays documented in the model so we can add more taxonomy-style bonus signals later if they prove useful.

Future expansion candidates:

- normalized occupation aliases
- title-family boosts
- stronger verified taxonomy mappings

## Limits

Current limits:

- semantic retrieval pool per full refresh: `500`
- saved final jobs per user: `500`
- max incremental new inserts/replacements per user per run: `300`

Why:

- `500` keeps the SQL radius-first pool bounded and fast enough to run nightly
- `500` gives enough depth for local dashboard reads
- `300` keeps daily incremental updates bounded

## What "Offline" Means

In this context, "offline" means:

- matching is computed in the worker at night or after ingestion
- dashboard requests mostly perform reads
- users are not triggering semantic rescoring on every page visit

This is the key scalability win for `1000+` simultaneous users.

## Tables

### `candidate_match_state`

Tracks whether a user needs:

- a full rematch
- an incremental refresh
- or no refresh

Important fields:

- `profile_signature`
- `match_ready`
- `status`
- `last_full_refresh_at`
- `last_incremental_refresh_at`
- `last_job_ingest_seen_at`

If `profile_signature` changes, the user needs a fresh full rematch.

### `candidate_job_matches`

Stores durable ranked matches per user:

- `user_id`
- `job_id`
- `vector_similarity`
- `keyword_hits`
- `keyword_hit_rate`
- `keyword_miss_rate`
- `taxonomy_bonus`
- `final_score`
- `distance_m`
- `match_source`

This table is the new cheap dashboard read source.

## Refresh Modes

### Full refresh

Used when:

- no match state exists
- no saved matches exist yet
- `profile_signature` changed
- a user needs a first build

Flow:

1. retrieve top `500` radius-filtered semantic jobs
2. score them in worker code
3. save top `500`
4. delete stale rows for that user

### Incremental refresh

Used when:

- profile signature is unchanged
- new or changed jobs were ingested since the last run

Flow:

1. retrieve the top recent semantic jobs after `last_job_ingest_seen_at`
2. score them in worker code
3. upsert up to `300`
4. prune the user's table back to top `500`

## Dashboard Behavior

`GET /api/match/for-user` now prefers:

1. precomputed rows from `candidate_job_matches`
2. old dashboard cache
3. old live fallback

This allows safe rollout without breaking the current experience.

### Match Button Behavior

The dashboard button no longer needs to run the old live Whole Sweden matcher.

Current behavior:

- `POST /api/match/for-user` triggers a background precompute refresh
- the API immediately returns a pending state
- the dashboard shows:
  - `Vi bygger din jobblista nu...`
- the client then polls `GET /api/match/for-user`
- once precomputed rows exist, the dashboard reads those saved rows

This avoids the old timeout-prone live `sort_dashboard_pool_by_mode` path for broad searches.

### First-Time User Flow

When a user saves a profile:

1. vector generation runs
2. if vector generation succeeds, a single-user full precompute is triggered automatically
3. if the user opens the dashboard immediately, the dashboard shows a pending first-build state
4. when the precompute finishes, the saved matches become visible

So first-time users no longer need to rely on a heavy live Whole Sweden run to get started.

### Radius and Whole Sweden

Precomputed rows are now built from the candidate's radius first for the local scope.

Dashboard filtering is then applied on top of saved rows:

- `Hela Sverige` shows the saved set without local filtering
- local dashboard mode filters by `distance_m <= selected radius`

This makes saved matches much more locally relevant while keeping dashboard reads cheap.

### Local Radius Reuse

Local matching should avoid unnecessary heavy re-runs when the user lowers the radius.

Desired behavior:

- if the local saved pool was last built for `40 km`
- and the user lowers the dashboard radius to `20 km`
- then the dashboard should reuse the existing saved local pool
- and simply filter saved rows by `distance_m <= 20 km`

Heavy local recompute is only needed when:

- the user increases the local radius beyond the saved local pool radius
- the saved local pool is missing
- the profile changed
- nightly/incremental refresh decides the pool is stale

This gives us the best of both:

- larger local saved pool when needed
- cheap smaller-area reads after that

## Worker Integration

The daily pipeline now runs:

1. stale-job sync
2. job update
3. job vector enrichment
4. geocoding
5. precomputed candidate match refresh

The match refresh runs in `auto` mode:

- full refresh when profile/match state requires it
- incremental refresh otherwise

## Operational Notes

- `job_ads.last_seen_at` is the ingestion marker used for incremental matching
- precomputed rows are still validated against active jobs on dashboard read
- description text remains in `job_ads`; the match table stores scores, not full duplicated job descriptions

## Rollout

Recommended rollout order:

1. apply migration
2. deploy worker + web changes
3. let nightly pipeline populate `candidate_job_matches`
4. verify dashboard reads from precomputed rows
5. keep the old live flow alive until confidence is high

## Next Tuning Ideas

- add a score breakdown for debugging in admin
- log full vs incremental run counts per night
- add a recovery path for users whose precomputed table is empty
- later consider title-family bonus layers on top of `occupation_group_label`
