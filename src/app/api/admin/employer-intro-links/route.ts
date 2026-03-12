import { randomBytes } from "crypto"
import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getServerSupabase } from "@/lib/supabaseServer"
import { isAdminOrModerator } from "@/lib/admin"

function getSupabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!)
}

function buildPublicUrl(token: string) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://jobbnu.se"
  return `${baseUrl}/employer-intro/${token}`
}

export async function GET(req: Request) {
  const supabase = await getServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!isAdminOrModerator(user)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const savedJobId = new URL(req.url).searchParams.get("savedJobId")?.trim()
  if (!savedJobId) {
    return NextResponse.json({ error: "savedJobId is required" }, { status: 400 })
  }

  const admin = getSupabaseAdmin()
  const { data, error } = await admin
    .from("employer_intro_links")
    .select("id,token,status,expires_at,created_at")
    .eq("admin_saved_job_id", savedJobId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    data: data
      ? {
          ...data,
          publicUrl: buildPublicUrl(data.token),
        }
      : null,
  })
}

export async function POST(req: Request) {
  const supabase = await getServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!isAdminOrModerator(user)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const savedJobId = typeof body?.savedJobId === "string" ? body.savedJobId.trim() : ""

  if (!savedJobId) {
    return NextResponse.json({ error: "savedJobId is required" }, { status: 400 })
  }

  const admin = getSupabaseAdmin()
  const { data: existing, error: existingError } = await admin
    .from("employer_intro_links")
    .select("id,token,status,expires_at,created_at")
    .eq("admin_saved_job_id", savedJobId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 })
  }

  if (existing?.token) {
    return NextResponse.json({
      data: {
        ...existing,
        publicUrl: buildPublicUrl(existing.token),
      },
    })
  }

  const { data: savedJob, error: savedJobError } = await admin
    .from("admin_saved_jobs")
    .select("id,candidate_profile_id,job_id")
    .eq("id", savedJobId)
    .single()

  if (savedJobError || !savedJob) {
    return NextResponse.json(
      { error: savedJobError?.message || "Saved job not found" },
      { status: 404 }
    )
  }

  const token = randomBytes(20).toString("hex")
  const { data, error } = await admin
    .from("employer_intro_links")
    .insert({
      admin_saved_job_id: savedJob.id,
      candidate_profile_id: savedJob.candidate_profile_id,
      job_id: savedJob.job_id,
      token,
      created_by_user_id: user?.id ?? null,
      status: "active",
      terms_version: "candidate_intro_terms_v1",
    })
    .select("id,token,status,expires_at,created_at")
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    data: {
      ...data,
      publicUrl: buildPublicUrl(data.token),
    },
  })
}
