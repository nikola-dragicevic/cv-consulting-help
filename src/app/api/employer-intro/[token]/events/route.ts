import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabaseAdmin"
import { getClientIp } from "@/lib/outreach"

const ALLOWED_EVENT_TYPES = new Set(["accept_started", "booking_started"])

export async function POST(
  req: Request,
  ctx: { params: Promise<{ token: string }> }
) {
  const { token } = await ctx.params
  const body = await req.json().catch(() => ({}))
  const eventType = typeof body?.eventType === "string" ? body.eventType.trim() : ""
  const metadata =
    body?.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
      ? body.metadata
      : {}

  if (!ALLOWED_EVENT_TYPES.has(eventType)) {
    return NextResponse.json({ error: "Invalid event type" }, { status: 400 })
  }

  const admin = getSupabaseAdmin()
  const { data: link, error: linkError } = await admin
    .from("employer_intro_links")
    .select("id,admin_saved_job_id,candidate_profile_id,status")
    .eq("token", token)
    .eq("status", "active")
    .maybeSingle()

  if (linkError) {
    return NextResponse.json({ error: linkError.message }, { status: 500 })
  }

  if (!link) {
    return NextResponse.json({ error: "Link not found" }, { status: 404 })
  }

  const { error } = await admin.from("employer_intro_page_events").insert({
    employer_intro_link_id: link.id,
    admin_saved_job_id: link.admin_saved_job_id,
    candidate_profile_id: link.candidate_profile_id,
    event_type: eventType,
    occurred_at: new Date().toISOString(),
    ip_address: getClientIp(req),
    user_agent: req.headers.get("user-agent"),
    referrer: req.headers.get("referer"),
    metadata,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
