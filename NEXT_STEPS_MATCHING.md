# Next Steps: Intent-Based Matching Implementation

## Overview
Now that the profile page and vector generation are updated, you need to implement the intent-based matching algorithm from CURRENTPLANOFMOTION.md.

## What's Done ✅

1. **Database Schema**: All persona fields added to `candidate_profiles`
2. **Profile Page UI**: Users can choose CV upload or manual entry
3. **Profile API**: Saves all persona fields
4. **Python Worker**: Generates vectors for all persona fields based on entry mode

## What's Next 🚀

### 1. Update Matching API Endpoints

You need to modify your matching endpoints to use the intent-based approach:

#### Current Matching Flow
```
/api/match/init → returns jobs based on single profile_vector
```

#### New Intent-Based Flow
```
Step 0: Check user's intent field
Step 1: Select appropriate persona vector(s)
Step 2: Gate by occupation fields
Step 3: Rank with embeddings + structured boosts
Step 4: Return bucketed results
```

### 2. Matching Logic by Intent

Based on the user's `intent` field, use different persona vectors:

| Intent | Vector to Use | Job Filtering |
|--------|--------------|---------------|
| `match_current_role` | `persona_current_vector` | Filter by current occupation fields |
| `transition_to_target` | `persona_target_vector` | Filter by target occupation fields |
| `pick_categories` | Let user select, then use `persona_current_vector` | User-selected occupation fields |
| `show_multiple_tracks` | Both `persona_current_vector` AND `persona_target_vector` | Multiple result buckets |

### 3. Implementation Steps

#### Step 1: Update `/api/match/init`

Create a new file: `/src/app/api/match/intent/route.ts`

```typescript
// src/app/api/match/intent/route.ts
import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabaseServer";

export async function POST(req: Request) {
  const supabase = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch profile with persona vectors
  const { data: profile } = await supabase
    .from("candidate_profiles")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const intent = profile.intent || "show_multiple_tracks";
  const results = await matchByIntent(profile, intent);

  return NextResponse.json({
    intent,
    results,
    buckets: results.buckets // For multi-track display
  });
}

async function matchByIntent(profile: any, intent: string) {
  const supabase = await getServerSupabase();

  switch (intent) {
    case "match_current_role":
      return await matchCurrentRole(profile, supabase);

    case "transition_to_target":
      return await matchTargetRole(profile, supabase);

    case "show_multiple_tracks":
      return await matchMultipleTracks(profile, supabase);

    case "pick_categories":
      return await matchByCategories(profile, supabase);

    default:
      return await matchMultipleTracks(profile, supabase);
  }
}
```

#### Step 2: Implement Matching Functions

```typescript
async function matchCurrentRole(profile: any, supabase: any) {
  const vector = profile.persona_current_vector || profile.profile_vector;

  if (!vector) {
    throw new Error("No current role vector available");
  }

  // Step 1: Gate by occupation fields (from current role)
  const occupationFields = profile.occupation_field_candidates || [];

  // Step 2: Vector search with occupation field filter
  const { data: jobs } = await supabase.rpc("match_jobs_with_occupation_filter", {
    candidate_vector: vector,
    candidate_lat: profile.location_lat,
    candidate_lon: profile.location_lon,
    radius_m: profile.commute_radius || 50000,
    occupation_fields: occupationFields,
    limit_count: 100
  });

  // Step 3: Apply structured boosts
  const rankedJobs = applyStructuredBoosts(jobs, profile);

  return {
    jobs: rankedJobs,
    matchType: "current_role"
  };
}

async function matchTargetRole(profile: any, supabase: any) {
  const vector = profile.persona_target_vector;

  if (!vector) {
    throw new Error("No target role defined. Please fill in your target persona.");
  }

  // Use target occupation fields
  const occupationFields = profile.occupation_targets ||
                          profile.occupation_field_candidates || [];

  const { data: jobs } = await supabase.rpc("match_jobs_with_occupation_filter", {
    candidate_vector: vector,
    candidate_lat: profile.location_lat,
    candidate_lon: profile.location_lon,
    radius_m: profile.commute_radius || 50000,
    occupation_fields: occupationFields,
    limit_count: 100
  });

  const rankedJobs = applyStructuredBoosts(jobs, profile);

  return {
    jobs: rankedJobs,
    matchType: "target_role"
  };
}

async function matchMultipleTracks(profile: any, supabase: any) {
  // This is the KILLER FEATURE - show results in 3 tabs!
  const results = {
    buckets: {
      current: [],
      target: [],
      adjacent: []
    }
  };

  // Bucket A: Current role matches
  if (profile.persona_current_vector) {
    const currentMatches = await matchCurrentRole(profile, supabase);
    results.buckets.current = currentMatches.jobs.slice(0, 50);
  }

  // Bucket B: Target role matches (career progression)
  if (profile.persona_target_vector) {
    const targetMatches = await matchTargetRole(profile, supabase);
    results.buckets.target = targetMatches.jobs.slice(0, 50);
  }

  // Bucket C: Adjacent/Related fields (if no target defined)
  if (!profile.persona_target_vector) {
    const relatedFields = getRelatedOccupationFields(
      profile.occupation_field_candidates || []
    );

    const { data: adjacentJobs } = await supabase.rpc("match_jobs_with_occupation_filter", {
      candidate_vector: profile.profile_vector,
      candidate_lat: profile.location_lat,
      candidate_lon: profile.location_lon,
      radius_m: profile.commute_radius || 50000,
      occupation_fields: relatedFields,
      limit_count: 50
    });

    results.buckets.adjacent = adjacentJobs;
  }

  return results;
}
```

#### Step 3: Create SQL Function for Occupation Field Filtering

```sql
-- Create this function in Supabase SQL Editor
CREATE OR REPLACE FUNCTION match_jobs_with_occupation_filter(
  candidate_vector vector(768),
  candidate_lat FLOAT,
  candidate_lon FLOAT,
  radius_m INT,
  occupation_fields TEXT[],
  limit_count INT DEFAULT 100
)
RETURNS TABLE (
  id BIGINT,
  title TEXT,
  company TEXT,
  occupation_field_label TEXT,
  occupation_group_label TEXT,
  occupation_label TEXT,
  similarity FLOAT,
  distance_m FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    j.id,
    j.title,
    j.company,
    j.occupation_field_label,
    j.occupation_group_label,
    j.occupation_label,
    1 - (j.embedding <=> candidate_vector) AS similarity,
    earth_distance(
      ll_to_earth(j.lat, j.lon),
      ll_to_earth(candidate_lat, candidate_lon)
    ) AS distance_m
  FROM job_ads j
  WHERE
    -- Step 1: Location gate
    ll_to_earth(j.lat, j.lon) <@ earth_box(ll_to_earth(candidate_lat, candidate_lon), radius_m)
    AND earth_distance(ll_to_earth(j.lat, j.lon), ll_to_earth(candidate_lat, candidate_lon)) <= radius_m
    -- Step 2: Occupation field gate
    AND (
      occupation_fields IS NULL
      OR array_length(occupation_fields, 1) IS NULL
      OR j.occupation_field_label = ANY(occupation_fields)
    )
    -- Only active jobs
    AND j.removed IS FALSE
  ORDER BY
    j.embedding <=> candidate_vector ASC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql STABLE;
```

#### Step 4: Apply Structured Boosts

```typescript
function applyStructuredBoosts(jobs: any[], profile: any) {
  return jobs.map(job => {
    let finalScore = job.similarity; // Base: 0.75 weight

    // Occupation group bonus (+0.10 if matches)
    if (profile.occupation_group_candidates?.includes(job.occupation_group_label)) {
      finalScore += 0.10;
    }

    // Skills/keyword overlap (+0.10)
    const skillsOverlap = calculateSkillsOverlap(
      profile.skills_text || "",
      job.description || ""
    );
    finalScore += skillsOverlap * 0.10;

    // Distance penalty (-0.10 max)
    const distancePenalty = Math.min(job.distance_m / 100000, 0.10);
    finalScore -= distancePenalty;

    // Seniority match (+0.05)
    if (profile.seniority_level && jobMatchesSeniority(job, profile.seniority_level)) {
      finalScore += 0.05;
    }

    return {
      ...job,
      finalScore,
      matchReasons: generateMatchReasons(job, profile)
    };
  }).sort((a, b) => b.finalScore - a.finalScore);
}

function calculateSkillsOverlap(candidateSkills: string, jobDescription: string): number {
  // Extract keywords, normalize, calculate Jaccard similarity
  const candidateTokens = new Set(
    candidateSkills.toLowerCase()
      .split(/[\s,;]+/)
      .filter(t => t.length > 2)
  );

  const jobTokens = new Set(
    jobDescription.toLowerCase()
      .split(/[\s,;]+/)
      .filter(t => t.length > 2)
  );

  const intersection = new Set([...candidateTokens].filter(x => jobTokens.has(x)));
  const union = new Set([...candidateTokens, ...jobTokens]);

  return intersection.size / Math.max(union.size, 1);
}

function generateMatchReasons(job: any, profile: any): string[] {
  const reasons = [];

  if (job.occupation_field_label === profile.primary_occupation_field) {
    reasons.push(`Same field: ${job.occupation_field_label}`);
  }

  // Extract matching skills from job description
  const skills = (profile.skills_text || "").split(/[\s,;]+/).filter(s => s.length > 2);
  const matchingSkills = skills.filter(skill =>
    job.description?.toLowerCase().includes(skill.toLowerCase())
  ).slice(0, 5);

  if (matchingSkills.length > 0) {
    reasons.push(`Skills: ${matchingSkills.join(", ")}`);
  }

  if (job.distance_m < 10000) {
    reasons.push(`Close by: ${(job.distance_m / 1000).toFixed(1)} km`);
  }

  return reasons;
}
```

### 4. Update Frontend to Display Multi-Track Results

Create a new results page with tabs:

```tsx
// src/app/match/results/page.tsx
"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function MatchResults({ results }) {
  const { buckets } = results;

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-6">Your Job Matches</h1>

      <Tabs defaultValue="current" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="current">
            Similar to Current Role ({buckets.current?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="target">
            Career Progression ({buckets.target?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="adjacent">
            Related Fields ({buckets.adjacent?.length || 0})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="current">
          <JobList jobs={buckets.current} type="current" />
        </TabsContent>

        <TabsContent value="target">
          <JobList jobs={buckets.target} type="target" />
        </TabsContent>

        <TabsContent value="adjacent">
          <JobList jobs={buckets.adjacent} type="adjacent" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

## Testing Checklist

- [ ] Test CV upload flow (should generate `profile_vector` as before)
- [ ] Test manual entry flow (should generate persona vectors)
- [ ] Test intent="match_current_role" matching
- [ ] Test intent="transition_to_target" matching
- [ ] Test intent="show_multiple_tracks" (3 buckets)
- [ ] Verify occupation field filtering works
- [ ] Test structured boosts (skills overlap, distance, seniority)
- [ ] Verify match reasons display correctly

## Quick Start Commands

```bash
# 1. Restart your Python worker to load new code
docker-compose restart worker

# 2. Test the webhook with a manual entry profile
curl -X POST http://localhost:8000/webhook/update-profile \
  -H "Content-Type: application/json" \
  -d '{"user_id": "YOUR_USER_ID", "cv_text": ""}'

# 3. Check Supabase to verify persona vectors were created
# Look for: persona_current_vector, persona_target_vector columns

# 4. Test matching in your app
# Visit /profile, fill in manual entry, save
# Visit /match (or whatever your match page is)
```

## Summary

The foundation is complete! Now you just need to:
1. Create the SQL function for occupation field filtering
2. Implement the matching logic in your API
3. Update the frontend to show multi-track results

This will give you the revolutionary "career intent graph" matching system that's described in CURRENTPLANOFMOTION.md!
