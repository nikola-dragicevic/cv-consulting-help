# Queue-Based Matching Architecture

This document describes the next-step production architecture for profile vector generation and job matching.

The goal is to move away from fragile "save profile -> immediately call worker" behavior and toward a durable, observable pipeline that can safely handle larger traffic.

## Why Change The Current Approach

Today, profile save works like this:

1. User saves profile
2. Profile is written to `candidate_profiles`
3. App triggers the worker directly
4. Worker tries to generate vectors immediately

This is good for an MVP, but not ideal for scale.

Weaknesses in the current model:

- a worker outage can cause profile updates to miss vector generation
- retries are not durable
- failures are hard to inspect operationally
- burst traffic can overload the worker
- the dashboard can depend too much on live recalculation

## High-Level Target

We should split the system into two durable flows:

1. `profile_vector_jobs`
   - handles profile-to-vector generation
2. `candidate_job_matches`
   - stores candidate/job match results so dashboard reads cached results instead of rebuilding everything live

## Part 1: Profile Vector Queue

### What A `profile_vector_job` Means

A `profile_vector_job` is a database row representing:

"This user needs their profile vectors regenerated."

Instead of relying on a direct webhook call, we save a job that the worker can safely process later.

### Suggested Table

Table: `profile_vector_jobs`

Suggested columns:

- `id uuid primary key`
- `user_id uuid not null`
- `candidate_profile_id uuid null`
- `status text not null`
- `attempts integer not null default 0`
- `max_attempts integer not null default 5`
- `priority integer not null default 100`
- `run_after timestamptz not null default now()`
- `locked_at timestamptz null`
- `locked_by text null`
- `last_error text null`
- `payload_version integer not null default 1`
- `trigger_source text not null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`
- `completed_at timestamptz null`

Suggested statuses:

- `queued`
- `processing`
- `completed`
- `retry`
- `failed`
- `dead_letter`

### Save Flow

When a user saves profile:

1. Save `candidate_profiles`
2. Mark profile vector status as `pending`
3. Insert a `profile_vector_job`
4. Return success to the user immediately

The save request should not wait for heavy vector work.

### Worker Flow

Worker loop:

1. select one available job:
   - `status in ('queued', 'retry')`
   - `run_after <= now()`
2. atomically claim it
3. mark `processing`
4. generate vectors
5. on success:
   - update `candidate_profiles`
   - mark job `completed`
6. on failure:
   - increment attempts
   - store `last_error`
   - schedule `run_after` using backoff
7. if attempts exceed limit:
   - mark `dead_letter`

### Retry Backoff

Suggested retry schedule:

- attempt 1 -> retry after 1 minute
- attempt 2 -> retry after 5 minutes
- attempt 3 -> retry after 15 minutes
- attempt 4 -> retry after 1 hour
- attempt 5 -> dead letter

### Idempotency

We should avoid duplicate active jobs for the same user.

Options:

- enforce one active job per `user_id` where status is not completed
- or allow multiple jobs but process only the newest one

Recommended MVP:

- only one active vector job per user
- new profile save replaces or supersedes old queued job

## Part 2: Job Matching Strategy

### Current Problem

If matching logic becomes too live and too per-request, the dashboard gets expensive:

- repeated ranking work
- repeated filtering over large job sets
- poor scalability

### Better Strategy

Jobs should be enriched once, then reused many times.

Daily job pipeline at `04:00`:

1. fetch jobs
2. clean stale jobs
3. enrich new/changed jobs:
   - embedding
   - category/taxonomy
   - email extraction
   - application URL extraction
   - geo coordinates
4. mark jobs ready for matching

Then candidate matching should work against already-enriched jobs.

### First Practical Version

For each candidate:

- run one broad Sweden query against enriched jobs
- filter/rank by:
  - vector similarity
  - category fit
  - keyword hits/misses
  - radius/location
  - freshness/deadline

This is already much better than reprocessing raw job data per user.

### Better Production Version: Incremental Matching

We should introduce a cache table:

Table: `candidate_job_matches`

Suggested columns:

- `id uuid primary key`
- `user_id uuid not null`
- `job_id text not null`
- `match_score numeric not null`
- `semantic_score numeric null`
- `keyword_hits integer null`
- `keyword_misses integer null`
- `application_channel text null`
- `contact_email text null`
- `application_url text null`
- `match_version integer not null default 1`
- `generated_at timestamptz not null default now()`
- `source text not null`

Unique index:

- `(user_id, job_id)`

### Incremental Matching Flow

When new jobs arrive:

1. identify `new_or_updated_jobs`
2. match those only against candidates who are ready
3. insert/update `candidate_job_matches`

When a candidate profile changes:

1. regenerate profile vectors
2. rematch that candidate against relevant jobs
3. refresh their `candidate_job_matches`

This means:

- new jobs are added on top of existing candidate results
- candidate changes trigger candidate-focused recomputation
- dashboard becomes mostly a read operation

## Why Radius Should Be A Filter, Not A Rebuild Trigger

Radius and location are cheap compared to embedding and categorization.

So:

- enrich job once
- compute candidate profile once
- use radius/location as ranking/filter logic on top of ready data

This keeps the expensive parts stable.

## Operational Recommendations

### Monitoring

We should be able to answer:

- how many vector jobs are queued right now
- how many are failing
- average processing time
- how many dead-letter jobs exist
- how many candidates are missing match-ready vectors

### Alerts

Alert if:

- `profile_vector_jobs` dead-letter count increases
- queue age exceeds threshold
- worker has zero throughput for too long
- match generation backlog grows too large

### Admin Visibility

Later, the admin dashboard should show:

- queue health
- failed jobs
- retry button
- dead-letter inspection

## Recommended Build Order

### Phase 1

Build durable vector queue first.

Deliverables:

- `profile_vector_jobs` migration
- enqueue job on profile save
- worker polling loop
- retry/backoff
- dead-letter status

### Phase 2

Make matching less live and more cached.

Deliverables:

- `candidate_job_matches` migration
- candidate rematch worker
- new-job incremental matcher
- dashboard reads cached matches first

### Phase 3

Add operational tooling.

Deliverables:

- queue metrics
- admin retry tools
- alerts
- cleanup jobs

## Recommended Product Behavior During Transition

Before full queue rollout:

- keep the current vector status UI
- keep retry button on `/profile`
- use the new status fields to debug failures

After queue rollout:

- `/profile` should reflect queue status:
  - queued
  - processing
  - completed
  - failed
- dashboard should rely less on live matching

## Summary

The target architecture is:

- save profile fast
- enqueue vector work durably
- retry safely
- enrich jobs once
- match incrementally
- serve dashboard from cached match rows

This is the best path toward stable scaling for larger candidate volume.
