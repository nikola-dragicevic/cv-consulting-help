// src/app/api/match/refine/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { embedProfile } from "@/lib/ollama";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OLLAMA_URL =
  process.env.OLLAMA_URL || "http://worker:8000/api/embeddings";
const EMBEDDING_MODEL =
  process.env.EMBEDDING_MODEL || "snowflake-arctic-embed2";

async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const res = await fetch(OLLAMA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: EMBEDDING_MODEL, prompt: text }),
    });
    if (!res.ok) throw new Error(`Ollama error: ${res.status}`);
    const data = await res.json();
    return data.embedding ?? [];
  } catch (e) {
    console.error("Embedding failed:", e);
    return [];
  }
}

function jsonError(message: string, status = 500) {
  console.error("[API ERROR /match/refine]", message);
  return NextResponse.json({ error: message }, { status });
}

const CITY_FALLBACK: Record<
  string,
  { lat: number; lon: number; county?: string; metro?: string }
> = {
  stockholm: { lat: 59.3293, lon: 18.0686, county: "01", metro: "stockholm" },
  göteborg: { lat: 57.7089, lon: 11.9746, county: "14", metro: "goteborg" },
  goteborg: { lat: 57.7089, lon: 11.9746, county: "14", metro: "goteborg" },
  malmö: { lat: 55.605, lon: 13.0038, county: "12", metro: "malmo" },
  malmo: { lat: 55.605, lon: 13.0038, county: "12", metro: "malmo" },
  uppsala: { lat: 59.8586, lon: 17.6389, county: "03", metro: "uppsala" },
};

function coerceGeo(input: {
  city?: string;
  lat?: number;
  lon?: number;
  county_code?: string | null;
}) {
  if (typeof input.lat === "number" && typeof input.lon === "number") {
    return {
      lat: input.lat,
      lon: input.lon,
      county: input.county_code ?? null,
      metro: null as string | null,
    };
  }
  const key = (input.city || "").trim().toLowerCase();
  const f = CITY_FALLBACK[key];
  if (f)
    return {
      lat: f.lat,
      lon: f.lon,
      county: input.county_code ?? f.county ?? null,
      metro: f.metro ?? null,
    };
  return null;
}

export async function POST(req: Request) {
  try {
    const supabaseService = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    let body: any;
    try {
      body = await req.json();
    } catch {
      return jsonError("Invalid JSON body", 400);
    }

    if (!body?.candidate_id) return jsonError("candidate_id is required", 400);
    if (!body?.wish) return jsonError("wish is required", 400);

    // 1) Load candidate vectors + geo + tags + occupation field
    let v_profile: number[] = [];
    let candidateTags: string[] | null = null;
    let primaryOccupationField: string | null = null;

    let cand_geo: { lat: number | null; lon: number | null; radius: number | null } =
      { lat: null, lon: null, radius: null };

    if (body.candidate_id === "demo-local" && body.cv_text) {
      v_profile = await embedProfile(body.cv_text);
      candidateTags = null;
      primaryOccupationField = null;
    } else if (body.candidate_id !== "demo-local") {
      const { data: cand, error: candErr } = await supabaseService
        .from("candidate_profiles")
        .select("profile_vector, category_tags, primary_occupation_field, location_lat, location_lon, commute_radius_km")
        .eq("user_id", body.candidate_id)
        .maybeSingle();

      if (candErr || !cand?.profile_vector) {
        return jsonError(
          "Ditt CV analyseras fortfarande. Klicka 'Hitta matchningar' först.",
          400
        );
      }

      v_profile = cand.profile_vector as number[];
      candidateTags = (cand.category_tags as string[] | null) ?? null;
      primaryOccupationField = (cand.primary_occupation_field as string | null) ?? null;

      cand_geo = {
        lat: cand.location_lat,
        lon: cand.location_lon,
        radius: cand.commute_radius_km,
      };
    } else {
      return jsonError("Refine requires a logged-in user or cv_text.", 400);
    }

    // 2) Build wish text
    const wish = body.wish;
    const parts: string[] = [];

    if (wish.freeText) parts.push(`Målbild/Beskrivning: ${wish.freeText}`);
    if (wish.titles?.length) parts.push(`Önskade titlar: ${wish.titles.join(", ")}`);
    if (wish.use_skills?.length) parts.push(`Färdigheter jag vill använda: ${wish.use_skills.join(", ")}`);
    if (wish.learn_skills?.length) parts.push(`Vill lära mig: ${wish.learn_skills.join(", ")}`);
    if (wish.industries?.length) parts.push(`Branscher: ${wish.industries.join(", ")}`);
    if (wish.modality) parts.push(`Arbetssätt: ${wish.modality}`);

    const fullWishText = parts.join("\n");
    console.log("📝 Generating Wish Vector for:", fullWishText);

    // 3) Vectorize wish
    const v_wish = await generateEmbedding(fullWishText);

    // 4) Save wish info (logged-in only)
    if (body.candidate_id !== "demo-local") {
      await supabaseService
        .from("candidate_profiles")
        .update({
          wish_vector: v_wish,
          wish_text_vector: fullWishText,
        })
        .eq("user_id", body.candidate_id);
    }

    // 5) Determine geo
    const geoFromWish =
      typeof wish.lat === "number" && typeof wish.lon === "number"
        ? { lat: wish.lat, lon: wish.lon, county: wish.county_code ?? null, metro: null as string | null }
        : null;

    const geo =
      geoFromWish ??
      (cand_geo.lat && cand_geo.lon
        ? { lat: cand_geo.lat as number, lon: cand_geo.lon as number, county: null as string | null, metro: null as string | null }
        : coerceGeo({ city: wish.location_city, county_code: wish.county_code ?? null }));

    if (!geo) return jsonError("Missing/unknown location for refine step", 400);

    const radiusKm = Number(wish.radius_km ?? cand_geo.radius ?? 40);

    // 6) RPC call with occupation field hard filter
    const { data, error } = await supabaseService.rpc("match_jobs_profile_wish", {
      v_profile,
      v_wish,
      u_lat: geo.lat,
      u_lon: geo.lon,
      radius_km: radiusKm,
      metro: geo.metro,
      county: geo.county,
      remote_boost: !!wish.remoteBoost,
      p_top_k: 50,
      candidate_tags: candidateTags,
      filter_occupation_field: primaryOccupationField, // ✅ Hard filter by occupation field
    });

    if (error) {
      console.error("RPC error:", error);
      return jsonError(error.message, 500);
    }

    return NextResponse.json({ jobs: data ?? [] });
  } catch (e: any) {
    return jsonError(e?.message ?? "Server error");
  }
}
