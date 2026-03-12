// src/app/api/admin/saved-jobs/route.ts
import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getServerSupabase } from "@/lib/supabaseServer"
import { isAdminOrModerator } from "@/lib/admin"

function getSupabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!)
}

export async function GET(req: Request) {
  const supabase = await getServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!isAdminOrModerator(user)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const url = new URL(req.url)
  const candidateProfileId = url.searchParams.get("candidateProfileId")?.trim() || null
  const admin = getSupabaseAdmin()
  let query = admin
    .from("admin_saved_jobs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500)

  if (candidateProfileId) {
    query = query.eq("candidate_profile_id", candidateProfileId)
  }

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data || [] })
}

export async function POST(req: Request) {
  const supabase = await getServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!isAdminOrModerator(user)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()

  if (!body.jobId) return NextResponse.json({ error: "jobId is required" }, { status: 400 })

  const admin = getSupabaseAdmin()

  if (body.candidateProfileId) {
    const { data: existing, error: existingError } = await admin
      .from("admin_saved_jobs")
      .select("*")
      .eq("candidate_profile_id", body.candidateProfileId)
      .eq("job_id", body.jobId)
      .maybeSingle()

    if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 })
    if (existing) return NextResponse.json({ data: existing, existing: true })
  }

  const { data, error } = await admin
    .from("admin_saved_jobs")
    .insert({
      candidate_label: body.candidateLabel || "Okänd kandidat",
      candidate_profile_id: body.candidateProfileId || null,
      job_id: body.jobId,
      headline: body.headline || null,
      company: body.company || null,
      city: body.city || null,
      distance_km: body.distanceKm != null ? body.distanceKm : null,
      webpage_url: body.webpageUrl || null,
      occupation_group_label: body.occupationGroupLabel || null,
      notes: body.notes || null,
      search_mode: body.searchMode || null,
      search_keyword: body.searchKeyword || null,
      search_address: body.searchAddress || null,
      search_radius_km: body.searchRadiusKm != null ? body.searchRadiusKm : null,
      candidate_cv_text: body.candidateCvText || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
