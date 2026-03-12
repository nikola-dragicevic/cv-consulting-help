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

export async function GET() {
  const supabase = await getServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const candidateProfileId = await getCandidateProfileId(user.id)
    const admin = getSupabaseAdmin()
    const { data, error } = await admin
      .from("candidate_interview_slots")
      .select("id,slot_date,start_time,end_time,is_booked,created_at")
      .eq("candidate_profile_id", candidateProfileId)
      .order("slot_date", { ascending: true })
      .order("start_time", { ascending: true })

    if (error) throw error
    return NextResponse.json({ data: data || [] })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}

export async function POST(req: Request) {
  const supabase = await getServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const slotDate = typeof body?.slotDate === "string" ? body.slotDate : ""
  const startTime = typeof body?.startTime === "string" ? body.startTime : ""
  const endTime = typeof body?.endTime === "string" ? body.endTime : ""

  if (!slotDate || !startTime || !endTime) {
    return NextResponse.json({ error: "slotDate, startTime and endTime are required" }, { status: 400 })
  }

  try {
    const candidateProfileId = await getCandidateProfileId(user.id)
    const admin = getSupabaseAdmin()
    const { data, error } = await admin
      .from("candidate_interview_slots")
      .insert({
        candidate_profile_id: candidateProfileId,
        slot_date: slotDate,
        start_time: `${startTime}:00`,
        end_time: `${endTime}:00`,
      })
      .select("id,slot_date,start_time,end_time,is_booked,created_at")
      .single()

    if (error) throw error
    return NextResponse.json({ data })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
