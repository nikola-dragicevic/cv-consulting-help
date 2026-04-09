import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { isAdminUser } from "@/lib/admin";
import { triggerMatchPrecompute } from "@/lib/matchPrecompute";

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
  contact_email?: string | null;
  has_contact_email?: boolean | null;
  application_url?: string | null;
  application_channel?: string | null;
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
  jobs: Array<Record<string, unknown>>;
  score_mode: ScoreMode;
  matchedAt: string;
  base_ready: boolean;
};

type DashboardCacheRow = {
  match_results: DashboardCachePayload | null;
  updated_at: string;
};

type CandidateMatchStateRow = {
  status: string | null;
  last_error: string | null;
  last_full_refresh_at: string | null;
  last_incremental_refresh_at: string | null;
  active_radius_km: number | null;
  saved_job_count: number | null;
};

type MatchScope = "local" | "national";

type DashboardRunLimitStatus = {
  allowed: boolean;
  runsRemaining: number;
  nextAllowedTime: string | null;
  hoursUntilRefresh: number;
  minutesUntilRefresh: number;
};

type PrecomputedMatchRow = {
  job_id: string;
  vector_similarity: number | null;
  keyword_hits: string[] | null;
  keyword_hit_count: number | null;
  keyword_total_count: number | null;
  keyword_hit_rate: number | null;
  keyword_miss_rate: number | null;
  taxonomy_bonus: number | null;
  final_score: number | null;
  distance_m: number | null;
  matched_at: string | null;
};

type JobMetaRow = {
  id: string;
  headline: string | null;
  company: string | null;
  city: string | null;
  location: string | null;
  description_text: string | null;
  job_url: string | null;
  webpage_url: string | null;
  occupation_field_label: string | null;
  occupation_group_label: string | null;
  occupation_label: string | null;
  skills_data: RawJobRow["skills_data"];
  contact_email: string | null;
  has_contact_email: boolean | null;
  application_url: string | null;
  application_channel: string | null;
};

const DASHBOARD_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const DASHBOARD_RUN_LIMIT = 3;
const DASHBOARD_RUN_WINDOW_MS = 24 * 60 * 60 * 1000;

function isMissingRelationError(message: string) {
  return message.includes("does not exist") || message.includes("relation") || message.includes("schema cache");
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

function hashJobIds(ids: string[]) {
  return createHash("sha1").update(ids.join("|")).digest("hex");
}

async function getPrecomputedDashboardPayload(
  supabase: Awaited<ReturnType<typeof createSupabaseRouteHandlerClient>>,
  userId: string,
  matchScope: MatchScope
) {
  const { data, error } = await supabase
    .from("candidate_job_matches")
    .select(
      "job_id, vector_similarity, keyword_hits, keyword_hit_count, keyword_total_count, keyword_hit_rate, keyword_miss_rate, taxonomy_bonus, final_score, distance_m, matched_at"
    )
    .eq("user_id", userId)
    .eq("match_scope", matchScope)
    .order("final_score", { ascending: false })
    .limit(500);

  if (error) {
    const message = getErrorMessage(error);
    if (isMissingRelationError(message)) {
      return null;
    }
    throw new Error(`candidate_job_matches lookup failed: ${message}`);
  }

  const rows = (data as PrecomputedMatchRow[] | null) ?? [];
  if (rows.length === 0) {
    return null;
  }

  const jobIds = rows.map((row) => row.job_id).filter(Boolean);
  const { data: jobMeta, error: jobMetaError } = await supabase
    .from("job_ads")
    .select(
      "id, headline, company, city, location, description_text, job_url, webpage_url, occupation_field_label, occupation_group_label, occupation_label, skills_data, contact_email, has_contact_email, application_url, application_channel"
    )
    .in("id", jobIds)
    .eq("is_active", true)
    .or("application_deadline.is.null,application_deadline.gte.now()");

  if (jobMetaError) {
    throw new Error(`job_ads precomputed metadata lookup failed: ${jobMetaError.message}`);
  }

  const metaById = new Map<string, JobMetaRow>(
    ((jobMeta as JobMetaRow[] | null) ?? []).map((row) => [String(row.id), row])
  );

  const jobs = rows
    .map((row) => {
      const meta = metaById.get(String(row.job_id));
      if (!meta) return null;

      const displayScore = Math.round(Math.max(0, Math.min(1, row.final_score ?? 0)) * 100);
      return {
        id: String(meta.id),
        headline: meta.headline ?? "",
        location: meta.city ?? meta.location ?? null,
        job_url: meta.job_url ?? null,
        webpage_url: meta.webpage_url ?? null,
        occupation_field_label: meta.occupation_field_label ?? null,
        occupation_group_label: meta.occupation_group_label ?? null,
        distance_m: row.distance_m ?? null,
        vector_similarity: row.vector_similarity ?? null,
        keyword_hit_count: row.keyword_hit_count ?? null,
        keyword_total_count: row.keyword_total_count ?? null,
        keyword_hit_rate: row.keyword_hit_rate ?? null,
        keyword_miss_rate: row.keyword_miss_rate ?? null,
        jobbnu_score: displayScore,
        keyword_match_score: row.keyword_hit_rate !== null && row.keyword_hit_rate !== undefined
          ? Math.round(Math.max(0, Math.min(1, row.keyword_hit_rate)) * 100)
          : null,
        display_score: displayScore,
        final_score: displayScore,
        keyword_hits: Array.isArray(row.keyword_hits) ? row.keyword_hits.filter((value): value is string => typeof value === "string") : [],
        skills_data: meta.skills_data ?? null,
        contact_email: meta.contact_email ?? null,
        has_contact_email: meta.has_contact_email ?? null,
        application_url: meta.application_url ?? null,
        application_channel: meta.application_channel ?? null,
        category_bonus: row.taxonomy_bonus !== null && row.taxonomy_bonus !== undefined
          ? Math.round(Math.max(0, Math.min(1, row.taxonomy_bonus)) * 100)
          : null,
      };
    })
    .filter(Boolean);

  if (jobs.length === 0) {
    return null;
  }

  return {
    jobs,
    matchedAt: rows[0]?.matched_at ?? new Date().toISOString(),
    base_ready: true,
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

async function getCandidateMatchState(
  supabase: Awaited<ReturnType<typeof createSupabaseRouteHandlerClient>>,
  userId: string
) {
  const { data, error } = await supabase
    .from("candidate_match_state")
    .select("status,last_error,last_full_refresh_at,last_incremental_refresh_at,active_radius_km,saved_job_count")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    const message = getErrorMessage(error);
    if (isMissingRelationError(message)) {
      return null;
    }
    throw new Error(`candidate_match_state lookup failed: ${message}`);
  }

  return data as CandidateMatchStateRow | null;
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
    const matchScope: MatchScope = url.searchParams.get("scope") === "national" ? "national" : "local";
    const profile = await loadProfile(supabase, user.id);
    const limitStatus = await checkDashboardRunLimit(supabase, user.id, isAdminUser(user));
    const precomputedPayload = await getPrecomputedDashboardPayload(supabase, user.id, matchScope);
    const candidateMatchState = await getCandidateMatchState(supabase, user.id);

    if (precomputedPayload) {
      return NextResponse.json({
        ...precomputedPayload,
        cached: true,
        cachedAt: precomputedPayload.matchedAt,
        candidate_cv_text: profile?.candidate_text_vector ?? "",
        canRunBasePool: limitStatus.allowed,
        runsRemaining: limitStatus.runsRemaining,
        nextAllowedTime: limitStatus.nextAllowedTime,
        hoursUntilRefresh: limitStatus.hoursUntilRefresh,
        minutesUntilRefresh: limitStatus.minutesUntilRefresh,
        precomputed: true,
        activeRadiusKm: matchScope === "local" ? candidateMatchState?.active_radius_km ?? null : null,
      });
    }

    const { payload, state } = await getCachedPayloadForMode(supabase, user.id, scoreMode);

    if (!payload) {
      const precomputePending =
        Boolean(profile?.profile_vector) &&
        (!candidateMatchState ||
          candidateMatchState.status === "pending" ||
          candidateMatchState.status === "processing");

      return NextResponse.json(
        {
          error: "No cached dashboard matches found",
          noCacheFound: true,
          precomputePending,
          pendingMessage: precomputePending
            ? "Vi bygger din första jobblista just nu. Dina matchningar uppdateras sedan automatiskt varje dag."
            : null,
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

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const matchScope: MatchScope = body?.whole_sweden ? "national" : "local";
    const requestedRadiusKm =
      matchScope === "local" && typeof body?.radius_km === "number" && Number.isFinite(body.radius_km)
        ? Math.max(1, Math.min(300, Math.round(body.radius_km)))
        : null;
    const profile = await loadProfile(supabase, user.id);
    if (!profile) {
      return NextResponse.json(
        { error: "Profil hittades inte. Vänligen ladda upp ett CV på din profilsida." },
        { status: 404 }
      );
    }

    if (!profile.profile_vector) {
      return NextResponse.json(
        { error: "Din profil har uppdaterats och analyseras nu. Vänligen vänta 10-30 sekunder och försök igen." },
        { status: 400 }
      );
    }

    const limitStatus = await checkDashboardRunLimit(supabase, user.id, isAdminUser(user));
    const candidateMatchState = await getCandidateMatchState(supabase, user.id);
    const isRadiusIncreaseAttempt =
      matchScope === "local" &&
      typeof requestedRadiusKm === "number" &&
      typeof candidateMatchState?.active_radius_km === "number" &&
      requestedRadiusKm > candidateMatchState.active_radius_km;

    if (
      matchScope === "local" &&
      typeof requestedRadiusKm === "number" &&
      typeof candidateMatchState?.active_radius_km === "number" &&
      candidateMatchState.active_radius_km >= requestedRadiusKm &&
      (candidateMatchState.status === "success" || candidateMatchState.status === "semantic_pool_ready")
    ) {
      const reusablePayload = await getPrecomputedDashboardPayload(supabase, user.id, "local");
      if (reusablePayload) {
        return NextResponse.json({
          ...reusablePayload,
          candidate_cv_text: profile.candidate_text_vector ?? "",
          cached: true,
          cachedAt: reusablePayload.matchedAt,
          canRunBasePool: limitStatus.allowed,
          runsRemaining: limitStatus.runsRemaining,
          nextAllowedTime: limitStatus.nextAllowedTime,
          hoursUntilRefresh: limitStatus.hoursUntilRefresh,
          minutesUntilRefresh: limitStatus.minutesUntilRefresh,
          precomputed: true,
          reusedSavedPool: true,
          activeRadiusKm: candidateMatchState.active_radius_km,
        });
      }
    }

    if (!limitStatus.allowed) {
      return NextResponse.json(
        {
          error: "Rate limit exceeded",
          message: isRadiusIncreaseAttempt
            ? "Din dagliga radieökning är uppnådd. Behåll nuvarande radie. Nya utökningar blir tillgängliga om 24 timmar."
            : `Du kan köra Matcha jobb ${DASHBOARD_RUN_LIMIT} gånger per 24 timmar. Nästa körning tillgänglig om ${limitStatus.hoursUntilRefresh}h ${limitStatus.minutesUntilRefresh}min.`,
          canRunBasePool: false,
          runsRemaining: 0,
          nextAllowedTime: limitStatus.nextAllowedTime,
          hoursUntilRefresh: limitStatus.hoursUntilRefresh,
          minutesUntilRefresh: limitStatus.minutesUntilRefresh,
        },
        { status: 429 }
      );
    }

    const nowIso = new Date().toISOString();
    await supabase
      .from("candidate_match_state")
      .upsert(
        {
          user_id: user.id,
          match_ready: true,
          status: "processing",
          last_error: null,
          active_radius_km: requestedRadiusKm ?? profile.commute_radius_km ?? null,
          candidate_lat: profile.location_lat ?? null,
          candidate_lon: profile.location_lon ?? null,
          updated_at: nowIso,
        },
        { onConflict: "user_id" }
      );

    try {
      await Promise.all([
        triggerMatchPrecompute(user.id, "full", matchScope, requestedRadiusKm),
        recordDashboardRun(supabase, user.id),
      ]);
    } catch (triggerError: unknown) {
      const message = triggerError instanceof Error ? triggerError.message : "Unknown error";
      if (message.toLowerCase().includes("profile vector not ready")) {
        return NextResponse.json({
          queued: true,
          precomputePending: true,
          pendingMessage: "Vi bygger fortfarande din profil. Din första jobblista startar automatiskt så snart analysen är klar.",
          candidate_cv_text: profile.candidate_text_vector ?? "",
          cached: false,
          cachedAt: nowIso,
          canRunBasePool: limitStatus.allowed,
          runsRemaining: limitStatus.runsRemaining,
          nextAllowedTime: limitStatus.nextAllowedTime,
          hoursUntilRefresh: limitStatus.hoursUntilRefresh,
          minutesUntilRefresh: limitStatus.minutesUntilRefresh,
        }, { status: 202 });
      }
      throw triggerError;
    }

    const updatedLimitStatus = await checkDashboardRunLimit(supabase, user.id, isAdminUser(user));

    return NextResponse.json({
      queued: true,
      precomputePending: true,
      pendingMessage: "Vi bygger din jobblista nu. Dina matchningar uppdateras sedan automatiskt varje dag.",
      candidate_cv_text: profile.candidate_text_vector ?? "",
      cached: false,
      cachedAt: nowIso,
      canRunBasePool: updatedLimitStatus.allowed,
      runsRemaining: updatedLimitStatus.runsRemaining,
      nextAllowedTime: updatedLimitStatus.nextAllowedTime,
      hoursUntilRefresh: updatedLimitStatus.hoursUntilRefresh,
      minutesUntilRefresh: updatedLimitStatus.minutesUntilRefresh,
    }, { status: 202 });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("Match for-user POST error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
