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
    .select("vector_generation_status,vector_generation_requested_at,vector_generation_completed_at,vector_generation_last_error,vector_generation_attempts")
    .eq("user_id", user.id)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    data: {
      status: data?.vector_generation_status || "idle",
      requestedAt: data?.vector_generation_requested_at || null,
      completedAt: data?.vector_generation_completed_at || null,
      lastError: data?.vector_generation_last_error || null,
      attempts: data?.vector_generation_attempts || 0,
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
