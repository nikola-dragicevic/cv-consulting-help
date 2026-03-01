# Matching 3 Modes Implementation Plan

Date: 2026-02-28
Owner: Product + Engineering
Status: Draft for execution

## Goal
Implement faster matching and three user-selectable score modes in Dashboard:

1. `JobbNu score`
2. `ATS score`
3. `Taxonomy fit`

All modes must always use:
- Radius filter
- Taxonomy/category filter

## Current System (confirmed)
- Dashboard currently shows one score based on `final_score` from `match_jobs_granite`.
- SQL function in use: `match_jobs_granite(..., category_names, cv_keywords, ..., group_names)`.
- `candidate_profiles.category_tags` currently stores occupation group labels (not field labels).
- `job_ads.skills_data` exists and is already returned by SQL.
- Skills extraction pipeline already exists:
  - `scripts/granite_skill_extractor.py`
  - API extraction in `scripts/service.py` (`/extract-job-skills`)

## Critical Data Contract (avoid drift)
We must lock this to avoid filter bugs:

- `candidate_profiles.category_tags` = occupation group labels.
- `candidate_profiles.primary_occupation_field` (or expanded aliases) = occupation field labels.
- `job_ads.occupation_group_label` = group.
- `job_ads.occupation_field_label` = field.

If we say "field match", compare against `occupation_field_label`.
If we say "group match", compare against `occupation_group_label`.

## Phase 1: Speed-first SQL Prefilter
When user clicks "Match jobs", prefilter aggressively before heavy scoring.

### 1.1 Prefilter behavior
Apply in SQL `WHERE`:
- Active + not expired
- Geo radius
- Taxonomy match (field and/or group)

Recommended default:
- Hard filter on `occupation_field_label` using candidate field list (fast broad cut).
- Optional hard filter on `occupation_group_label` when category_tags are present and not too narrow.

### 1.2 SQL changes
Create new migration, example:
- `supabase/migrations/20260228_match_modes_prefilter.sql`

Add/verify indexes:
- `job_ads(occupation_field_label)`
- `job_ads(occupation_group_label)`
- partial index for active jobs:
  - `WHERE is_active = true AND embedding IS NOT NULL`

Note: keep existing vector index (`job_ads_embedding_idx`) and geo filtering path.

### 1.3 Output contract from SQL
Return raw components needed by all 3 modes:
- `vector_similarity`
- `keyword_hit_count`
- `keyword_total_count`
- `keyword_miss_count`
- `keyword_hit_rate`
- `taxonomy_level` (group/field/none)
- `distance_m`
- `skills_data`

Do not return only one baked score; return components and compute per mode.

## Phase 2: Three Scoring Modes
Add `score_mode` switch in API and UI.

Allowed values:
- `jobbnu`
- `ats`
- `taxonomy`

### 2.1 JobbNu score (as requested)
Requested weighting:
- 30% vector similarity
- 30% keyword hit
- 30% keyword miss

Important normalization rule:
- `keyword miss` must be inverse-scored, otherwise misses increase score.

Proposed formula:
`jobbnu_score = 100 * (0.30*vector_similarity + 0.30*keyword_hit_rate + 0.30*(1 - keyword_miss_rate))`

Optional remaining 10%:
- Either keep unused (max 90) then normalize to 100
- Or reserve for skills_data alignment when available

Recommendation:
- Keep exact requested 30/30/30 now.
- Normalize final value to 0..100 in API.

### 2.2 ATS score
Filters:
- Radius
- Taxonomy

Scoring:
- Keyword hits only
- `ats_score = 100 * keyword_hit_rate`

This intentionally models basic ATS behavior.

### 2.3 Taxonomy fit score
Filters:
- Radius
- Taxonomy

Scoring example:
- Same group: 100
- Same field (different group): 80
- Related field: 60
- No taxonomy relation: 0-40 (depending on final fallback rules)

Purpose text for users:
- Helps users understand labor-market proximity and career adjacency.

## Phase 3: API Contract
Update matching endpoint used by dashboard (`/api/match/for-user`).

### 3.1 Request
Add:
- `score_mode?: "jobbnu" | "ats" | "taxonomy"` (default: `jobbnu`)

### 3.2 Response per job
Return:
- `display_score` (mode-specific 0..100)
- `score_mode`
- component fields for explanation:
  - `vector_similarity`
  - `keyword_hit_count`
  - `keyword_miss_count`
  - `keyword_hit_rate`
  - `taxonomy_level`
  - `skills_data`

### 3.3 Sorting
Always sort by `display_score DESC` in selected mode.

## Phase 4: Dashboard UI
Add 3 visible buttons above:
- "Last updated ... • Refresh dashboard results"

Placement:
- In top controls section, full-width segmented controls on desktop and mobile.

Buttons:
- `JobbNu score`
- `ATS score`
- `Taxonomy fit`

Behavior:
- Tapping a button triggers fetch with `score_mode`.
- Active button state is obvious (high contrast + filled style).
- Keep selected mode in local storage.

## Phase 5: ATS SEO Page
Add dedicated route:
- `/ats` (or `/ATS` with redirect to lowercase canonical `/ats`)

Page content:
- What ATS is
- Why users can score low in ATS
- How to improve ATS compatibility
- Clarify ATS vs semantic matching

This page should be indexable and linked from dashboard.

## Phase 6: Skills Data Coverage
Problem acknowledged: some jobs lack `skills_data`.

Plan:
1. Run existing extractor on missing rows:
   - `python scripts/granite_skill_extractor.py` (default already targets missing/empty).
2. Optional full refresh:
   - `python scripts/granite_skill_extractor.py --all`
3. Add coverage metric in admin/log:
   - `% jobs with non-empty skills_data`

No blocker for launch; mode logic must work when `skills_data` is missing.

## Implementation Task List (execution order)
1. SQL migration for prefilter + score components.
2. API update for `score_mode` + `display_score`.
3. Dashboard buttons + fetch wiring + sorting.
4. `/ats` SEO page.
5. Skills-data backfill run + coverage report.
6. QA + rollout.

## Acceptance Criteria
1. Match request returns in lower p95 latency than current baseline.
2. User can switch between 3 modes without page reload.
3. Each mode re-sorts list correctly.
4. Dashboard explanations reflect selected mode.
5. `/ats` page is reachable and linked.
6. Missing `skills_data` does not break scoring.

## Risks and Guards
- Risk: label mismatch between group/field causes empty result set.
  - Guard: strict data contract + fallback from group->field.
- Risk: keyword miss incorrectly increases score.
  - Guard: always invert miss metric (`1 - miss_rate`).
- Risk: SQL drift across multiple `match_jobs_granite` migration versions.
  - Guard: introduce one canonical migration and mark old behavior deprecated in comments.

## Files Expected To Change
- `supabase/migrations/20260228_match_modes_prefilter.sql` (new)
- `src/app/api/match/for-user/route.ts`
- `src/components/matches/MatchesDashboard.tsx`
- `src/app/ats/page.tsx` (new)

## Notes
- This plan intentionally uses existing skills extraction infrastructure; no net-new extraction service is required.
- Candidate taxonomy source of truth should remain consistent with `config/category_map.json`.
