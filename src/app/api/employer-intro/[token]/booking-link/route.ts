import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabaseAdmin"

function normalizeMeetingLink(value: unknown) {
  const trimmed = typeof value === "string" ? value.trim() : ""
  if (!trimmed) return { value: null as string | null }

  try {
    const url = new URL(trimmed)
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return { error: "Meeting link must start with http:// or https://" }
    }
    return { value: url.toString() }
  } catch {
    return { error: "Meeting link is not a valid URL" }
  }
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ token: string }> }
) {
  const { token } = await ctx.params
  const body = await req.json().catch(() => ({}))
  const normalizedMeetingLink = normalizeMeetingLink(body?.meetingLink)

  if ("error" in normalizedMeetingLink) {
    return NextResponse.json({ error: normalizedMeetingLink.error }, { status: 400 })
  }

  const admin = getSupabaseAdmin()
  const { data: link, error: linkError } = await admin
    .from("employer_intro_links")
    .select("id")
    .eq("token", token)
    .eq("status", "active")
    .maybeSingle()

  if (linkError || !link) {
    return NextResponse.json({ error: linkError?.message || "Link not found" }, { status: 404 })
  }

  const { data: latestBooking, error: latestBookingError } = await admin
    .from("employer_interview_bookings")
    .select("id")
    .eq("employer_intro_link_id", link.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (latestBookingError || !latestBooking) {
    return NextResponse.json({ error: latestBookingError?.message || "Booking not found" }, { status: 404 })
  }

  const { data: booking, error: bookingError } = await admin
    .from("employer_interview_bookings")
    .update({
      meeting_link: normalizedMeetingLink.value,
    })
    .eq("id", latestBooking.id)
    .select("id,meeting_link")
    .single()

  if (bookingError || !booking) {
    return NextResponse.json({ error: bookingError?.message || "Booking not found" }, { status: 404 })
  }

  return NextResponse.json({ data: booking })
}
