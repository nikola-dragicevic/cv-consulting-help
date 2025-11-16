// app/api/match/refine/route.ts
import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabaseServer"
import { supabaseBrowser } from "@/lib/supabaseBrowser"
import { embedWish } from "@/lib/ollama"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function jsonError(message: string, status = 500) {
  console.error("[API ERROR]", message)
  return NextResponse.json({ error: message }, { status })
}

/** same minimal city fallback, in case client sends only city */
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
    // guard missing Supabase env vars early
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: "Supabase env vars missing" }, { status: 500 })
    }

    let body: any
    try {
      body = await req.json()
    } catch {
      return jsonError("Invalid JSON body", 400)
    }

    // validate required fields
    if (!body?.candidate_id) {
      return NextResponse.json({ error: "candidate_id is required" }, { status: 400 })
    }
    if (!body?.wish) {
      return NextResponse.json({ error: "wish is required" }, { status: 400 })
    }

    // 1) Fetch candidate's saved 768-dim profile vector
    const { data: cand, error: candErr } = await supabaseServer
      .from("candidate_profiles")
      .select("profile_vector, location_lat, location_lon, commute_radius_km")
      .eq("id", body.candidate_id)
      .maybeSingle()

    if (candErr) {
      console.error("candidate_profiles read error:", candErr.message)
      return NextResponse.json({ error: "Failed to read candidate profile" }, { status: 500 })
    }
    if (!cand?.profile_vector) {
      return NextResponse.json(
        { error: "No profile_vector for candidate. Run /match/init first (or persist vector)." },
        { status: 400 }
      )
    }
    const v_profile = cand.profile_vector as number[]

    // 2) Compute wish vector (768)
    const v_wish = await embedWish(body.wish)

    // 3) Geo params: prefer provided lat/lon in wish, else fall back to candidate store, else city lookup
    const geoFromWish = (typeof body.wish.lat === "number" && typeof body.wish.lon === "number")
      ? { lat: body.wish.lat, lon: body.wish.lon, county: body.wish.county_code ?? null, metro: null as string | null }
      : null
    const geo =
      geoFromWish ??
      (cand.location_lat && cand.location_lon
        ? { lat: cand.location_lat as number, lon: cand.location_lon as number, county: null as string | null, metro: null as string | null }
        : coerceGeo({ city: body.wish.location_city }))

    if (!geo) {
      return NextResponse.json({ error: "Missing/unknown location for refine step" }, { status: 400 })
    }

    const radiusKm = Number(body.wish.radius_km ?? cand.commute_radius_km ?? 40)

    // 4) Call RPC for re-ranked matches
    const { data, error } = await supabaseServer.rpc("match_jobs_profile_wish", {
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
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ jobs: data ?? [] })
  } catch (e: any) {
    return jsonError(e?.message ?? "Server error")
  }
}
