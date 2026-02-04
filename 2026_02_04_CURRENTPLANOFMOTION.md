1) The core idea: “Career Intent Graph” (revolutionary, but doable)
Instead of one profile vector and one category, you maintain multiple “persona vectors” per candidate, each representing a coherent career track:
Candidate personas (examples)
Current role persona (what they do now)


Target role persona (what they want next)


Past role persona (earlier career)


Transferable skills persona (general strengths)


Then matching becomes:
select the persona(s) that align with the user’s selected goal


filter job universe by occupation fields & groups


rank by embedding similarity + keyword + constraints


This solves the nurse→doctor problem cleanly:
A nurse who studied medicine creates a “doctor target persona”


Matching uses that persona, not the old nurse persona



2) What to store in DB (minimal changes, huge impact)
For candidates
Keep what you have, but add:
persona_current_text, persona_current_vector


persona_target_text, persona_target_vector


persona_past_texts[], persona_past_vectors[] (optional)


occupation_field_candidates[] (multi-field)


occupation_group_candidates[] (multi-group)


occupation_targets[] (explicit user choices)


seniority_level (optional: junior/mid/senior)


must_have_constraints (location, schedule, license)


For jobs
You already have:
occupation_field_label, occupation_group_label, occupation_label


keep embedding_text + job_vector
 Add:


required_certifications extraction (B-körkort, HLR, etc.)


must_have_keywords extraction (if present)



3) Matching algorithm (best practical design)
Step 0 — Choose intent (most important)
When user uploads CV, ask 1 question:
“What are you looking for right now?”
“Match me to jobs similar to my latest role”


“Match me to jobs I’m trying to transition into”


“Let me pick categories”


“Show multiple tracks (recommended)”


This determines which persona vector you use:
current persona OR target persona OR both.


Step 1 — Hard gate by Arbetsförmedlingen taxonomy
This is where your job filters shine. Use them as a precision tool:
Gate rules
If candidate has explicit targets, only consider those occupation_field_label / occupation_group_label (with a small expansion using related fields).


If not, infer 2–3 top fields from CV but don’t let one tag hijack.


Output: a candidate job universe of maybe 2,000–10,000 jobs, not 50k.
Step 2 — Rank inside the gated universe (embeddings)
Inside that reduced set:
70% semantic similarity


20% keyword overlap (role/title/skills)


10% recency / seniority fit / constraints


This gives you stable top matches.
Step 3 — Explain why match (trust + UX)
Show:
“Matched because: WMS, automation, drift, incident management, transport flow”


“You are missing: cert X”
 This is huge for user trust.



4) Why your tags are currently “off” (from your sample)
Jacob (category_tags null)
This isn’t “off”; it’s not built. Your row shows null, so pipeline didn’t compute tags/fields. Fix: ensure tag generation always runs when candidate_text_vector exists.
Aleksandra (BIM Manager → Data/IT)
Your tagger sees Python, API, ISO etc. BIM is engineering/design. Your current “Data/IT wins if Software/IT exists” logic is wrong. BIM should map to:
Tekniskt arbete (Engineering)


Kultur/media/design (if architectural design emphasis)


not Data/IT.


Nikola (Control room/automation/logistics → Data/IT)
Same: “Software Development” tag hijacks occupation field.
So the fix is: stop Data/IT override, and move to weighted tags + gate by occupation fields.

5) How to categorize people with multiple occupations (best method)
Do not store one category. Store:
A) Evidence-based categories (from CV)
cv_primary_fields[] (top 1–3)


cv_primary_groups[] (top 1–5)


with confidence scores


B) Intent-based targets (from user)
target_fields[]


target_groups[]


target_titles[]


C) Persona vectors (current/target/past)
This is the “multiple careers” solution.

6) Input UX: what should users provide?
Your “upload CV or paste text” is good, but add one lightweight structured layer:
Minimal “smart form” (30 seconds)
After upload, ask:
What roles are you targeting? (free text + autocomplete)


Pick up to 3 Arbetsförmedlingen fields (optional but powerful)


Experience level: junior / mid / senior


Constraints:


City + commute radius


remote/hybrid/on-site


full-time/part-time


must-have certifications (B-körkort etc.)


That’s it.
Why this is revolutionary (and fair)
People don’t all want “jobs similar to CV”. Many want:
promotion


career switch


return after gap


match by constraints (location/shift)


This captures intent without making forms heavy.

7) Make it “free and better than ATS”: Multi-track results
Give users results in three tabs:
Closest to your current role


Best career step up (seniority-up)


Best career switch matches (if they set targets)


This is a killer feature. People feel “seen”.

8) Implementation shortcuts (you can ship fast)
A) Add weights to tagger
Instead of boolean match → tag, do score-based:
+3 for title hits


+2 for occupation_label hits


+1 for skills hits
 Keep top 2 as primary.


B) Fix occupation field selection
Make Data/IT not override.
 Pick field by highest tag score, not “if present”.
C) Gate by occupation_field_label
Even a soft gate reduces wrong IT matches massively.

9) The “doctor after nurse” case (your question)
This is exactly why you need target persona.
When user selects target role:
build persona_target_text from:


selected target titles + education + skills they want to use


optionally extracted “newest education block”
 Then embed it → match to job universe filtered by the target field/group.


No lies, just intent.

If you want one concrete “best next step”
Implement this pipeline:
Candidate upload CV


Ask: Target roles / fields (optional)


Build two vectors:


current_vector from last 1–2 jobs + current skills


target_vector from chosen target roles + education + relevant skills


Hard gate jobs by occupation_field_label(s)


Rank within gate by similarity + keyword overlap


That will immediately fix “tags off” and give much better matches.
If you paste your category_map.json entries for “Software Development”, “Engineering/Tech”, “Automation/Industrial”, “Logistics/Operations”, I can suggest a tighter scoring scheme that stops IT hijacking but still supports true dev candidates.

The right architecture: Filter first, embed second
Embeddings should rank within a relevant candidate-specific job universe, not across all 50k.
Why
Cosine similarity is great at “text is similar”, but bad at “this is the right profession”.
 So you need gating using Arbetsförmedlingen labels.

1) Candidate: build 2 texts (and 2 vectors)
Don’t use one blob for everything.
A) candidate_core_text (for category/field inference + matching)
Only include:
Last 1–2 roles (titles + bullets)


Core skills/tools


Certifications/licenses


Industries/domains


Avoid overloading with:
long education theory lists


huge project descriptions (keep small)


repeated headers/contact


Embed this → candidate_core_vector.
B) candidate_full_text (optional secondary)
Full CV cleaned, for recall expansion and explanations.
Embed this → candidate_full_vector (optional).
Matching should use core_vector most of the time.

2) Candidate → infer “field candidates” (multi-field)
You already have:
category_tags


primary_occupation_field


But your logic is too “binary”. Do it like this:
Compute these:
candidate_field_scores: { "Transport": 0.78, "Installation, drift, underhåll": 0.62, "Data/IT": 0.22 }


Keep top 2–3 as candidate_fields.


How to score (simple and robust):
+3 if job-title words match that field’s typical roles (e.g., “transportledare” → Transport)


+2 if keywords match (WMS/WCS → Transport/Tech/Automation)


+1 if skills match


-3 if it’s only from education keywords and not in experience



3) Job filtering: the gating stage
For a candidate, build job universe like this:
Gate 0: location
WHERE distance(job_latlon, candidate_latlon) <= commute_radius

Gate 1: occupation fields
Use top candidate fields. Example:
candidate_fields = ["Transport", "Installation, drift, underhåll", "Tekniskt arbete"]


Filter jobs:
AND occupation_field_label IN (...)

Gate 2: optional occupation groups
If you have strong evidence (title matches), also include:
AND occupation_group_label IN (...)

Gate 3: optional “must have”
If candidate requires remote or license:
remote: only if ad explicitly allows it (don’t guess)


license/certs: only if job requires it (avoid false filtering unless user says “must”)


Result target: reduce from 50k → 2k–10k jobs.

4) Ranking: embeddings + structured boosts (this is the sort)
Inside the gated set, rank with a hybrid score.
Recommended final score (simple)
Let:
sim = cosine(candidate_core_vector, job_vector) in [0..1]


field_bonus = +0.10 if field matches (it will, but keep it)


group_bonus = +0.05 if occupation_group matches inferred groups


title_bonus = +0.05 if job title overlaps candidate target titles/keywords


skill_bonus = +0.05 if overlap with top skills/tool keywords


distance_penalty = -0.00..-0.10 depending on distance


Score formula:
final_score =
  0.75 * sim
+ 0.10 * group_bonus
+ 0.10 * title_bonus
+ 0.05 * skill_bonus
- distance_penalty

(You can simplify further: 0.85*sim + bonuses - penalty)

5) Sorting output groups (what user sees)
Don’t show one list. Show 3 buckets (this massively improves perceived quality):
Bucket A: Best matches (same field + high sim)
field matches


high similarity


close distance


Bucket B: Adjacent matches (related fields/groups)
fields that are “related” (your relations json)


medium similarity


Bucket C: Stretch matches (career-change)
different field


only show if user opted in


This prevents random IAM/security roles from appearing in the top list.

6) What to do with category_tags
Use tags as secondary signals, not primary gating.
Good uses:
title/skill boosts (“Automation / Industrial” tag → boost jobs with PLC/SCADA/maintenance)


explanation (“Matched because: WMS/WCS, incident mgmt, automation flow”)


Bad use:
mapping tags → Data/IT as primary (your current bug)



7) Concrete SQL shape (high level)
Step 1: filter jobs by location + occupation field(s)
SELECT
  id,
  title,
  occupation_field_label,
  occupation_group_label,
  embedding <=> :candidate_vec AS distance
FROM job_ads
WHERE ll_to_earth(lat, lon) <@ earth_box(ll_to_earth(:clat,:clon), :radius_m)
  AND earth_distance(ll_to_earth(lat, lon), ll_to_earth(:clat,:clon)) <= :radius_m
  AND occupation_field_label = ANY(:candidate_fields)
ORDER BY distance ASC
LIMIT 300;

Then in application layer:
convert distance to sim


apply bonuses/penalties


re-sort by final_score


(Or do bonuses in SQL if you want.)

8) Why this fixes your shown problems
Nikola won’t get Data/IT dominating because field gating will keep him mainly in Transport/Technical/Industrial jobs.


BIM manager won’t be forced into Data/IT because “Python” won’t override “Engineering/Tech”.


Multi-background candidates won’t scatter because you’ll keep top 2–3 fields and show buckets.



If you want the “best default” when user provides nothing
Use this:
infer top 2 fields from last role + repeated keywords


always show bucket A + bucket B


hide bucket C unless user opts in


That gives high precision while still allowing exploration.


/profile page design (Notice the positioning of text)

Past        Current     Target      |    Intent
     

     Skills      Education/Cert



