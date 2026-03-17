import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabaseAdmin"
import { getClientIp } from "@/lib/outreach"

function toMinutes(timeValue: string) {
  const [hours, minutes] = timeValue.slice(0, 5).split(":").map(Number)
  return hours * 60 + minutes
}

function overlaps(startA: number, endA: number, startB: number, endB: number) {
  return startA < endB && endA > startB
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ token: string }> }
) {
  const { token } = await ctx.params
  const body = await req.json().catch(() => ({}))
  const slotId = typeof body?.slotId === "string" ? body.slotId.trim() : ""
  const startTime = typeof body?.startTime === "string" ? body.startTime.trim() : ""
  const endTime = typeof body?.endTime === "string" ? body.endTime.trim() : ""
  const acceptanceId = typeof body?.acceptanceId === "string" ? body.acceptanceId.trim() : ""
  const companyName = typeof body?.companyName === "string" ? body.companyName.trim() : ""
  const contactName = typeof body?.contactName === "string" ? body.contactName.trim() : ""
  const contactEmail = typeof body?.contactEmail === "string" ? body.contactEmail.trim() : ""
  const contactPhone = typeof body?.contactPhone === "string" ? body.contactPhone.trim() : ""

  if (!slotId || !startTime || !endTime || !acceptanceId || !companyName || !contactName || !contactEmail) {
    return NextResponse.json({ error: "Missing booking fields" }, { status: 400 })
  }

  const admin = getSupabaseAdmin()
  const { data: link, error: linkError } = await admin
    .from("employer_intro_links")
    .select("id,admin_saved_job_id,candidate_profile_id,status")
    .eq("token", token)
    .eq("status", "active")
    .single()

  if (linkError || !link) {
    return NextResponse.json({ error: linkError?.message || "Link not found" }, { status: 404 })
  }

  const { data: slot, error: slotError } = await admin
    .from("candidate_interview_slots")
    .select("id,slot_date,start_time,end_time,is_booked,candidate_profile_id")
    .eq("id", slotId)
    .single()

  if (slotError || !slot) {
    return NextResponse.json({ error: slotError?.message || "Slot not found" }, { status: 404 })
  }
  if (slot.candidate_profile_id !== link.candidate_profile_id) {
    return NextResponse.json({ error: "Slot does not belong to this candidate" }, { status: 400 })
  }

  const availabilityStart = toMinutes(slot.start_time)
  const availabilityEnd = toMinutes(slot.end_time)
  const selectedStart = toMinutes(startTime)
  const selectedEnd = toMinutes(endTime)

  if (selectedEnd <= selectedStart || selectedEnd - selectedStart !== 60) {
    return NextResponse.json({ error: "Booking must be exactly 60 minutes" }, { status: 400 })
  }
  if (selectedStart < availabilityStart || selectedEnd > availabilityEnd) {
    return NextResponse.json({ error: "Selected time is outside candidate availability" }, { status: 400 })
  }

  const { data: existingOverlap, error: overlapError } = await admin
    .from("employer_interview_bookings")
    .select("id,start_time,end_time")
    .eq("candidate_slot_id", slot.id)
    .eq("booking_date", slot.slot_date)

  if (overlapError) {
    return NextResponse.json({ error: overlapError.message }, { status: 500 })
  }

  const hasOverlap = (existingOverlap || []).some((booking) =>
    overlaps(selectedStart, selectedEnd, toMinutes(booking.start_time), toMinutes(booking.end_time))
  )
  if (hasOverlap) {
    return NextResponse.json({ error: "That interview time has already been booked" }, { status: 409 })
  }

  const { data: booking, error: bookingError } = await admin
    .from("employer_interview_bookings")
    .insert({
      employer_intro_link_id: link.id,
      candidate_profile_id: link.candidate_profile_id,
      admin_saved_job_id: link.admin_saved_job_id,
      candidate_slot_id: slot.id,
      acceptance_id: acceptanceId,
      company_name: companyName,
      contact_name: contactName,
      contact_email: contactEmail,
      contact_phone: contactPhone || null,
      booking_date: slot.slot_date,
      start_time: startTime,
      end_time: endTime,
      status: "confirmed",
      admin_followup_status: "booked",
    })
    .select("id,booking_date,start_time,end_time,status,created_at")
    .single()

  if (bookingError) {
    return NextResponse.json({ error: bookingError.message }, { status: 500 })
  }

  await admin.from("employer_intro_page_events").insert({
    employer_intro_link_id: link.id,
    admin_saved_job_id: link.admin_saved_job_id,
    candidate_profile_id: link.candidate_profile_id,
    acceptance_id: acceptanceId,
    booking_id: booking.id,
    event_type: "booking_completed",
    occurred_at: booking.created_at || new Date().toISOString(),
    ip_address: getClientIp(req),
    user_agent: req.headers.get("user-agent"),
    referrer: req.headers.get("referer"),
    metadata: {
      companyName,
      contactEmail,
      slotId: slot.id,
    },
  })

  return NextResponse.json({ data: booking })
}
