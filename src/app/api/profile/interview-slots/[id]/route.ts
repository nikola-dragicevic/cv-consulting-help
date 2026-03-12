import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getServerSupabase } from "@/lib/supabaseServer"

function getSupabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!)
}

async function getCandidateProfileId(userId: string) {
  const admin = getSupabaseAdmin()
  const { data, error } = await admin
    .from("candidate_profiles")
    .select("id")
    .eq("user_id", userId)
    .single()

  if (error || !data?.id) {
    throw new Error("Candidate profile not found")
  }

  return data.id as string
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const supabase = await getServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { id } = await ctx.params
    const candidateProfileId = await getCandidateProfileId(user.id)
    const admin = getSupabaseAdmin()
    const { error } = await admin
      .from("candidate_interview_slots")
      .delete()
      .eq("id", id)
      .eq("candidate_profile_id", candidateProfileId)

    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
