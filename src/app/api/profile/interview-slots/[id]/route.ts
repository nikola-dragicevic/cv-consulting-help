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
    const profileError = new Error("Candidate profile not found")
    ;(profileError as Error & { code?: string }).code = "PROFILE_REQUIRED"
    throw profileError
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
    const { data: existingBooking, error: bookingError } = await admin
      .from("employer_interview_bookings")
      .select("id")
      .eq("candidate_slot_id", id)
      .limit(1)
      .maybeSingle()

    if (bookingError) throw bookingError
    if (existingBooking?.id) {
      return NextResponse.json(
        { error: "Intervjutiden kan inte tas bort eftersom en intervju redan är bokad på det här blocket." },
        { status: 409 }
      )
    }

    const { error } = await admin
      .from("candidate_interview_slots")
      .delete()
      .eq("id", id)
      .eq("candidate_profile_id", candidateProfileId)

    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (error) {
    const code = error instanceof Error ? (error as Error & { code?: string }).code : undefined
    return NextResponse.json(
      {
        error:
          code === "PROFILE_REQUIRED"
            ? "Spara din profil först innan du hanterar intervjutider."
            : error instanceof Error
              ? error.message
              : "Unknown error",
        code: code || null,
      },
      { status: code === "PROFILE_REQUIRED" ? 400 : 500 }
    )
  }
}
