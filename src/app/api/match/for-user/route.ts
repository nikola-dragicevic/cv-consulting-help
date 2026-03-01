import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { extractKeywordsFromCV } from "@/lib/categorization";

type ScoreMode = "jobbnu" | "ats" | "taxonomy";
type MatchAction = "base_pool" | "score_sort";

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
  ats_score?: number | null;
  taxonomy_score?: number | null;
  display_score?: number | null;
  skills_data?: {
    required_skills?: string[];
    preferred_skills?: string[];
  } | null;
};

type DashboardStateRow = {
  base_job_ids: string[] | null;
};

type DashboardCacheRow = {
  match_results: {
    jobs?: ReturnType<typeof normalizeJobRow>[];
    score_mode?: ScoreMode;
    matchedAt?: string;
    base_ready?: boolean;
  } | null;
  updated_at: string;
};

const OCCUPATION_FIELD_ALIASES: Record<string, string[]> = {
  Transport: ["Transport, distribution, lager"],
  "Tekniskt arbete": ["Yrken med teknisk inriktning", "Installation, drift, underhåll"],
  "Socialt arbete": ["Yrken med social inriktning"],
  "Pedagogiskt arbete": ["Pedagogik"],
};

const DASHBOARD_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const DASHBOARD_POOL_LIMIT = 2000;

function toScoreMode(value: unknown): ScoreMode {
  if (value === "ats" || value === "taxonomy") return value;
  return "jobbnu";
}

function toMatchAction(value: unknown): MatchAction {
  if (value === "base_pool") return "base_pool";
  return "score_sort";
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

function hashJobIds(ids: string[]) {
  return createHash("sha1").update(ids.join("|")).digest("hex");
}

function normalizeJobRow(row: RawJobRow) {
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
    ats_score: row.ats_score ?? null,
    taxonomy_score: row.taxonomy_score ?? null,
    display_score: row.display_score ?? null,
    final_score: row.display_score ?? null,
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
  const { data } = await supabase
    .from("dashboard_match_cache")
    .select("match_results, updated_at")
    .eq("user_id", userId)
    .eq("score_mode", scoreMode)
    .eq("cache_key", cacheKey)
    .maybeSingle();

  const row = data as DashboardCacheRow | null;
  if (!row?.match_results || !row.updated_at) return null;
  const updatedAtMs = new Date(row.updated_at).getTime();
  if (!Number.isFinite(updatedAtMs) || Date.now() - updatedAtMs > DASHBOARD_CACHE_TTL_MS) {
    return null;
  }
  return {
    ...row.match_results,
    cached: true,
    cachedAt: row.updated_at,
  };
}

async function saveDashboardCache(
  supabase: Awaited<ReturnType<typeof createSupabaseRouteHandlerClient>>,
  userId: string,
  scoreMode: ScoreMode,
  cacheKey: string,
  payload: {
    jobs: ReturnType<typeof normalizeJobRow>[];
    score_mode: ScoreMode;
    matchedAt: string;
    base_ready: boolean;
  }
) {
  await supabase
    .from("dashboard_match_cache")
    .upsert(
      {
        user_id: userId,
        score_mode: scoreMode,
        cache_key: cacheKey,
        match_results: payload,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,score_mode,cache_key" }
    );
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
    const { data: profile, error: profileError } = await supabase
      .from("candidate_profiles")
      .select(
        "profile_vector, location_lat, location_lon, commute_radius_km, category_tags, primary_occupation_field, occupation_field_candidates, candidate_text_vector"
      )
      .eq("user_id", user.id)
      .single();

    const typedProfile = profile as ProfileRow | null;
    if (profileError || !typedProfile) {
      return NextResponse.json(
        { error: "Profil hittades inte. Vänligen ladda upp ett CV på din profilsida." },
        { status: 404 }
      );
    }

    const matchAction = toMatchAction(body?.match_action);
    const scoreMode = toScoreMode(body?.score_mode);

    const lat = typeof body?.lat === "number" ? body.lat : typedProfile.location_lat;
    const lon = typeof body?.lon === "number" ? body.lon : typedProfile.location_lon;
    const radiusKm = Number(body?.radius_km ?? typedProfile.commute_radius_km ?? 40);
    const radiusM = Math.max(1, Math.round(radiusKm * 1000));
    const normalizedOccupationFields = mergeOccupationFields(
      typedProfile.primary_occupation_field,
      typedProfile.occupation_field_candidates
    );
    const groupNames =
      typedProfile.category_tags && typedProfile.category_tags.length > 0
        ? typedProfile.category_tags
        : null;

    if (typeof lat !== "number" || typeof lon !== "number") {
      return NextResponse.json(
        { error: "Plats saknas i din profil. Vänligen uppdatera din stad." },
        { status: 400 }
      );
    }

    if (matchAction === "base_pool") {
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

      const rows = ((data as RawJobRow[] | null) ?? []).map(normalizeJobRow);
      const baseIds = rows.map((row) => row.id).filter(Boolean);

      await supabase
        .from("dashboard_match_state")
        .upsert(
          {
            user_id: user.id,
            base_job_ids: baseIds,
            ai_manager_job_ids: [],
            ats_job_ids: [],
            taxonomy_job_ids: [],
            query_meta: {
              lat,
              lon,
              radius_km: radiusKm,
              group_names: groupNames ?? [],
              category_names: normalizedOccupationFields ?? [],
            },
            base_updated_at: new Date().toISOString(),
            ai_manager_updated_at: null,
            ats_updated_at: null,
            taxonomy_updated_at: null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        );

      return NextResponse.json({
        jobs: rows,
        matchedAt: new Date().toISOString(),
        base_ready: true,
      });
    }

    if (!typedProfile.profile_vector) {
      return NextResponse.json(
        { error: "Din profil har uppdaterats och analyseras nu. Vänligen vänta 10-30 sekunder och försök igen." },
        { status: 400 }
      );
    }

    const { data: state } = await supabase
      .from("dashboard_match_state")
      .select("base_job_ids")
      .eq("user_id", user.id)
      .maybeSingle();

    const typedState = state as DashboardStateRow | null;
    const baseJobIds = typedState?.base_job_ids ?? [];
    if (baseJobIds.length === 0) {
      return NextResponse.json(
        { error: "Klicka på 'Matcha jobb' först för att bygga jobbpools-listan." },
        { status: 400 }
      );
    }

    const baseHash = hashJobIds(baseJobIds);
    const cacheKey = JSON.stringify({ baseHash, scoreMode });
    const cached = await getDashboardCache(supabase, user.id, scoreMode, cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    const cvKeywords = buildKeywords(typedProfile);
    const { data: sortedData, error: sortedError } = await supabase.rpc("sort_dashboard_pool_by_mode", {
      candidate_vector: typedProfile.profile_vector,
      cv_keywords: cvKeywords,
      job_ids: baseJobIds,
      group_names: groupNames,
      category_names: normalizedOccupationFields,
      limit_count: DASHBOARD_POOL_LIMIT,
      score_mode: scoreMode,
    });

    if (sortedError) {
      return NextResponse.json({ error: `sort_dashboard_pool_by_mode failed: ${sortedError.message}` }, { status: 500 });
    }

    const rows = ((sortedData as RawJobRow[] | null) ?? []).map(normalizeJobRow);
    const sortedIds = rows.map((row) => row.id).filter(Boolean);
    const nowIso = new Date().toISOString();

    const statePatch: Record<string, unknown> = {
      updated_at: nowIso,
    };
    if (scoreMode === "jobbnu") {
      statePatch.ai_manager_job_ids = sortedIds;
      statePatch.ai_manager_updated_at = nowIso;
    } else if (scoreMode === "ats") {
      statePatch.ats_job_ids = sortedIds;
      statePatch.ats_updated_at = nowIso;
    } else {
      statePatch.taxonomy_job_ids = sortedIds;
      statePatch.taxonomy_updated_at = nowIso;
    }

    await supabase
      .from("dashboard_match_state")
      .update(statePatch)
      .eq("user_id", user.id);

    const payload = {
      jobs: rows,
      score_mode: scoreMode,
      matchedAt: nowIso,
      base_ready: true,
    };
    await saveDashboardCache(supabase, user.id, scoreMode, cacheKey, payload);

    return NextResponse.json(payload);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("Match for-user error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
