// src/app/api/admin/saved-jobs/route.ts
import { NextResponse } from "next/server"
import { getServerSupabase } from "@/lib/supabaseServer"
import { isAdminOrModerator } from "@/lib/admin"
import { getSupabaseAdmin } from "@/lib/supabaseAdmin"

export async function GET(req: Request) {
  const supabase = await getServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!isAdminOrModerator(user)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const url = new URL(req.url)
  const candidateProfileId = url.searchParams.get("candidateProfileId")?.trim() || null
  const admin = getSupabaseAdmin()
  let query = admin
    .from("admin_saved_jobs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500)

  if (candidateProfileId) {
    query = query.eq("candidate_profile_id", candidateProfileId)
  }

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const jobs = data || []
  if (jobs.length === 0) {
    return NextResponse.json({ data: [] })
  }

  const candidateProfileIds = Array.from(
    new Set(jobs.map((job) => job.candidate_profile_id).filter((value): value is string => typeof value === "string"))
  )

  const savedJobIds = jobs.map((job) => job.id)
  const { data: introLinks, error: introLinksError } = await admin
    .from("employer_intro_links")
    .select("id,admin_saved_job_id")
    .in("admin_saved_job_id", savedJobIds)

  if (introLinksError) return NextResponse.json({ error: introLinksError.message }, { status: 500 })

  const linkIds = (introLinks || []).map((link) => link.id)

  const [{ data: messages, error: messagesError }, { data: pageEvents, error: pageEventsError }, { data: bookings, error: bookingsError }, acceptanceResult, slotResult] =
    await Promise.all([
      admin
        .from("outreach_messages")
        .select("id,admin_saved_job_id,recipient_email,subject,text_body,send_status,sent_at,created_at,first_delivered_at,opened_at,first_clicked_at,metadata")
        .in("admin_saved_job_id", savedJobIds)
        .order("created_at", { ascending: false }),
      admin
        .from("employer_intro_page_events")
        .select("admin_saved_job_id,event_type")
        .in("admin_saved_job_id", savedJobIds),
      admin
        .from("employer_interview_bookings")
        .select("admin_saved_job_id")
        .in("admin_saved_job_id", savedJobIds),
      linkIds.length > 0
        ? admin
            .from("employer_intro_acceptances")
            .select("employer_intro_link_id")
            .in("employer_intro_link_id", linkIds)
        : Promise.resolve({ data: [], error: null }),
      candidateProfileIds.length > 0
        ? admin
            .from("candidate_interview_slots")
            .select("candidate_profile_id")
            .in("candidate_profile_id", candidateProfileIds)
        : Promise.resolve({ data: [], error: null }),
    ])

  if (messagesError) return NextResponse.json({ error: messagesError.message }, { status: 500 })
  if (pageEventsError) return NextResponse.json({ error: pageEventsError.message }, { status: 500 })
  if (bookingsError) return NextResponse.json({ error: bookingsError.message }, { status: 500 })
  if (acceptanceResult.error) return NextResponse.json({ error: acceptanceResult.error.message }, { status: 500 })
  if (slotResult.error) return NextResponse.json({ error: slotResult.error.message }, { status: 500 })

  const linkToSavedJobId = new Map<string, string>()
  for (const link of introLinks || []) {
    linkToSavedJobId.set(link.id, link.admin_saved_job_id)
  }
  const slotCountByCandidateId = new Map<string, number>()
  for (const slot of slotResult.data || []) {
    if (!slot.candidate_profile_id) continue
    slotCountByCandidateId.set(slot.candidate_profile_id, (slotCountByCandidateId.get(slot.candidate_profile_id) || 0) + 1)
  }

  const summaryByJobId = new Map<string, {
    messagesSent: number
    deliveredMessages: number
    openedMessages: number
    clickedMessages: number
    pageViews: number
    acceptances: number
    bookings: number
    lastSentAt: string | null
    lastRecipient: string | null
    lastSendStatus: string | null
  }>()

  const latestMessageByJobId = new Map<string, {
    id: string
    recipient_email: string
    subject: string
    text_body: string
    send_status: string
    sent_at: string | null
    created_at: string
  }>()

  const getSummary = (savedJobId: string) => {
    if (!summaryByJobId.has(savedJobId)) {
      summaryByJobId.set(savedJobId, {
        messagesSent: 0,
        deliveredMessages: 0,
        openedMessages: 0,
        clickedMessages: 0,
        pageViews: 0,
        acceptances: 0,
        bookings: 0,
        lastSentAt: null,
        lastRecipient: null,
        lastSendStatus: null,
      })
    }
    return summaryByJobId.get(savedJobId)!
  }

  for (const message of messages || []) {
    const messageKind =
      message?.metadata && typeof message.metadata === "object" && "messageKind" in message.metadata
        ? String((message.metadata as { messageKind?: unknown }).messageKind || "")
        : ""
    if (
      messageKind === "candidate_interview_invite" ||
      messageKind === "employer_interview_followup" ||
      messageKind === "employer_booking_confirmation"
    ) {
      continue
    }

    const summary = getSummary(message.admin_saved_job_id)
    if (!latestMessageByJobId.has(message.admin_saved_job_id)) {
      latestMessageByJobId.set(message.admin_saved_job_id, message)
      summary.lastSentAt = message.sent_at || null
      summary.lastRecipient = message.recipient_email || null
      summary.lastSendStatus = message.send_status || null
    }
    if (message.send_status === "sent") summary.messagesSent += 1
    if (message.first_delivered_at) summary.deliveredMessages += 1
    if (message.opened_at) summary.openedMessages += 1
    if (message.first_clicked_at) summary.clickedMessages += 1
  }

  for (const pageEvent of pageEvents || []) {
    if (!pageEvent.admin_saved_job_id) continue
    const summary = getSummary(pageEvent.admin_saved_job_id)
    if (pageEvent.event_type === "page_view") summary.pageViews += 1
  }

  for (const acceptance of acceptanceResult.data || []) {
    const savedJobId = linkToSavedJobId.get(acceptance.employer_intro_link_id)
    if (!savedJobId) continue
    const summary = getSummary(savedJobId)
    summary.acceptances += 1
  }

  for (const booking of bookings || []) {
    if (!booking.admin_saved_job_id) continue
    const summary = getSummary(booking.admin_saved_job_id)
    summary.bookings += 1
  }

  const enrichedJobs = jobs.map((job) => ({
    ...job,
    interview_slot_count: job.candidate_profile_id ? (slotCountByCandidateId.get(job.candidate_profile_id) || 0) : 0,
    latest_outreach_message: latestMessageByJobId.get(job.id) || null,
    outreach_summary: summaryByJobId.get(job.id) || {
      messagesSent: 0,
      deliveredMessages: 0,
      openedMessages: 0,
      clickedMessages: 0,
      pageViews: 0,
      acceptances: 0,
      bookings: 0,
      lastSentAt: null,
      lastRecipient: null,
      lastSendStatus: null,
    },
  }))

  return NextResponse.json({ data: enrichedJobs })
}

export async function POST(req: Request) {
  const supabase = await getServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!isAdminOrModerator(user)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()

  if (!body.jobId) return NextResponse.json({ error: "jobId is required" }, { status: 400 })

  const admin = getSupabaseAdmin()

  if (body.candidateProfileId) {
    const { data: existing, error: existingError } = await admin
      .from("admin_saved_jobs")
      .select("*")
      .eq("candidate_profile_id", body.candidateProfileId)
      .eq("job_id", body.jobId)
      .maybeSingle()

    if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 })
    if (existing) return NextResponse.json({ data: existing, existing: true })
  }

  const { data, error } = await admin
    .from("admin_saved_jobs")
    .insert({
      candidate_label: body.candidateLabel || "Okänd kandidat",
      candidate_profile_id: body.candidateProfileId || null,
      job_id: body.jobId,
      headline: body.headline || null,
      company: body.company || null,
      city: body.city || null,
      distance_km: body.distanceKm != null ? body.distanceKm : null,
      webpage_url: body.webpageUrl || null,
      occupation_group_label: body.occupationGroupLabel || null,
      notes: body.notes || null,
      interview_analysis: body.interviewAnalysis || null,
      application_reference: body.applicationReference || null,
      search_mode: body.searchMode || null,
      search_keyword: body.searchKeyword || null,
      search_address: body.searchAddress || null,
      search_radius_km: body.searchRadiusKm != null ? body.searchRadiusKm : null,
      candidate_cv_text: body.candidateCvText || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function DELETE(req: Request) {
  const supabase = await getServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!isAdminOrModerator(user)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const url = new URL(req.url)
  const candidateProfileId = url.searchParams.get("candidateProfileId")?.trim() || null
  const admin = getSupabaseAdmin()

  let query = admin.from("admin_saved_jobs").delete()
  if (candidateProfileId) {
    query = query.eq("candidate_profile_id", candidateProfileId)
  }

  const { error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, deletedScope: candidateProfileId ? "candidate" : "all" })
}
