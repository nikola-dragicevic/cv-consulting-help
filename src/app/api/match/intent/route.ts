// src/app/api/match/intent/route.ts
import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabaseServer";
import { extractKeywordsFromCV } from "@/lib/categorization";
import {
  checkMatchRateLimit,
  updateLastMatchTime,
  saveMatchCache,
  getCachedMatches,
} from "@/lib/rateLimiter";

/**
 * GET /api/match/intent
 * Fetch cached match results (no rate limiting)
 */
export async function GET(req: Request) {
  const supabase = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch cached matches
  const cached = await getCachedMatches(user.id, supabase);

  if (!cached) {
    return NextResponse.json(
      {
        error: "No cached matches found",
        message: "Kör din första matchning för att se resultat",
        noCacheFound: true,
      },
      { status: 404 }
    );
  }

  // Check rate limit status for UI display
  const rateLimit = await checkMatchRateLimit(user.id, supabase);

  return NextResponse.json({
    ...cached.data,
    cached: true,
    cachedAt: cached.updatedAt.toISOString(),
    canRefresh: rateLimit.allowed,
    nextRefreshTime: rateLimit.nextAllowedTime?.toISOString() || null,
    hoursUntilRefresh: rateLimit.hoursRemaining || 0,
    minutesUntilRefresh: rateLimit.minutesRemaining || 0,
  });
}

/**
 * POST /api/match/intent
 * Run new matching with rate limiting (once per 24h)
 */
export async function POST(req: Request) {
  const supabase = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check if user is allowed to match (24h cooldown)
  const rateLimit = await checkMatchRateLimit(user.id, supabase);

  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: "Rate limit exceeded",
        message: `Du kan söka jobb en gång per 24 timmar. Nästa sökning tillgänglig om ${rateLimit.hoursRemaining}h ${rateLimit.minutesRemaining}min.`,
        nextAllowedTime: rateLimit.nextAllowedTime,
        rateLimited: true,
      },
      { status: 429 }
    );
  }

  try {
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
    const results = await matchByIntent(profile, intent, supabase);

    const response = {
      intent,
      candidate_cv_text: profile.candidate_text_vector || profile.persona_current_text || "",
      ...results,
      cached: false,
      matchedAt: new Date().toISOString(),
    };

    // Save results to cache
    await saveMatchCache(user.id, intent, response, supabase);

    // Update last match time
    await updateLastMatchTime(user.id, supabase);

    return NextResponse.json(response);
  } catch (error: any) {
    console.error("Match intent error:", error);
    return NextResponse.json(
      { error: error?.message || "Matching failed" },
      { status: 500 }
    );
  }
}

async function matchByIntent(profile: any, intent: string, supabase: any) {
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

// Taxonomy drift: labels stored by LLM may differ from job_ads occupation_field_label values
const OCCUPATION_FIELD_ALIASES: Record<string, string[]> = {
  "Transport": ["Transport, distribution, lager"],
  "Tekniskt arbete": ["Yrken med teknisk inriktning", "Installation, drift, underhåll"],
  "Socialt arbete": ["Yrken med social inriktning"],
  "Pedagogiskt arbete": ["Pedagogik"],
};

function expandOccupationFields(fields: string[]): string[] {
  const expanded = new Set<string>();
  for (const f of fields) {
    expanded.add(f);
    for (const alias of OCCUPATION_FIELD_ALIASES[f] ?? []) {
      expanded.add(alias);
    }
  }
  return Array.from(expanded);
}

// Helper: Use Granite matching with weighted hybrid search
async function matchWithGranite(
  vector: any,
  occupationFields: string[],
  profile: any,
  supabase: any
) {
  // Extract keywords from CV text for keyword matching bonus
  const cvText = profile.candidate_text_vector || profile.persona_current_text || "";
  const keywords = extractKeywordsFromCV(cvText);

  // Expand occupation fields to handle taxonomy drift between our labels and job_ads labels
  const expandedFields = expandOccupationFields(occupationFields);

  // category_tags holds occupation_group_label values (set by webhook after group expansion).
  // Pass as group_names for a hard SQL filter on occupation_group_label.
  const groupNames =
    profile.category_tags && profile.category_tags.length > 0
      ? profile.category_tags
      : null;

  // Call granite RPC with full scoring
  const { data: jobs, error } = await supabase.rpc("match_jobs_granite", {
    candidate_vector: vector,
    candidate_lat: profile.location_lat,
    candidate_lon: profile.location_lon,
    radius_m: (profile.commute_radius_km || 50) * 1000,
    category_names: expandedFields.length > 0 ? expandedFields : null,
    cv_keywords: keywords.slice(0, 10), // Top 10 keywords
    limit_count: 100,
    group_names: groupNames,
  });

  if (error) {
    throw new Error(`match_jobs_granite failed: ${error.message}`);
  }

  return (jobs || []).map(normalizeGraniteJob);
}

function normalizeGraniteJob(job: any) {
  return {
    ...job,
    id: String(job?.id ?? ""),
    title: job?.title ?? job?.headline ?? "",
    company: job?.company ?? job?.employer_name ?? "",
    city: job?.city ?? job?.location ?? "",
    description: job?.description ?? job?.description_text ?? "",
  };
}

async function matchCurrentRole(profile: any, supabase: any) {
  const vector = profile.persona_current_vector || profile.profile_vector;

  if (!vector) {
    throw new Error("No current role vector available");
  }

  // primary_occupation_field is populated by webhook on save; occupation_field_candidates is legacy fallback
  const occupationFields = profile.primary_occupation_field || profile.occupation_field_candidates || [];
  const jobs = await matchWithGranite(vector, occupationFields, profile, supabase);

  return {
    buckets: {
      current: jobs,
      target: [],
      adjacent: []
    },
    matchType: "current_role"
  };
}

async function matchTargetRole(profile: any, supabase: any) {
  const vector = profile.persona_target_vector;

  if (!vector) {
    throw new Error("No target role defined. Please fill in your target persona.");
  }

  // occupation_targets is not yet populated; fall through to primary_occupation_field
  const occupationFields = profile.occupation_targets ||
                          profile.primary_occupation_field ||
                          profile.occupation_field_candidates || [];
  const jobs = await matchWithGranite(vector, occupationFields, profile, supabase);

  return {
    buckets: {
      current: [],
      target: jobs,
      adjacent: []
    },
    matchType: "target_role"
  };
}

async function matchMultipleTracks(profile: any, supabase: any) {
  // This is the KILLER FEATURE - show results in 3 tabs!
  const results = {
    buckets: {
      current: [] as any[],
      target: [] as any[],
      adjacent: [] as any[]
    }
  };

  // Bucket A: Current role matches
  if (profile.persona_current_vector || profile.profile_vector) {
    try {
      const currentMatches = await matchCurrentRole(profile, supabase);
      results.buckets.current = currentMatches.buckets.current.slice(0, 50);
    } catch (e) {
      console.error("Error matching current role:", e);
    }
  }

  // Bucket B: Target role matches (career progression)
  if (profile.persona_target_vector) {
    try {
      const targetMatches = await matchTargetRole(profile, supabase);
      results.buckets.target = targetMatches.buckets.target.slice(0, 50);
    } catch (e) {
      console.error("Error matching target role:", e);
    }
  }

  // Bucket C: Adjacent/Related fields (if no target defined)
  if (!profile.persona_target_vector && profile.profile_vector) {
    const relatedFields = getRelatedOccupationFields(
      profile.primary_occupation_field || profile.occupation_field_candidates || []
    );

    try {
      const adjacentJobs = await matchWithGranite(
        profile.profile_vector,
        relatedFields,
        profile,
        supabase
      );
      results.buckets.adjacent = adjacentJobs.slice(0, 50);
    } catch (e) {
      console.error("Error matching adjacent fields:", e);
    }
  }

  return {
    buckets: results.buckets,
    matchType: "multiple_tracks"
  };
}

async function matchByCategories(profile: any, supabase: any) {
  // For now, just return current role matches
  // TODO: Let user select categories in UI
  return await matchCurrentRole(profile, supabase);
}

// Helper: Get related occupation fields
function getRelatedOccupationFields(currentFields: string[]): string[] {
  // Simple relation map - expand this based on your occupation_field_relations.json
  const relations: Record<string, string[]> = {
    "Transport": ["Installation, drift, underhåll", "Industriell tillverkning"],
    "Data/IT": ["Tekniskt arbete", "Administration, ekonomi, juridik"],
    "Tekniskt arbete": ["Data/IT", "Industriell tillverkning"],
    "Installation, drift, underhåll": ["Tekniskt arbete", "Transport"],
    "Hälso- och sjukvård": ["Socialt arbete", "Pedagogiskt arbete"],
  };

  const related = new Set<string>();
  for (const field of currentFields) {
    const relatedFields = relations[field] || [];
    relatedFields.forEach(f => related.add(f));
  }

  return Array.from(related);
}

// Helper: Apply structured boosts to job results
function applyStructuredBoosts(jobs: any[], profile: any) {
  return jobs.map(job => {
    let finalScore = job.similarity || 0; // Base similarity

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
    if (job.distance_m) {
      const distancePenalty = Math.min(job.distance_m / 100000, 0.10);
      finalScore -= distancePenalty;
    }

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
  if (!candidateSkills || !jobDescription) return 0;

  // Extract keywords, normalize, calculate Jaccard similarity
  const candidateTokens = new Set(
    candidateSkills.toLowerCase()
      .split(/[\s,;.]+/)
      .filter(t => t.length > 2)
  );

  const jobTokens = new Set(
    jobDescription.toLowerCase()
      .split(/[\s,;.]+/)
      .filter(t => t.length > 2)
  );

  const intersection = new Set([...candidateTokens].filter(x => jobTokens.has(x)));
  const union = new Set([...candidateTokens, ...jobTokens]);

  return intersection.size / Math.max(union.size, 1);
}

function jobMatchesSeniority(job: any, seniority: string): boolean {
  const title = (job.title || "").toLowerCase();

  if (seniority === "senior") {
    return title.includes("senior") || title.includes("lead") ||
           title.includes("chef") || title.includes("manager");
  } else if (seniority === "junior") {
    return title.includes("junior") || title.includes("trainee") ||
           title.includes("assistent");
  }

  // Mid-level: no specific keywords
  return true;
}

function generateMatchReasons(job: any, profile: any): string[] {
  const reasons: string[] = [];

  if (job.occupation_field_label === profile.primary_occupation_field) {
    reasons.push(`Same field: ${job.occupation_field_label}`);
  }

  // Extract matching skills from job description
  const skills = (profile.skills_text || "").split(/[\s,;.]+/).filter((s: string) => s.length > 2);
  const matchingSkills = skills.filter((skill: string) =>
    job.description?.toLowerCase().includes(skill.toLowerCase())
  ).slice(0, 5);

  if (matchingSkills.length > 0) {
    reasons.push(`Skills: ${matchingSkills.join(", ")}`);
  }

  if (job.distance_m && job.distance_m < 10000) {
    reasons.push(`Close by: ${(job.distance_m / 1000).toFixed(1)} km`);
  }

  if (!reasons.length) {
    reasons.push("Good semantic match");
  }

  return reasons;
}
