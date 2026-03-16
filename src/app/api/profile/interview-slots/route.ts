import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getServerSupabase } from "@/lib/supabaseServer"

function getSupabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!)
}

function toMinutes(timeValue: string) {
  const [hours, minutes] = timeValue.split(":").map(Number)
  return hours * 60 + minutes
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
    const { data: slots, error } = await admin
      .from("candidate_interview_slots")
      .select("id,slot_date,start_time,end_time,is_booked,created_at")
      .eq("candidate_profile_id", candidateProfileId)
      .order("slot_date", { ascending: true })
      .order("start_time", { ascending: true })

    if (error) throw error

    const slotIds = (slots || []).map((slot) => slot.id)
    let bookedSlotIds = new Set<string>()

    if (slotIds.length > 0) {
      const { data: bookings, error: bookingsError } = await admin
        .from("employer_interview_bookings")
        .select("candidate_slot_id")
        .in("candidate_slot_id", slotIds)

      if (bookingsError) throw bookingsError
      bookedSlotIds = new Set(
        (bookings || [])
          .map((booking) => booking.candidate_slot_id)
          .filter((value): value is string => typeof value === "string")
      )
    }

    return NextResponse.json({
      data: (slots || []).map((slot) => ({
        ...slot,
        is_booked: Boolean(slot.is_booked) || bookedSlotIds.has(slot.id),
      })),
    })
  } catch (error) {
    const code = error instanceof Error ? (error as Error & { code?: string }).code : undefined
    return NextResponse.json(
      {
        error:
          code === "PROFILE_REQUIRED"
            ? "Spara din profil först innan du lägger till intervjutider."
            : error instanceof Error
              ? error.message
              : "Unknown error",
        code: code || null,
      },
      { status: code === "PROFILE_REQUIRED" ? 400 : 500 }
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
    const startMinutes = toMinutes(startTime)
    const endMinutes = toMinutes(endTime)

    if (endMinutes <= startMinutes) {
      return NextResponse.json({ error: "End time must be after start time" }, { status: 400 })
    }

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
    const code = error instanceof Error ? (error as Error & { code?: string }).code : undefined
    return NextResponse.json(
      {
        error:
          code === "PROFILE_REQUIRED"
            ? "Spara din profil först innan du lägger till intervjutider."
            : error instanceof Error
              ? error.message
              : "Unknown error",
        code: code || null,
      },
      { status: code === "PROFILE_REQUIRED" ? 400 : 500 }
    )
  }
}
