import { NextResponse } from "next/server"
import { getServerSupabase } from "@/lib/supabaseServer"
import { triggerProfileVectorization } from "@/lib/profileVectorization"

export const runtime = "nodejs"

export async function GET() {
  const supabase = await getServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { data, error } = await supabase
    .from("candidate_profiles")
    .select("vector_generation_status,vector_generation_requested_at,vector_generation_completed_at,vector_generation_last_error,vector_generation_attempts,profile_vector")
    .eq("user_id", user.id)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const { data: matchState, error: matchStateError } = await supabase
    .from("candidate_match_state")
    .select("status,last_error,last_full_refresh_at,last_incremental_refresh_at,last_pool_size,saved_job_count")
    .eq("user_id", user.id)
    .maybeSingle()

  if (matchStateError && !matchStateError.message.includes("does not exist") && !matchStateError.message.includes("schema cache")) {
    return NextResponse.json({ error: matchStateError.message }, { status: 500 })
  }

  const hasProfileVector =
    Array.isArray(data?.profile_vector)
      ? data.profile_vector.length > 0
      : typeof data?.profile_vector === "string"
        ? Boolean(data.profile_vector.trim() && data.profile_vector.trim() !== "[]")
        : false

  const rawMatchStatus = matchState?.status || null
  const rawPoolSize = typeof matchState?.last_pool_size === "number" ? matchState.last_pool_size : 0
  const rawSavedCount = typeof matchState?.saved_job_count === "number" ? matchState.saved_job_count : 0

  const progress = {
    step1ProfileReady: hasProfileVector,
    step2SemanticPoolReady: ["semantic_pool_ready", "saving_matches", "success"].includes(rawMatchStatus || ""),
    step3SavedMatchesReady: rawMatchStatus === "success" && rawSavedCount > 0,
    poolSize: rawPoolSize,
    savedCount: rawSavedCount,
    matchStatus: rawMatchStatus,
    matchLastError: matchState?.last_error || null,
    lastFullRefreshAt: matchState?.last_full_refresh_at || null,
    lastIncrementalRefreshAt: matchState?.last_incremental_refresh_at || null,
  }

  return NextResponse.json({
    data: {
      status: data?.vector_generation_status || "idle",
      requestedAt: data?.vector_generation_requested_at || null,
      completedAt: data?.vector_generation_completed_at || null,
      lastError: data?.vector_generation_last_error || null,
      attempts: data?.vector_generation_attempts || 0,
      progress,
    },
  })
}

export async function POST() {
  const supabase = await getServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { data: profile, error } = await supabase
    .from("candidate_profiles")
    .select("candidate_text_vector")
    .eq("user_id", user.id)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await supabase
    .from("candidate_profiles")
    .update({
      vector_generation_status: "pending",
      vector_generation_requested_at: new Date().toISOString(),
      vector_generation_completed_at: null,
      vector_generation_last_error: null,
    })
    .eq("user_id", user.id)

  triggerProfileVectorization(user.id, typeof profile?.candidate_text_vector === "string" ? profile.candidate_text_vector : "").catch(
    async (err) => {
      await supabase
        .from("candidate_profiles")
        .update({
          vector_generation_status: "failed",
          vector_generation_completed_at: new Date().toISOString(),
          vector_generation_last_error: err instanceof Error ? err.message : "Retry trigger failed",
        })
        .eq("user_id", user.id)
    }
  )

  return NextResponse.json({ ok: true })
}
