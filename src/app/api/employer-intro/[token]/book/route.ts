import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

function getSupabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!)
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ token: string }> }
) {
  const { token } = await ctx.params
  const body = await req.json().catch(() => ({}))
  const slotId = typeof body?.slotId === "string" ? body.slotId.trim() : ""
  const acceptanceId = typeof body?.acceptanceId === "string" ? body.acceptanceId.trim() : ""
  const companyName = typeof body?.companyName === "string" ? body.companyName.trim() : ""
  const contactName = typeof body?.contactName === "string" ? body.contactName.trim() : ""
  const contactEmail = typeof body?.contactEmail === "string" ? body.contactEmail.trim() : ""
  const contactPhone = typeof body?.contactPhone === "string" ? body.contactPhone.trim() : ""

  if (!slotId || !acceptanceId || !companyName || !contactName || !contactEmail) {
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
  if (slot.is_booked) {
    return NextResponse.json({ error: "Slot already booked" }, { status: 409 })
  }
  if (slot.candidate_profile_id !== link.candidate_profile_id) {
    return NextResponse.json({ error: "Slot does not belong to this candidate" }, { status: 400 })
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
      start_time: slot.start_time,
      end_time: slot.end_time,
      status: "confirmed",
    })
    .select("id,booking_date,start_time,end_time,status")
    .single()

  if (bookingError) {
    return NextResponse.json({ error: bookingError.message }, { status: 500 })
  }

  const { error: slotUpdateError } = await admin
    .from("candidate_interview_slots")
    .update({
      is_booked: true,
      booked_at: new Date().toISOString(),
      booking_reference: booking.id,
    })
    .eq("id", slot.id)
    .eq("is_booked", false)

  if (slotUpdateError) {
    return NextResponse.json({ error: slotUpdateError.message }, { status: 500 })
  }

  return NextResponse.json({ data: booking })
}
