// src/app/api/admin/cv-match/route.ts
// Two search modes:
//  "semantic" — fetch_dashboard_taxonomy_pool + sort_dashboard_pool_by_mode (vector + keyword scoring)
//  "keyword"  — direct geo bbox + ILIKE hard filter + optional category group filter

import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getServerSupabase } from "@/lib/supabaseServer"
import { isAdminOrModerator } from "@/lib/admin"
import { geocodeAddress } from "@/lib/geocoder"
import { cityToGeo } from "@/lib/city-geo"
import { embedProfile } from "@/lib/ollama"
import { extractKeywordsFromCV } from "@/lib/categorization"

export const runtime = "nodejs"
export const maxDuration = 60

function getSupabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!)
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

async function extractAddressFromCv(cvText: string): Promise<{ address: string; keywords: string }> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return { address: "", keywords: "" }
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 200,
        temperature: 0,
        messages: [
          {
            role: "user",
            content: `Analysera detta CV och extrahera:
1. Personens ort/stad i Sverige (bara orten, t.ex. "Stockholm")
2. Deras yrkestitel eller huvudkompetens (max 3 ord, t.ex. "elektriker")

Svara ENBART med JSON:
{"address":"[ort]","keywords":"[yrkestitel]"}

CV-text:
${cvText.slice(0, 4000)}`,
          },
        ],
      }),
    })
    if (!res.ok) return { address: "", keywords: "" }
    const data = await res.json()
    const text = (data.content?.[0]?.text ?? "").trim()
    const match = text.match(/\{[^}]+\}/)
    if (!match) return { address: "", keywords: "" }
    const parsed = JSON.parse(match[0])
    return {
      address: typeof parsed.address === "string" ? parsed.address.trim() : "",
      keywords: typeof parsed.keywords === "string" ? parsed.keywords.trim() : "",
    }
  } catch {
    return { address: "", keywords: "" }
  }
}

async function resolveGeo(address: string): Promise<{ lat: number; lon: number } | null> {
  const geocoded = await geocodeAddress(address, "se")
  if (geocoded) return { lat: geocoded.lat, lon: geocoded.lon }
  return cityToGeo(address) ?? null
}

function findKeywordHits(
  textParts: Array<string | null | undefined>,
  keywords: string[]
): string[] {
  if (keywords.length === 0) return []
  const haystack = textParts
    .filter(Boolean)
    .join("\n")
    .toLocaleLowerCase("sv-SE")
  const hits = new Set<string>()

  for (const keyword of keywords) {
    const normalized = keyword.trim()
    if (!normalized) continue
    if (haystack.includes(normalized.toLocaleLowerCase("sv-SE"))) {
      hits.add(normalized)
    }
  }

  return Array.from(hits)
}

export async function POST(req: Request) {
  const supabase = await getServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!isAdminOrModerator(user)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json()
  const searchMode: "semantic" | "keyword" = body.searchMode === "keyword" ? "keyword" : "semantic"
  const cvText: string = (body.cvText ?? "").trim()
  const candidateProfileId: string | null = body.candidateProfileId ?? null
  let address: string = (body.address ?? "").trim()
  const keywords: string = (body.keywords ?? "").trim()
  // group_names → occupation_group_label filter (from candidate.category_tags)
  const groupNames: string[] = Array.isArray(body.groupNames)
    ? (body.groupNames as string[]).filter(Boolean)
    : []
  // radiusKm: use what the client sends; will be overridden by candidate's commute_radius if client sends 0/default
  const bodyRadius = Number(body.radiusKm)
  const radiusKm: number = Math.max(1, Math.min(500, bodyRadius > 0 ? bodyRadius : 50))
  const limit: number = Math.max(1, Math.min(200, Number(body.limit) || 100))

  let extractedAddress = ""
  let extractedKeywords = ""

  const supabaseAdmin = getSupabaseAdmin()

  // ─── Load candidate profile if provided ────────────────────────────────────
  type CandidateProfile = {
    profile_vector: number[] | null
    candidate_text_vector: string | null
    location_lat: number | null
    location_lon: number | null
    commute_radius_km: number | null
    category_tags: string[] | null
    primary_occupation_field: string[] | null
    occupation_field_candidates: string[] | null
  }
  let candidateProfile: CandidateProfile | null = null

  if (candidateProfileId) {
    const { data } = await supabaseAdmin
      .from("candidate_profiles")
      .select(
        "profile_vector,candidate_text_vector,location_lat,location_lon,commute_radius_km,category_tags,primary_occupation_field,occupation_field_candidates"
      )
      .eq("id", candidateProfileId)
      .single()
    candidateProfile = data as CandidateProfile | null
  }

  const effectiveCvText = cvText || candidateProfile?.candidate_text_vector?.trim() || ""
  const effectiveGroupNames = groupNames.length > 0
    ? groupNames
    : Array.isArray(candidateProfile?.category_tags)
      ? candidateProfile.category_tags.filter(Boolean)
      : []
  const effectiveRadiusKm =
    bodyRadius > 0
      ? radiusKm
      : Math.max(1, Math.min(500, Number(candidateProfile?.commute_radius_km) || radiusKm))

  // Resolve geo: explicit address wins, otherwise use candidate's stored coordinates or CV-extracted address
  let geo: { lat: number; lon: number } | null = null

  if (address) {
    geo = await resolveGeo(address)
    if (!geo) {
      return NextResponse.json(
        { error: `Kunde inte geokoda adressen: "${address}"` },
        { status: 400 }
      )
    }
  } else if (candidateProfile?.location_lat && candidateProfile?.location_lon) {
    geo = { lat: candidateProfile.location_lat, lon: candidateProfile.location_lon }
  } else {
    // Auto-extract address from CV text if needed
    if (effectiveCvText && !address) {
      const extracted = await extractAddressFromCv(effectiveCvText)
      extractedAddress = extracted.address
      extractedKeywords = extracted.keywords
      address = extracted.address
    }
    if (!address) {
      return NextResponse.json(
        { error: "Adress krävs – ange manuellt eller inkludera i CV-texten" },
        { status: 400 }
      )
    }
    geo = await resolveGeo(address)
    if (!geo) {
      return NextResponse.json(
        { error: `Kunde inte geokoda adressen: "${address}"` },
        { status: 400 }
      )
    }
  }

  // ─── SEMANTIC MODE ────────────────────────────────────────────────────────
  if (searchMode === "semantic") {
    let profileVector: number[] = []

    if (candidateProfile) {
      if (candidateProfile.profile_vector) {
        profileVector = candidateProfile.profile_vector as number[]
      }
    }

    if (profileVector.length === 0 && effectiveCvText) {
      profileVector = await embedProfile(effectiveCvText)
    }

    if (profileVector.length === 0) {
      return NextResponse.json(
        {
          error:
            "Kunde inte skapa sökvektorn. Klistra in CV-text eller välj kandidat med lagrat profilvektorn.",
        },
        { status: 400 }
      )
    }

    const radiusM = Math.round(effectiveRadiusKm * 1000)

    const inferredKeywords = keywords
      ? keywords
          .split(",")
          .map((k) => k.trim())
          .filter(Boolean)
      : extractKeywordsFromCV(effectiveCvText).slice(0, 12)

    const cvKeywords =
      inferredKeywords
        .slice(0, 15) || null

    // Step 1: Fetch taxonomy pool
    const { data: poolData, error: poolError } = await supabaseAdmin.rpc(
      "fetch_dashboard_taxonomy_pool",
      {
        candidate_lat: geo.lat,
        candidate_lon: geo.lon,
        radius_m: radiusM,
        group_names: effectiveGroupNames.length > 0 ? effectiveGroupNames : null,
        category_names: null,
        limit_count: 2000,
      }
    )

    if (poolError) {
      console.error("[cv-match] pool error:", poolError)
      return NextResponse.json({ error: `Pool-fel: ${poolError.message}` }, { status: 500 })
    }

    type PoolRow = { id: string }
    const poolJobs = (poolData as PoolRow[] | null) ?? []
    const jobIds = poolJobs.map((j) => j.id)

    if (jobIds.length === 0) {
      return NextResponse.json({
        results: [],
        total: 0,
        searchMode: "semantic",
        address,
        center: geo,
        extractedAddress,
        extractedKeywords,
        poolSize: 0,
        usedKeywords: cvKeywords,
      })
    }

    // Step 2: Sort pool by mode
    const { data: sortedData, error: sortError } = await supabaseAdmin.rpc(
      "sort_dashboard_pool_by_mode",
      {
        candidate_vector: profileVector,
        cv_keywords: cvKeywords.length > 0 ? cvKeywords : null,
        job_ids: jobIds,
        group_names: effectiveGroupNames.length > 0 ? effectiveGroupNames : null,
        category_names: null,
        limit_count: limit,
        score_mode: "jobbnu",
      }
    )

    if (sortError) {
      console.error("[cv-match] sort error:", sortError)
      return NextResponse.json({ error: `Sort-fel: ${sortError.message}` }, { status: 500 })
    }

    type SortRow = {
      id: string
      title: string
      company: string | null
      city: string | null
      job_url: string | null
      webpage_url: string | null
      occupation_field_label: string | null
      occupation_group_label: string | null
      occupation_label: string | null
      display_score: number | null
      jobbnu_score: number | null
      vector_similarity: number | null
      keyword_hit_rate: number | null
      keyword_miss_rate: number | null
      description: string | null
    }

    const sortedRows = (sortedData as SortRow[] | null) ?? []
    const sortedIds = sortedRows.map((job) => job.id).filter(Boolean)
    const { data: geoRows } = await supabaseAdmin
      .from("job_ads")
      .select("id,location_lat,location_lon,lat,lon")
      .in("id", sortedIds)

    const geoById = new Map<string, { lat: number | null; lon: number | null }>()
    for (const row of geoRows ?? []) {
      geoById.set(String(row.id), {
        lat: typeof row.location_lat === "number" ? row.location_lat : row.lat ?? null,
        lon: typeof row.location_lon === "number" ? row.location_lon : row.lon ?? null,
      })
    }

    const results = sortedRows
      .map((job) => {
        const jobGeo = geoById.get(job.id)
        const distanceKm =
          jobGeo && typeof jobGeo.lat === "number" && typeof jobGeo.lon === "number"
            ? haversineKm(geo.lat, geo.lon, jobGeo.lat, jobGeo.lon)
            : null

        return {
          id: job.id,
          headline: job.title,
          company: job.company,
          city: job.city,
          occupation_field_label: job.occupation_field_label,
          occupation_group_label: job.occupation_group_label,
          occupation_label: job.occupation_label,
          webpage_url: job.webpage_url ?? job.job_url,
          distance_km: distanceKm,
          display_score: job.display_score,
          jobbnu_score: job.jobbnu_score,
          vector_similarity: job.vector_similarity,
          keyword_hit_rate: job.keyword_hit_rate,
          keyword_miss_rate: job.keyword_miss_rate,
          keyword_hits: findKeywordHits(
            [job.title, job.description, job.occupation_label, job.occupation_group_label],
            cvKeywords ?? []
          ),
        }
      })
      .filter((job) => job.distance_km == null || job.distance_km <= effectiveRadiusKm)

    return NextResponse.json({
      results,
      total: results.length,
      searchMode: "semantic",
      address,
      center: geo,
      extractedAddress,
      extractedKeywords,
      poolSize: jobIds.length,
      radiusKm: effectiveRadiusKm,
      usedKeywords: cvKeywords,
    })
  }

  // ─── KEYWORD HARD FILTER MODE ─────────────────────────────────────────────
  if (!keywords) {
    return NextResponse.json(
      { error: "Yrke/nyckelord krävs för yrkes-sökning" },
      { status: 400 }
    )
  }

  const latDelta = effectiveRadiusKm / 111
  const lonDelta = effectiveRadiusKm / (111 * Math.cos((geo.lat * Math.PI) / 180))

  // Build Supabase query
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = supabaseAdmin
    .from("job_ads")
    .select(
      "id,headline,company,city,occupation_field_label,occupation_group_label,occupation_label,description_text,location_lat,location_lon,webpage_url,application_deadline"
    )
    .gte("location_lat", geo.lat - latDelta)
    .lte("location_lat", geo.lat + latDelta)
    .gte("location_lon", geo.lon - lonDelta)
    .lte("location_lon", geo.lon + lonDelta)
    .not("location_lat", "is", null)
    .not("location_lon", "is", null)
    .eq("is_active", true)
    .limit(3000)

  // Apply category group filter to narrow search scope
  if (effectiveGroupNames.length > 0) {
    query = query.in("occupation_group_label", effectiveGroupNames)
  }

  const { data: jobs, error } = await query
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  type JobRow = {
    id: string
    headline: string | null
    company: string | null
    city: string | null
    occupation_field_label: string | null
    occupation_group_label: string | null
    occupation_label: string | null
    description_text: string | null
    location_lat: number
    location_lon: number
    webpage_url: string | null
    application_deadline: string | null
  }

  const keywordTerms = keywords
    .split(/[,\n]/)
    .map((term) => term.trim().toLocaleLowerCase("sv-SE"))
    .filter(Boolean)

  const results = (jobs as JobRow[])
    .filter((job) => {
      const text = [job.headline, job.occupation_label, job.occupation_group_label, job.description_text]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
      return keywordTerms.every((term) => text.includes(term))
    })
    .map((job) => ({
      id: job.id,
      headline: job.headline,
      company: job.company,
      city: job.city,
      occupation_field_label: job.occupation_field_label,
      occupation_group_label: job.occupation_group_label,
      occupation_label: job.occupation_label,
      webpage_url: job.webpage_url,
      distance_km: haversineKm(geo.lat, geo.lon, job.location_lat, job.location_lon),
      display_score: null as number | null,
      jobbnu_score: null as number | null,
      vector_similarity: null as number | null,
      keyword_hit_rate: null as number | null,
      keyword_hits: findKeywordHits(
        [job.headline, job.occupation_label, job.occupation_group_label, job.description_text],
        keywordTerms
      ),
      application_deadline: job.application_deadline,
    }))
    .filter((job) => job.distance_km <= effectiveRadiusKm)
    .sort((a, b) => a.distance_km! - b.distance_km!)
    .slice(0, limit)

  return NextResponse.json({
    results,
    total: results.length,
    searchMode: "keyword",
    address,
    keywords,
    center: geo,
    extractedAddress,
    extractedKeywords,
    radiusKm: effectiveRadiusKm,
  })
}
