📄 Vector Matching System – Current State & Forward Plan
1. Purpose of this document

This document explains:

What has been implemented and fixed so far

Which problems were identified and resolved

What design decisions are now locked

The exact next steps to continue development safely and correctly

This is meant to prevent re-introducing past errors and to provide a stable mental model for continuing the project.

2. What has been completed so far (FACTUAL STATUS)
2.1 Embedding consistency (CRITICAL FIX)

Problem encountered

Mixed vector dimensions existed in the database:

Some vectors were 768-dim

Some legacy vectors were 1024-dim

This caused:

expected 768 dimensions, not 1024

Index creation failures

Matching queries crashing

Resolution

A full audit was done on:

candidate_profiles.profile_vector

candidate_profiles.wish_vector

job_ads.embedding

All vectors are now standardized to 768 dimensions

Legacy vectors with wrong dimensions were identified and handled

Only one embedding model is now used:

nomic-embed-text

This constraint is now non-negotiable

✅ Result:
All vector comparisons are now dimension-safe and compatible.

2.2 Database indexing (PERFORMANCE FIX)

Problem encountered

Vector similarity queries timed out

Index creation (ivfflat) failed due to:

Memory limits

Transaction misuse

Supabase managed Postgres constraints

Resolution

Correct Postgres strategy applied:

❌ No BEGIN / COMMIT around index creation

✅ CREATE INDEX CONCURRENTLY

✅ One index at a time

Successfully created:

candidate_profiles.profile_vector ivfflat index

job_ads.embedding ivfflat index

Index parameters (lists) adjusted to realistic values for table size

✅ Result:
Vector similarity queries are now fast and production-safe.

2.3 Taxonomy understanding (IMPORTANT DESIGN DECISION)

Initial confusion

There was uncertainty about whether:

category_tags needed to be generated for matching

Or whether Arbetsförmedlingen taxonomy was enough

Final decision

Job taxonomy is authoritative

job_ads already contains:

occupation_field_label

occupation_group_label

occupation_label

These come directly from Arbetsförmedlingen and are higher quality than LLM-generated tags

✅ Decision:

category_tags are NOT required for job matching

They may be kept for UI or analytics, but not used in the core matching logic

2.4 Candidate data model (CLARIFIED)

Current candidate data contains:

Rich structured history:

Past roles (persona_past_1/2/3)

Current role (persona_current)

Target role

Skills

Education

Multiple vectors exist for analysis, but this caused confusion

Key clarification

Multiple vectors ≠ multiple match targets

✅ Final rule:

Only ONE vector is used for job matching: profile_vector

All other vectors are inputs used to build it — not compared directly to jobs.

3. What is NOT done yet (IMPORTANT)

The following are explicitly not finished, by design:

❌ Final profile_vector construction logic

❌ Weighting strategy for candidate data

❌ Final matching SQL with taxonomy filtering

❌ Ranking calibration / relevance tuning

❌ Evaluation of match quality

This is intentional — infra was fixed first.

4. Locked architectural principles (DO NOT CHANGE)

These rules are now fixed unless there is a very strong reason.

4.1 One vector for matching
candidate_profiles.profile_vector
VS
job_ads.embedding


No:

persona-to-job matching

skill-only matching

wish-only matching

4.2 Filtering BEFORE similarity

Matching order is always:

Hard filters

location / radius

job active

optional taxonomy filter

Vector similarity

cosine similarity via ivfflat

Never the opposite.

4.3 Weighting happens BEFORE embedding

❌ Do NOT apply weights in SQL
❌ Do NOT multiply similarity scores

✅ Weighting is done by how the text is constructed before embedding

5. The plan going forward (STEP-BY-STEP)
STEP B — Define profile_vector construction (NEXT)

Goal:
Create one stable, meaningful semantic representation of a candidate.

Actions:

Decide how text is assembled from:

current role

past roles

skills

education

target role

Apply weighting via:

repetition

ordering

phrasing

Generate one embedding from this text

Output:

Deterministic profile_vector

Easy to debug and regenerate

STEP C — Canonical matching query

Goal:

One predictable matching query that:

is fast

is explainable

can be tuned

This will include:

taxonomy filtering (field/group)

location filtering

cosine similarity ranking

STEP D — Quality tuning (only after B & C)

Goal:

Improve relevance without breaking logic

Includes:

adjusting text weights

allowing adjacent occupation groups

adding fallback logic when strict matches are empty

6. Why this approach is correct

It separates infrastructure, representation, and ranking

It avoids “magic numbers”

It matches how high-quality semantic search systems are built in production

It keeps the system debuggable and explainable

7. Current state summary (one paragraph)

The system is now technically stable: all embeddings are dimension-consistent, vector indexes are correctly built, and Arbetsförmedlingen taxonomy is accepted as the authoritative job categorization. Matching infrastructure is ready. The remaining work is purely semantic: defining how candidate information is combined into a single profile vector and how matches are filtered and ranked. No further database or infrastructure changes are required to proceed.