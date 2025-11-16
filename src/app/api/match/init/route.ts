// src/app/api/match/init/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
// IMPORTANT: Change the import from 'embeddings' to our new 'ollama' utility
import { embedProfile } from "@/lib/ollama";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ... (resten av MatchedJob-typen och jsonError-funktionen är oförändrad) ...
type MatchedJob = {
  id: string;
  headline: string;
  location: string | null;
  location_lat: number | null;
  location_lon: number | null;
  company_size: string | null;
  work_modality: string | null;
  job_url: string | null;
  webpage_url: string | null;
  s_profile: number;
};

function jsonError(message: string, status = 500) {
  console.error("[API ERROR /match/init]", message);
  return NextResponse.json({ error: message }, { status });
}

const SWEDISH_CITIES: Record<string, { lat: number; lon: number }> = {
  stockholm: { lat: 59.3293, lon: 18.0686 },
  göteborg:  { lat: 57.7089, lon: 11.9746 },
  malmö:     { lat: 55.6050, lon: 13.0038 },
  uppsala:   { lat: 59.8586, lon: 17.6389 },
};

function getGeo(body: any) {
  if (typeof body.lat === "number" && typeof body.lon === "number") {
    return { lat: body.lat, lon: body.lon };
  }
  const key = (body.city || "").trim().toLowerCase();
  return SWEDISH_CITIES[key] || null;
}


export async function POST(req: Request) {
  try {
    const body = await req.json();

    if (!body?.cv_text) {
      return jsonError("cv_text is required", 400);
    }

    const geo = getGeo(body);
    if (!geo) {
      return jsonError("Unknown city or missing lat/lon", 400);
    }

    const radiusKm = Number(body.radius_km ?? 40);
    if (!Number.isFinite(radiusKm) || radiusKm <= 0) {
      return jsonError("radius_km must be a positive number", 400);
    }

    // 1. Skapa vektor från CV-text med den nya direkta metoden
    const v_profile = await embedProfile(body.cv_text);

    // 2. Anropa RPC-funktionen
    console.log(`Searching for jobs within ${radiusKm}km of ${geo.lat}, ${geo.lon}`);
    
    const { data, error } = await supabaseServer.rpc('match_jobs_initial', {
      v_profile: v_profile,
      u_lat: geo.lat,
      u_lon: geo.lon,
      radius_km: radiusKm,
      top_k: 20
    });

    if (error) {
      console.error("RPC error (match_jobs_initial):", error);
      return jsonError(`Database RPC error: ${error.message}`);
    }
    
    const jobs = data as MatchedJob[] | null;

    // 3. Formatera och returnera svaret
    const formattedJobs = (jobs || []).map((job) => ({
      ...job,
      s_wish: null,
      final_score: job.s_profile,
    }));

    return NextResponse.json({ jobs: formattedJobs });

  } catch (e: any) {
    console.error("Fatal error in /match/init:", e.message);
    // Return the specific error message from the python script if available
    return jsonError(e?.message || "Server error");
  }
}