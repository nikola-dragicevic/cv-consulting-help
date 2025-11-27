// app/api/match/refine/route.ts
import { NextResponse } from "next/server"
import { getServerSupabase } from "@/lib/supabaseServer" // Correct import
import { createClient } from "@supabase/supabase-js"     // Correct import
import { embedWish, embedProfile } from "@/lib/ollama"  // <-- Added embedProfile

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function jsonError(message: string, status = 500) {
  console.error("[API ERROR /match/refine]", message)
  return NextResponse.json({ error: message }, { status })
}

const CITY_FALLBACK: Record<string, { lat: number; lon: number; county?: string; metro?: string }> = {
  stockholm: { lat: 59.3293, lon: 18.0686, county: "01", metro: "stockholm" },
  göteborg:  { lat: 57.7089, lon: 11.9746, county: "14", metro: "goteborg" },
  goteborg:  { lat: 57.7089, lon: 11.9746, county: "14", metro: "goteborg" },
  malmö:     { lat: 55.6050, lon: 13.0038, county: "12", metro: "malmo" },
  malmo:     { lat: 55.6050, lon: 13.0038, county: "12", metro: "malmo" },
  uppsala:   { lat: 59.8586, lon: 17.6389, county: "03", metro: "uppsala" },
  bålsta:    { lat: 59.5692, lon: 17.5277, county: "03", metro: "stockholm" },
  balsta:    { lat: 59.5692, lon: 17.5277, county: "03", metro: "stockholm" },
}

function coerceGeo(input: { city?: string; lat?: number; lon?: number; county_code?: string | null }) {
  if (typeof input.lat === "number" && typeof input.lon === "number") {
    return { lat: input.lat, lon: input.lon, county: input.county_code ?? null, metro: null as string | null }
  }
  const key = (input.city || "").trim().toLowerCase()
  const f = CITY_FALLBACK[key]
  if (f) return { lat: f.lat, lon: f.lon, county: input.county_code ?? f.county ?? null, metro: f.metro ?? null }
  return null
}

export async function POST(req: Request) {
  try {
    // 1. Create a new SERVICE ROLE client for backend actions
    const supabaseService = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY! // Use the Service Key!
    );

    let body: any
    try {
      body = await req.json()
    } catch {
      return jsonError("Invalid JSON body", 400)
    }

    // 2. Validate required fields
    if (!body?.candidate_id) {
      return jsonError("candidate_id is required", 400)
    }
    if (!body?.wish) {
      return jsonError("wish is required", 400)
    }

    // 3. Get the Profile Vector (v_profile)
    let v_profile: number[];
    let cand_geo: { lat: number | null, lon: number | null, radius: number | null } = { lat: null, lon: null, radius: null };

    if (body.candidate_id === "demo-local" && body.cv_text) {
      // ANONYMOUS USER: Generate vector from cv_text
      console.log("Refining for anonymous user with cv_text.");
      v_profile = await embedProfile(body.cv_text);
      // cand_geo remains null, API will rely on wish_geo

    } else if (body.candidate_id !== "demo-local") {
      // LOGGED-IN USER: Fetch vector from DB
      console.log(`Refining for logged-in user: ${body.candidate_id}`);
      
      // --- THIS IS THE FIX ---
      // Query on `user_id` instead of `id`
      const { data: cand, error: candErr } = await supabaseService
        .from("candidate_profiles")
        .select("profile_vector, location_lat, location_lon, commute_radius_km")
        .eq("user_id", body.candidate_id) // <-- THE FIX
        .maybeSingle()
      // --- END FIX ---

      if (candErr) {
        console.error("candidate_profiles read error:", candErr.message)
        return jsonError("Failed to read candidate profile");
      }
      if (!cand?.profile_vector) {
        // This error is correct if the vector is still null
        return jsonError("Ditt CV analyseras fortfarande. Klicka 'Hitta matchningar' först.", 400);
      }
      
      v_profile = cand.profile_vector as number[]
      cand_geo = { lat: cand.location_lat, lon: cand.location_lon, radius: cand.commute_radius_km };

    } else {
      // Error case: Anonymous user with no cv_text
      return jsonError("Refine requires a logged-in user or cv_text.", 400);
    }

    // 4. Compute wish vector
    const v_wish = await embedWish(body.wish)

    // 5. Determine Geo parameters
    const geoFromWish = (typeof body.wish.lat === "number" && typeof body.wish.lon === "number")
      ? { lat: body.wish.lat, lon: body.wish.lon, county: body.wish.county_code ?? null, metro: null as string | null }
      : null
      
    const geo =
      geoFromWish ??
      (cand_geo.lat && cand_geo.lon
        ? { lat: cand_geo.lat as number, lon: cand_geo.lon as number, county: null as string | null, metro: null as string | null }
        : coerceGeo({ city: body.wish.location_city })) // Fallback

    if (!geo) {
      return jsonError("Missing/unknown location for refine step", 400)
    }

    const radiusKm = Number(body.wish.radius_km ?? cand_geo.radius ?? 40)
    
    // 6. Call RPC for re-ranked matches
    const { data, error } = await supabaseService.rpc("match_jobs_profile_wish", {
      v_profile,
      v_wish,
      u_lat: geo.lat,
      u_lon: geo.lon,
      radius_km: radiusKm,
      metro: geo.metro,
      county: geo.county,
      remote_boost: !!body.wish.remoteBoost,
      p_top_k: 50,
    })

    if (error) {
      console.error("RPC error:", error)
      return jsonError(error.message, 500)
    }

    return NextResponse.json({ jobs: data ?? [] })
  } catch (e: any) {
    return jsonError(e?.message ?? "Server error")
  }
}