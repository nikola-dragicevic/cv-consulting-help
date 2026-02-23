import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { extractKeywordsFromCV } from "@/lib/categorization";

type RawJobRow = Record<string, unknown>;
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
type JobMetaRow = {
  id: string;
  location: string | null;
  location_lat: number | null;
  location_lon: number | null;
  company_size: string | null;
  work_modality: string | null;
  job_url: string | null;
  webpage_url: string | null;
};

const OCCUPATION_FIELD_ALIASES: Record<string, string[]> = {
  // Legacy/internal labels -> current job_ads labels
  Transport: ["Transport, distribution, lager"],
  "Tekniskt arbete": ["Yrken med teknisk inriktning", "Installation, drift, underhåll"],
  "Socialt arbete": ["Yrken med social inriktning"],
  "Pedagogiskt arbete": ["Pedagogik"],
};

function asNumber(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeOccupationFields(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const normalized = new Set<string>();

  for (const raw of value) {
    if (typeof raw !== "string") continue;
    const label = raw.trim();
    if (!label) continue;

    // Keep original label as-is to preserve exact matches where available.
    normalized.add(label);

    // Add mapped labels for taxonomy drift compatibility.
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

function normalizeGraniteJob(
  row: RawJobRow,
  metaById: Map<string, JobMetaRow>
) {
  const id = String(row.id ?? "");
  const meta = metaById.get(id);
  const profileScore = asNumber(row.vector_similarity ?? row.s_profile ?? row.similarity);
  const finalScore = asNumber(row.final_score ?? profileScore);

  return {
    id,
    headline: (row.title as string) ?? (row.headline as string) ?? "",
    location: meta?.location ?? (row.city as string) ?? (row.location as string) ?? null,
    location_lat: meta?.location_lat ?? asNumber(row.location_lat ?? row.lat),
    location_lon: meta?.location_lon ?? asNumber(row.location_lon ?? row.lon),
    company_size: meta?.company_size ?? null,
    work_modality: meta?.work_modality ?? null,
    job_url: meta?.job_url ?? null,
    webpage_url: meta?.webpage_url ?? null,
    s_profile: profileScore,
    s_wish: asNumber(row.s_wish),
    final_score: finalScore,
  };
}

function normalizeJob(row: RawJobRow) {
  const profileScore = asNumber(row.s_profile ?? row.similarity);
  const finalScore = asNumber(row.final_score ?? row.s_profile ?? row.similarity);
  return {
    id: String(row.id ?? ""),
    headline: (row.headline as string) ?? (row.title as string) ?? "",
    location: (row.location as string) ?? (row.city as string) ?? null,
    location_lat: asNumber(row.location_lat ?? row.lat),
    location_lon: asNumber(row.location_lon ?? row.lon),
    company_size: (row.company_size as string) ?? null,
    work_modality: (row.work_modality as string) ?? null,
    job_url: (row.job_url as string) ?? null,
    webpage_url: (row.webpage_url as string) ?? null,
    s_profile: profileScore,
    s_wish: asNumber(row.s_wish),
    final_score: finalScore,
  };
}

// Helper to create client
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

export async function POST(req: Request) {
  const supabase = await createSupabaseRouteHandlerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const body = await req.json().catch(() => ({}));

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // 1. Fetch the user's profile to get vector + filters
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

    if (!typedProfile.profile_vector) {
      return NextResponse.json(
        { error: "Din profil har uppdaterats och analyseras nu. Vänligen vänta 10-30 sekunder och försök igen." },
        { status: 400 }
      );
    }

    // Allow request payload to override profile geo (UI city picker)
    const lat = typeof body?.lat === "number" ? body.lat : typedProfile.location_lat;
    const lon = typeof body?.lon === "number" ? body.lon : typedProfile.location_lon;
    const radiusKm = Number(body?.radius_km ?? typedProfile.commute_radius_km ?? 40);
    const normalizedOccupationFields = mergeOccupationFields(
      typedProfile.primary_occupation_field,
      typedProfile.occupation_field_candidates
    );
    const cvKeywords = buildKeywords(typedProfile);

    if (typeof lat !== "number" || typeof lon !== "number") {
      return NextResponse.json(
        { error: "Plats saknas i din profil. Vänligen uppdatera din stad." },
        { status: 400 }
      );
    }

    // 2) CV-only Granite scoring (vector + keyword + category bonus)
    const granitePrimary = await supabase.rpc("match_jobs_granite", {
      candidate_vector: typedProfile.profile_vector,
      candidate_lat: lat,
      candidate_lon: lon,
      radius_m: Math.max(1, Math.round(radiusKm * 1000)),
      category_names: normalizedOccupationFields,
      cv_keywords: cvKeywords,
      limit_count: 100,
    });

    let graniteRows = (granitePrimary.data as RawJobRow[] | null) ?? null;
    if (granitePrimary.error) {
      console.warn("match_jobs_granite failed, falling back to legacy matcher:", granitePrimary.error.message);
    }

    // If category filter is too strict, keep Granite scoring but widen category gate.
    if (!granitePrimary.error && (graniteRows ?? []).length === 0 && normalizedOccupationFields) {
      const graniteBroad = await supabase.rpc("match_jobs_granite", {
        candidate_vector: typedProfile.profile_vector,
        candidate_lat: lat,
        candidate_lon: lon,
        radius_m: Math.max(1, Math.round(radiusKm * 1000)),
        category_names: null,
        cv_keywords: cvKeywords,
        limit_count: 100,
      });
      if (!graniteBroad.error) {
        graniteRows = (graniteBroad.data as RawJobRow[] | null) ?? graniteRows;
      }
    }

    if (!granitePrimary.error && (graniteRows ?? []).length > 0) {
      const ids = (graniteRows ?? []).map((row) => String(row.id ?? "")).filter(Boolean);
      const metaById = new Map<string, JobMetaRow>();

      if (ids.length > 0) {
        const { data: metaRows } = await supabase
          .from("job_ads")
          .select("id, location, location_lat, location_lon, company_size, work_modality, job_url, webpage_url")
          .in("id", ids);

        for (const row of (metaRows ?? []) as JobMetaRow[]) {
          metaById.set(String(row.id), row);
        }
      }

      const jobs = (graniteRows ?? [])
        .map((row) => normalizeGraniteJob(row, metaById))
        .slice(0, 50);
      return NextResponse.json({ jobs });
    }

    // 3) Legacy fallback chain
    const primary = await supabase.rpc("match_jobs_with_occupation_filter", {
      candidate_vector: typedProfile.profile_vector,
      candidate_lat: lat,
      candidate_lon: lon,
      radius_m: Math.max(1, Math.round(radiusKm * 1000)),
      occupation_fields: normalizedOccupationFields,
      limit_count: 50,
    });

    let rows = (primary.data as RawJobRow[] | null) ?? null;
    if (primary.error) {
      console.warn("match_jobs_with_occupation_filter failed, falling back to match_jobs_initial:", primary.error.message);

      const fallback = await supabase.rpc("match_jobs_initial", {
        v_profile: typedProfile.profile_vector,
        u_lat: lat,
        u_lon: lon,
        radius_km: radiusKm,
        top_k: 50,
        candidate_tags: typedProfile.category_tags,
        filter_occupation_fields: normalizedOccupationFields,
      });

      if (fallback.error) {
        throw new Error(
          `RPC failed: ${primary.error.message}; fallback failed: ${fallback.error.message}`
        );
      }

      rows = (fallback.data as RawJobRow[] | null) ?? [];
    }

    // If strict occupation filtering yields no rows, retry without occupation filter.
    if ((rows ?? []).length === 0 && normalizedOccupationFields) {
      const broad = await supabase.rpc("match_jobs_with_occupation_filter", {
        candidate_vector: typedProfile.profile_vector,
        candidate_lat: lat,
        candidate_lon: lon,
        radius_m: Math.max(1, Math.round(radiusKm * 1000)),
        occupation_fields: null,
        limit_count: 50,
      });

      if (!broad.error) {
        rows = (broad.data as RawJobRow[] | null) ?? rows;
      } else {
        console.warn(
          "Unfiltered fallback failed:",
          broad.error.message
        );
      }
    }

    const jobs = (rows ?? []).map(normalizeJob);
    return NextResponse.json({ jobs });
  } catch (e: any) {
    console.error("Match for-user error:", e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
