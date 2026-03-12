import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { extractKeywordsFromCV } from "@/lib/categorization";
import { isAdminUser } from "@/lib/admin";

type ScoreMode = "jobbnu" | "keyword_match";

type ProfileRow = {
  profile_vector: number[] | null;
  location_lat: number | null;
  location_lon: number | null;
  commute_radius_km: number | null;
  category_tags: string[] | null;
  primary_occupation_field: string[] | null;
  occupation_field_candidates: string[] | null;
  candidate_text_vector: string | null;
};

type RawJobRow = {
  id?: string;
  title?: string;
  company?: string;
  city?: string;
  description?: string;
  job_url?: string | null;
  webpage_url?: string | null;
  occupation_field_label?: string | null;
  occupation_group_label?: string | null;
  occupation_label?: string | null;
  distance_m?: number | null;
  vector_similarity?: number | null;
  keyword_hit_count?: number | null;
  keyword_total_count?: number | null;
  keyword_hit_rate?: number | null;
  keyword_miss_rate?: number | null;
  jobbnu_score?: number | null;
  keyword_match_score?: number | null;
  ats_score?: number | null;
  display_score?: number | null;
  skills_data?: {
    required_skills?: string[];
    preferred_skills?: string[];
  } | null;
};

type DashboardStateRow = {
  base_job_ids: string[] | null;
  query_meta?: {
    lat?: number;
    lon?: number;
    radius_km?: number;
    group_names?: string[];
    category_names?: string[];
  } | null;
  base_updated_at?: string | null;
};

type DashboardCachePayload = {
  jobs: ReturnType<typeof normalizeJobRow>[];
  score_mode: ScoreMode;
  matchedAt: string;
  base_ready: boolean;
};

type DashboardCacheRow = {
  match_results: DashboardCachePayload | null;
  updated_at: string;
};

type DashboardRunLimitStatus = {
  allowed: boolean;
  runsRemaining: number;
  nextAllowedTime: string | null;
  hoursUntilRefresh: number;
  minutesUntilRefresh: number;
};

const OCCUPATION_FIELD_ALIASES: Record<string, string[]> = {
  Transport: ["Transport, distribution, lager"],
  "Tekniskt arbete": ["Yrken med teknisk inriktning", "Installation, drift, underhåll"],
  "Socialt arbete": ["Yrken med social inriktning"],
  "Pedagogiskt arbete": ["Pedagogik"],
};

const DASHBOARD_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const DASHBOARD_POOL_LIMIT = 2000;
const DASHBOARD_RUN_LIMIT = 3;
const DASHBOARD_RUN_WINDOW_MS = 24 * 60 * 60 * 1000;

function isMissingRelationError(message: string) {
  return message.includes("does not exist") || message.includes("relation") || message.includes("schema cache");
}

function isMissingColumnError(message: string) {
  return (
    (message.includes("column") && message.includes("does not exist")) ||
    (message.includes("Could not find") && message.includes("column")) ||
    message.includes("schema cache")
  );
}

function getErrorMessage(error: unknown): string {
  if (!error) return "";
  if (typeof error === "string") return error;
  if (typeof error === "object") {
    const maybeMessage = "message" in error ? error.message : undefined;
    if (typeof maybeMessage === "string") return maybeMessage;
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
  return String(error);
}

function toScoreMode(value: unknown): ScoreMode {
  if (value === "keyword_match" || value === "ats") return "keyword_match";
  return "jobbnu";
}

function normalizeOccupationFields(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const normalized = new Set<string>();

  for (const raw of value) {
    if (typeof raw !== "string") continue;
    const label = raw.trim();
    if (!label) continue;
    normalized.add(label);
    for (const mapped of OCCUPATION_FIELD_ALIASES[label] ?? []) {
      normalized.add(mapped);
    }
  }

  return normalized.size > 0 ? Array.from(normalized) : null;
}

function mergeOccupationFields(...values: unknown[]): string[] | null {
  const merged = new Set<string>();
  for (const value of values) {
    for (const label of normalizeOccupationFields(value) ?? []) {
      merged.add(label);
    }
  }
  return merged.size > 0 ? Array.from(merged) : null;
}

function buildKeywords(profile: ProfileRow): string[] | null {
  const source = profile.candidate_text_vector ?? "";
  const keywords = extractKeywordsFromCV(source).slice(0, 12);
  return keywords.length > 0 ? keywords : null;
}

function findKeywordHits(row: RawJobRow, keywords: string[] | null): string[] {
  if (!keywords || keywords.length === 0) return [];
  const haystack = `${row.title ?? ""}\n${row.description ?? ""}`.toLocaleLowerCase("sv-SE");
  const hits = new Set<string>();

  for (const keyword of keywords) {
    const normalized = keyword.trim();
    if (!normalized) continue;
    if (haystack.includes(normalized.toLocaleLowerCase("sv-SE"))) {
      hits.add(normalized);
    }
  }

  return Array.from(hits);
}

function hashJobIds(ids: string[]) {
  return createHash("sha1").update(ids.join("|")).digest("hex");
}

function normalizeJobRow(row: RawJobRow, keywordHits: string[] = []) {
  return {
    id: String(row.id ?? ""),
    headline: row.title ?? "",
    location: row.city ?? null,
    job_url: row.job_url ?? null,
    webpage_url: row.webpage_url ?? null,
    occupation_field_label: row.occupation_field_label ?? null,
    occupation_group_label: row.occupation_group_label ?? null,
    distance_m: row.distance_m ?? null,
    vector_similarity: row.vector_similarity ?? null,
    keyword_hit_count: row.keyword_hit_count ?? null,
    keyword_total_count: row.keyword_total_count ?? null,
    keyword_hit_rate: row.keyword_hit_rate ?? null,
    keyword_miss_rate: row.keyword_miss_rate ?? null,
    jobbnu_score: row.jobbnu_score ?? null,
    keyword_match_score: row.keyword_match_score ?? row.ats_score ?? null,
    display_score: row.display_score ?? null,
    final_score: row.display_score ?? null,
    keyword_hits: keywordHits,
    skills_data: row.skills_data ?? null,
  };
}

const createSupabaseRouteHandlerClient = async () => {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        get: (name: string) => cookieStore.get?.(name)?.value,
      },
    }
  );
};

async function getDashboardCache(
  supabase: Awaited<ReturnType<typeof createSupabaseRouteHandlerClient>>,
  userId: string,
  scoreMode: ScoreMode,
  cacheKey: string
) {
  const candidateModes = scoreMode === "keyword_match" ? ["keyword_match", "ats"] : [scoreMode];

  for (const dbMode of candidateModes) {
    const { data } = await supabase
      .from("dashboard_match_cache")
      .select("match_results, updated_at")
      .eq("user_id", userId)
      .eq("score_mode", dbMode)
      .eq("cache_key", cacheKey)
      .maybeSingle();

    const row = data as DashboardCacheRow | null;
    if (!row?.match_results || !row.updated_at) continue;
    const updatedAtMs = new Date(row.updated_at).getTime();
    if (!Number.isFinite(updatedAtMs) || Date.now() - updatedAtMs > DASHBOARD_CACHE_TTL_MS) {
      continue;
    }
    return {
      ...row.match_results,
      score_mode: scoreMode,
      cached: true,
      cachedAt: row.updated_at,
    };
  }

  return null;
}

async function saveDashboardCache(
  supabase: Awaited<ReturnType<typeof createSupabaseRouteHandlerClient>>,
  userId: string,
  scoreMode: ScoreMode,
  cacheKey: string,
  payload: DashboardCachePayload
) {
  const basePayload = {
    user_id: userId,
    score_mode: scoreMode,
    cache_key: cacheKey,
    match_results: payload,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("dashboard_match_cache")
    .upsert(basePayload, { onConflict: "user_id,score_mode,cache_key" });

  if (error && scoreMode === "keyword_match") {
    const fallback = await supabase
      .from("dashboard_match_cache")
      .upsert(
        {
          ...basePayload,
          score_mode: "ats",
        },
        { onConflict: "user_id,score_mode,cache_key" }
      );
    if (fallback.error) {
      throw new Error(`dashboard_match_cache upsert failed: ${fallback.error.message}`);
    }
    return;
  }

  if (error) {
    throw new Error(`dashboard_match_cache upsert failed: ${error.message}`);
  }
}

async function checkDashboardRunLimit(
  supabase: Awaited<ReturnType<typeof createSupabaseRouteHandlerClient>>,
  userId: string,
  isAdmin: boolean
): Promise<DashboardRunLimitStatus> {
  if (isAdmin) {
    return {
      allowed: true,
      runsRemaining: DASHBOARD_RUN_LIMIT,
      nextAllowedTime: null,
      hoursUntilRefresh: 0,
      minutesUntilRefresh: 0,
    };
  }

  const sinceIso = new Date(Date.now() - DASHBOARD_RUN_WINDOW_MS).toISOString();
  const { data, error } = await supabase
    .from("dashboard_match_runs")
    .select("created_at")
    .eq("user_id", userId)
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: true });

  if (error) {
    if (isMissingRelationError(error.message)) {
      return {
        allowed: true,
        runsRemaining: DASHBOARD_RUN_LIMIT,
        nextAllowedTime: null,
        hoursUntilRefresh: 0,
        minutesUntilRefresh: 0,
      };
    }
    throw new Error(`dashboard_match_runs lookup failed: ${error.message}`);
  }

  const runs = data ?? [];
  const runsRemaining = Math.max(0, DASHBOARD_RUN_LIMIT - runs.length);
  if (runsRemaining > 0) {
    return {
      allowed: true,
      runsRemaining,
      nextAllowedTime: null,
      hoursUntilRefresh: 0,
      minutesUntilRefresh: 0,
    };
  }

  const oldestRun = runs[0]?.created_at ? new Date(runs[0].created_at) : null;
  const nextAllowed = oldestRun ? new Date(oldestRun.getTime() + DASHBOARD_RUN_WINDOW_MS) : null;
  const remainingMs = nextAllowed ? Math.max(0, nextAllowed.getTime() - Date.now()) : 0;
  const hoursUntilRefresh = Math.floor(remainingMs / (1000 * 60 * 60));
  const minutesUntilRefresh = Math.ceil((remainingMs % (1000 * 60 * 60)) / (1000 * 60));

  return {
    allowed: false,
    runsRemaining: 0,
    nextAllowedTime: nextAllowed?.toISOString() ?? null,
    hoursUntilRefresh,
    minutesUntilRefresh,
  };
}

async function recordDashboardRun(
  supabase: Awaited<ReturnType<typeof createSupabaseRouteHandlerClient>>,
  userId: string
) {
  const { error } = await supabase.from("dashboard_match_runs").insert({ user_id: userId });
  if (error) {
    const message = getErrorMessage(error);
    if (isMissingRelationError(message) || !message || message === "{}") {
      return;
    }
    throw new Error(`dashboard_match_runs insert failed: ${message}`);
  }
}

async function getDashboardState(
  supabase: Awaited<ReturnType<typeof createSupabaseRouteHandlerClient>>,
  userId: string
) {
  const { data, error } = await supabase
    .from("dashboard_match_state")
    .select("base_job_ids,query_meta,base_updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(`dashboard_match_state lookup failed: ${error.message}`);
  return data as DashboardStateRow | null;
}

async function getCachedPayloadForMode(
  supabase: Awaited<ReturnType<typeof createSupabaseRouteHandlerClient>>,
  userId: string,
  scoreMode: ScoreMode
) {
  const state = await getDashboardState(supabase, userId);
  const baseJobIds = state?.base_job_ids ?? [];
  if (baseJobIds.length === 0) {
    return { payload: null, state };
  }

  const cacheKey = JSON.stringify({ baseHash: hashJobIds(baseJobIds), scoreMode });
  const payload = await getDashboardCache(supabase, userId, scoreMode, cacheKey);
  return { payload, state };
}

async function sortModePayload(
  supabase: Awaited<ReturnType<typeof createSupabaseRouteHandlerClient>>,
  params: {
    profileVector: number[];
    cvKeywords: string[] | null;
    jobIds: string[];
    groupNames: string[] | null;
    categoryNames: string[] | null;
    scoreMode: ScoreMode;
  }
) {
  const attemptedScoreMode = params.scoreMode === "keyword_match" ? "keyword_match" : "jobbnu";
  let { data, error } = await supabase.rpc("sort_dashboard_pool_by_mode", {
    candidate_vector: params.profileVector,
    cv_keywords: params.cvKeywords,
    job_ids: params.jobIds,
    group_names: params.groupNames,
    category_names: params.categoryNames,
    limit_count: DASHBOARD_POOL_LIMIT,
    score_mode: attemptedScoreMode,
  });

  if (error && params.scoreMode === "keyword_match") {
    const retry = await supabase.rpc("sort_dashboard_pool_by_mode", {
      candidate_vector: params.profileVector,
      cv_keywords: params.cvKeywords,
      job_ids: params.jobIds,
      group_names: params.groupNames,
      category_names: params.categoryNames,
      limit_count: DASHBOARD_POOL_LIMIT,
      score_mode: "ats",
    });
    data = retry.data;
    error = retry.error;
  }

  if (error) {
    throw new Error(`sort_dashboard_pool_by_mode failed: ${error.message}`);
  }

  const rows = ((data as RawJobRow[] | null) ?? []).map((row) =>
    normalizeJobRow(row, findKeywordHits(row, params.cvKeywords))
  );

  return rows;
}

async function loadProfile(
  supabase: Awaited<ReturnType<typeof createSupabaseRouteHandlerClient>>,
  userId: string
) {
  const { data, error } = await supabase
    .from("candidate_profiles")
    .select(
      "profile_vector, location_lat, location_lon, commute_radius_km, category_tags, primary_occupation_field, occupation_field_candidates, candidate_text_vector"
    )
    .eq("user_id", userId)
    .single();

  if (error || !data) {
    return null;
  }

  return data as ProfileRow;
}

export async function GET(req: Request) {
  const supabase = await createSupabaseRouteHandlerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(req.url);
    const scoreMode = toScoreMode(url.searchParams.get("score_mode"));
    const profile = await loadProfile(supabase, user.id);
    const limitStatus = await checkDashboardRunLimit(supabase, user.id, isAdminUser(user));
    const { payload, state } = await getCachedPayloadForMode(supabase, user.id, scoreMode);

    if (!payload) {
      return NextResponse.json(
        {
          error: "No cached dashboard matches found",
          noCacheFound: true,
          canRunBasePool: limitStatus.allowed,
          runsRemaining: limitStatus.runsRemaining,
          nextAllowedTime: limitStatus.nextAllowedTime,
          hoursUntilRefresh: limitStatus.hoursUntilRefresh,
          minutesUntilRefresh: limitStatus.minutesUntilRefresh,
          candidate_cv_text: profile?.candidate_text_vector ?? "",
          base_ready: Boolean((state?.base_job_ids ?? []).length > 0),
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ...payload,
      cached: true,
      candidate_cv_text: profile?.candidate_text_vector ?? "",
      canRunBasePool: limitStatus.allowed,
      runsRemaining: limitStatus.runsRemaining,
      nextAllowedTime: limitStatus.nextAllowedTime,
      hoursUntilRefresh: limitStatus.hoursUntilRefresh,
      minutesUntilRefresh: limitStatus.minutesUntilRefresh,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("Match for-user GET error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const supabase = await createSupabaseRouteHandlerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const body = await req.json().catch(() => ({}));

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const profile = await loadProfile(supabase, user.id);
    if (!profile) {
      return NextResponse.json(
        { error: "Profil hittades inte. Vänligen ladda upp ett CV på din profilsida." },
        { status: 404 }
      );
    }

    const scoreMode = toScoreMode(body?.score_mode);
    const lat = typeof body?.lat === "number" ? body.lat : profile.location_lat;
    const lon = typeof body?.lon === "number" ? body.lon : profile.location_lon;
    const radiusKm = Number(body?.radius_km ?? profile.commute_radius_km ?? 40);
    const radiusM = Math.max(1, Math.round(radiusKm * 1000));
    const normalizedOccupationFields = mergeOccupationFields(
      profile.primary_occupation_field,
      profile.occupation_field_candidates
    );
    const groupNames =
      profile.category_tags && profile.category_tags.length > 0
        ? profile.category_tags
        : null;

    if (typeof lat !== "number" || typeof lon !== "number") {
      return NextResponse.json(
        { error: "Plats saknas i din profil. Vänligen uppdatera din stad." },
        { status: 400 }
      );
    }

    if (!profile.profile_vector) {
      return NextResponse.json(
        { error: "Din profil har uppdaterats och analyseras nu. Vänligen vänta 10-30 sekunder och försök igen." },
        { status: 400 }
      );
    }

    const limitStatus = await checkDashboardRunLimit(supabase, user.id, isAdminUser(user));
    if (!limitStatus.allowed) {
      return NextResponse.json(
        {
          error: "Rate limit exceeded",
          message: `Du kan köra Matcha jobb ${DASHBOARD_RUN_LIMIT} gånger per 24 timmar. Nästa körning tillgänglig om ${limitStatus.hoursUntilRefresh}h ${limitStatus.minutesUntilRefresh}min.`,
          canRunBasePool: false,
          runsRemaining: 0,
          nextAllowedTime: limitStatus.nextAllowedTime,
          hoursUntilRefresh: limitStatus.hoursUntilRefresh,
          minutesUntilRefresh: limitStatus.minutesUntilRefresh,
        },
        { status: 429 }
      );
    }

    const cvKeywords = buildKeywords(profile);
    const { data, error } = await supabase.rpc("fetch_dashboard_taxonomy_pool", {
      candidate_lat: lat,
      candidate_lon: lon,
      radius_m: radiusM,
      group_names: groupNames,
      category_names: normalizedOccupationFields,
      limit_count: DASHBOARD_POOL_LIMIT,
    });

    if (error) {
      return NextResponse.json({ error: `fetch_dashboard_taxonomy_pool failed: ${error.message}` }, { status: 500 });
    }

    const baseRows = ((data as RawJobRow[] | null) ?? []).map((row) =>
      normalizeJobRow(row, findKeywordHits(row, cvKeywords))
    );
    const baseIds = baseRows.map((row) => row.id).filter(Boolean);
    const baseHash = hashJobIds(baseIds);
    const nowIso = new Date().toISOString();

  const [jobbnuRows, keywordRows] = await Promise.all([
      sortModePayload(supabase, {
        profileVector: profile.profile_vector,
        cvKeywords,
        jobIds: baseIds,
        groupNames,
        categoryNames: normalizedOccupationFields,
        scoreMode: "jobbnu",
      }),
      sortModePayload(supabase, {
        profileVector: profile.profile_vector,
        cvKeywords,
        jobIds: baseIds,
        groupNames,
        categoryNames: normalizedOccupationFields,
        scoreMode: "keyword_match",
      }),
    ]);

    const primaryStateWrite = await supabase
      .from("dashboard_match_state")
      .upsert(
        {
          user_id: user.id,
          base_job_ids: baseIds,
          ai_manager_job_ids: jobbnuRows.map((row) => row.id).filter(Boolean),
          keyword_match_job_ids: keywordRows.map((row) => row.id).filter(Boolean),
          query_meta: {
            lat,
            lon,
            radius_km: radiusKm,
            group_names: groupNames ?? [],
            category_names: normalizedOccupationFields ?? [],
          },
          base_updated_at: nowIso,
          ai_manager_updated_at: nowIso,
          keyword_match_updated_at: nowIso,
          updated_at: nowIso,
        },
        { onConflict: "user_id" }
      );

    if (primaryStateWrite.error && isMissingColumnError(primaryStateWrite.error.message)) {
      const legacyStateWrite = await supabase
        .from("dashboard_match_state")
        .upsert(
          {
            user_id: user.id,
            base_job_ids: baseIds,
            ai_manager_job_ids: jobbnuRows.map((row) => row.id).filter(Boolean),
            ats_job_ids: keywordRows.map((row) => row.id).filter(Boolean),
            taxonomy_job_ids: jobbnuRows.map((row) => row.id).filter(Boolean),
            query_meta: {
              lat,
              lon,
              radius_km: radiusKm,
              group_names: groupNames ?? [],
              category_names: normalizedOccupationFields ?? [],
            },
            base_updated_at: nowIso,
            ai_manager_updated_at: nowIso,
            ats_updated_at: nowIso,
            taxonomy_updated_at: nowIso,
            updated_at: nowIso,
          },
          { onConflict: "user_id" }
        );

      if (legacyStateWrite.error) {
        throw new Error(`dashboard_match_state upsert failed: ${legacyStateWrite.error.message}`);
      }
    } else if (primaryStateWrite.error) {
      throw new Error(`dashboard_match_state upsert failed: ${primaryStateWrite.error.message}`);
    }

    const jobbnuPayload: DashboardCachePayload = {
      jobs: jobbnuRows,
      score_mode: "jobbnu",
      matchedAt: nowIso,
      base_ready: true,
    };
    const keywordPayload: DashboardCachePayload = {
      jobs: keywordRows,
      score_mode: "keyword_match",
      matchedAt: nowIso,
      base_ready: true,
    };

    await Promise.all([
      saveDashboardCache(supabase, user.id, "jobbnu", JSON.stringify({ baseHash, scoreMode: "jobbnu" }), jobbnuPayload),
      saveDashboardCache(
        supabase,
        user.id,
        "keyword_match",
        JSON.stringify({ baseHash, scoreMode: "keyword_match" }),
        keywordPayload
      ),
      recordDashboardRun(supabase, user.id),
    ]);

    const responsePayload = scoreMode === "keyword_match" ? keywordPayload : jobbnuPayload;
    const updatedLimitStatus = await checkDashboardRunLimit(supabase, user.id, isAdminUser(user));

    return NextResponse.json({
      ...responsePayload,
      candidate_cv_text: profile.candidate_text_vector ?? "",
      cached: false,
      cachedAt: nowIso,
      canRunBasePool: updatedLimitStatus.allowed,
      runsRemaining: updatedLimitStatus.runsRemaining,
      nextAllowedTime: updatedLimitStatus.nextAllowedTime,
      hoursUntilRefresh: updatedLimitStatus.hoursUntilRefresh,
      minutesUntilRefresh: updatedLimitStatus.minutesUntilRefresh,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("Match for-user POST error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
