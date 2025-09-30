// app/api/match/init/route.ts
import { NextResponse } from "next/server"
import { supabaseServer } from "@/lib/supabaseServer"
import { embedProfile } from "@/lib/embeddings"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function jsonError(message: string, status = 500) {
  console.error("[API ERROR]", message)
  return NextResponse.json({ error: message }, { status })
}

const SWEDISH_CITIES: Record<string, { lat: number; lon: number; county?: string; metro?: string }> = {
  stockholm: { lat: 59.3293, lon: 18.0686, county: "01", metro: "stockholm" },
  göteborg:  { lat: 57.7089, lon: 11.9746, county: "14", metro: "goteborg" },
  goteborg:  { lat: 57.7089, lon: 11.9746, county: "14", metro: "goteborg" },
  malmö:     { lat: 55.6050, lon: 13.0038, county: "12", metro: "malmo" },
  malmo:     { lat: 55.6050, lon: 13.0038, county: "12", metro: "malmo" },
  uppsala:   { lat: 59.8586, lon: 17.6389, county: "03", metro: "uppsala" },
  bålsta:    { lat: 59.5692, lon: 17.5277, county: "03", metro: "stockholm" },
  balsta:    { lat: 59.5692, lon: 17.5277, county: "03", metro: "stockholm" },
  linköping: { lat: 58.4108, lon: 15.6214, county: "05", metro: "linkoping" },
  örebro:    { lat: 59.2741, lon: 15.2066, county: "18", metro: "orebro" },
  västerås:  { lat: 59.6162, lon: 16.5528, county: "19", metro: "vasteras" },
  jönköping: { lat: 57.7826, lon: 14.1618, county: "06", metro: "jonkoping" },
  norrköping: { lat: 58.5877, lon: 16.1924, county: "05", metro: "norrkoping" },
  lund:      { lat: 55.7047, lon: 13.1910, county: "12", metro: "malmo" },
  umeå:      { lat: 63.8258, lon: 20.2630, county: "24", metro: "umea" },
  gävle:     { lat: 60.6749, lon: 17.1413, county: "21", metro: "gavle" },
  borås:     { lat: 57.7210, lon: 12.9401, county: "14", metro: "boras" },
  eskilstuna: { lat: 59.3706, lon: 16.5077, county: "04", metro: "eskilstuna" },
}

function coerceGeo(input: { city?: string; lat?: number; lon?: number; county_code?: string | null }) {
  if (typeof input.lat === "number" && typeof input.lon === "number") {
    return { lat: input.lat, lon: input.lon, county: input.county_code ?? null, metro: null as string | null }
  }
  const key = (input.city || "").trim().toLowerCase()
  const f = SWEDISH_CITIES[key]
  if (f) return { lat: f.lat, lon: f.lon, county: input.county_code ?? f.county ?? null, metro: f.metro ?? null }
  return null
}

function cosineSimilarity(a: number[], b: number[]) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return 0
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) {
    const va = a[i] || 0, vb = b[i] || 0
    dot += va * vb; na += va * va; nb += vb * vb
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb)
  if (!denom) return 0
  const cos = dot / denom
  return Math.max(0, Math.min(1, (cos + 1) / 2))
}

export type JobRow = {
  id: string
  headline: string
  location?: string | null
  location_lat?: number | null
  location_lon?: number | null
  company_size?: string | null
  work_modality?: string | null
  job_url?: string | null
  webpage_url?: string | null
  s_profile?: number | null
  s_wish?: number | null
  final_score?: number | null
}

export async function POST(req: Request) {
  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return jsonError("SUPABASE_SERVICE_ROLE_KEY missing", 500)
    if (!process.env.SUPABASE_URL && !process.env.NEXT_PUBLIC_SUPABASE_URL) return jsonError("SUPABASE_URL missing", 500)

    let body: any
    try { body = await req.json() } catch { return jsonError("Invalid JSON body", 400) }

    if (!body?.cv_text) return NextResponse.json({ error: "cv_text is required" }, { status: 400 })

    const geo = coerceGeo(body)
    if (!geo) return NextResponse.json({ error: "Unknown city or missing lat/lon" }, { status: 400 })

    const radiusKm = Number(body.radius_km ?? 40)
    if (!Number.isFinite(radiusKm) || radiusKm <= 0) {
      return NextResponse.json({ error: "radius_km must be a positive number" }, { status: 400 })
    }

    // 1) embed profile (768d)
    const v_profile = await embedProfile(body.cv_text)

    // 2) best-effort persist candidate profile vector (skip on quota)
    if (body.candidate_id) {
      const { error: upErr } = await supabaseServer
        .from("candidate_profiles")
        .upsert({
          id: body.candidate_id,
          profile_vector: v_profile,
          location_city: body.city ?? null,
          location_lat: geo.lat,
          location_lon: geo.lon,
          commute_radius_km: radiusKm,
          profile_json: null,
        }, { onConflict: "id" })
      if (upErr) console.warn("candidate_profiles upsert warning:", upErr.message)
    }

    // 3) fetch candidates (temporarily remove embedding requirement)
    const { data, error } = await supabaseServer
      .from("job_ads")
      .select(`
        id, headline, description_text, location, location_lat, location_lon,
        city, company_size, work_modality, job_url, webpage_url
      `)
      .not("city", "is", null)
      .limit(50) // Get more since we'll filter by geography

    if (error) return jsonError(`Direct query error: ${error.message}`, 500)

    const rows = (data ?? []) as Array<Record<string, any>>

    // Add coordinates for jobs that only have city
    const jobsWithCoords = rows.map(r => {
      let jobLat = r.location_lat
      let jobLon = r.location_lon

      // If no coordinates but has city, use city center
      if ((!jobLat || !jobLon) && r.city) {
        const cityCoords = SWEDISH_CITIES[r.city.toLowerCase().trim()]
        if (cityCoords) {
          jobLat = cityCoords.lat
          jobLon = cityCoords.lon
        }
      }

      return { ...r, job_lat: jobLat, job_lon: jobLon }
    })

    // Filter by geographic distance
    function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
      const R = 6371 // Earth's radius in kilometers
      const dLat = (lat2 - lat1) * Math.PI / 180
      const dLon = (lon2 - lon1) * Math.PI / 180
      const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                Math.sin(dLon/2) * Math.sin(dLon/2)
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
      return R * c
    }

    const nearbyJobs = jobsWithCoords
      .filter(r => r.job_lat && r.job_lon)
      .filter(r => calculateDistance(geo.lat, geo.lon, r.job_lat, r.job_lon) <= radiusKm)
      .slice(0, 10) // Limit to 10 jobs

    // Process without embeddings for now (will add back later)
    const jobsWithVectors = nearbyJobs.map(r => {
      return { row: r, vec: undefined }
    })

    // 4) Build response
    const jobs: JobRow[] = jobsWithVectors.map(({ row, vec }) => {
      const s_profile = 0.5 // Dummy score for now
      return {
        id: String(row.id),
        headline: row.headline ?? String(row.title ?? ""),
        location: row.location || row.city || null,
        location_lat: typeof row.job_lat === 'number' ? row.job_lat : null,
        location_lon: typeof row.job_lon === 'number' ? row.job_lon : null,
        company_size: row.company_size ?? null,
        work_modality: row.work_modality ?? null,
        job_url: row.job_url ?? null,
        webpage_url: row.webpage_url ?? null,
        s_profile,
        s_wish: null,
        final_score: s_profile ?? 0,
      }
    })

    return NextResponse.json({ jobs })
  } catch (e: any) {
    return jsonError(e?.message ?? "Server error (init)")
  }
}
