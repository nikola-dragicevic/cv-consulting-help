import { randomBytes } from "crypto"
import { NextResponse } from "next/server"
import { getServerSupabase } from "@/lib/supabaseServer"
import { isAdminOrModerator } from "@/lib/admin"
import { getSupabaseAdmin } from "@/lib/supabaseAdmin"
import { buildBrandedEmailHtml, formatFromHeader, parseGeneratedEmail } from "@/lib/outreach"

export const runtime = "nodejs"
export const maxDuration = 30

function buildPublicUrl(token: string) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://jobbnu.se"
  return `${baseUrl}/employer-intro/${token}`
}

function getOutreachSender() {
  const email =
    process.env.OUTREACH_FROM_EMAIL ||
    process.env.BUSINESS_CONTACT_EMAIL ||
    process.env.BUSINESS_SMTP_USER ||
    process.env.SMTP_USER ||
    "info@jobbnu.se"
  const name = process.env.OUTREACH_FROM_NAME || "JobbNu"
  return { email, name }
}

export async function POST(req: Request) {
  const supabase = await getServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!isAdminOrModerator(user)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const savedJobId = typeof body?.savedJobId === "string" ? body.savedJobId.trim() : ""
  const recipientEmail = typeof body?.recipientEmail === "string" ? body.recipientEmail.trim() : ""
  const recipientName = typeof body?.recipientName === "string" ? body.recipientName.trim() : ""
  const emailText = typeof body?.emailText === "string" ? body.emailText.trim() : ""

  if (!savedJobId || !recipientEmail || !emailText) {
    return NextResponse.json({ error: "savedJobId, recipientEmail and emailText are required" }, { status: 400 })
  }

  const postmarkToken = process.env.POSTMARK_SERVER_API_TOKEN || process.env.POSTMARK_API_TOKEN
  if (!postmarkToken) {
    return NextResponse.json({ error: "POSTMARK_SERVER_API_TOKEN is not set" }, { status: 500 })
  }

  const admin = getSupabaseAdmin()
  const { data: savedJob, error: savedJobError } = await admin
    .from("admin_saved_jobs")
    .select("id,candidate_profile_id,job_id")
    .eq("id", savedJobId)
    .single()

  if (savedJobError || !savedJob) {
    return NextResponse.json({ error: savedJobError?.message || "Saved job not found" }, { status: 404 })
  }

  const { data: existingIntroLink, error: introLinkError } = await admin
    .from("employer_intro_links")
    .select("id,token")
    .eq("admin_saved_job_id", savedJobId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (introLinkError) {
    return NextResponse.json({ error: introLinkError.message }, { status: 500 })
  }

  let introLink = existingIntroLink
  if (!introLink?.token) {
    const token = randomBytes(20).toString("hex")
    const { data: createdIntroLink, error: createIntroLinkError } = await admin
      .from("employer_intro_links")
      .insert({
        admin_saved_job_id: savedJobId,
        candidate_profile_id: savedJob.candidate_profile_id,
        job_id: savedJob.job_id,
        token,
        created_by_user_id: user?.id ?? null,
        status: "active",
        terms_version: "candidate_intro_terms_v2",
      })
      .select("id,token")
      .single()

    if (createIntroLinkError || !createdIntroLink) {
      return NextResponse.json({
        error: createIntroLinkError?.message || "Could not create employer intro link",
      }, { status: 500 })
    }

    introLink = createdIntroLink
  }

  const parsed = parseGeneratedEmail(emailText)
  const bookingLink = introLink?.token ? buildPublicUrl(introLink.token) : ""
  const bodyWithCta =
    bookingLink && !parsed.body.includes(bookingLink)
      ? `${parsed.body}\n\nSe kandidatprofil och boka intervju här: ${bookingLink}`
      : parsed.body
  const htmlBody = buildBrandedEmailHtml(bodyWithCta, {
    primaryButtonUrl: bookingLink || null,
    primaryButtonLabel: bookingLink ? "Se kandidatprofil och boka intervju" : null,
    primaryButtonHint: bookingLink
      ? "Länken går till jobbnu.se där arbetsgivaren kan läsa kandidatprofilen, godkänna villkoren och boka intervju."
      : null,
  })
  const sender = getOutreachSender()
  const messageStream = process.env.POSTMARK_MESSAGE_STREAM || "outbound"

  const { data: messageRow, error: insertError } = await admin
    .from("outreach_messages")
    .insert({
      admin_saved_job_id: savedJobId,
      employer_intro_link_id: introLink?.id || null,
      candidate_profile_id: savedJob.candidate_profile_id,
      job_id: savedJob.job_id,
      provider: "postmark",
      provider_message_stream: messageStream,
      sender_email: sender.email,
      sender_name: sender.name,
      recipient_email: recipientEmail,
      recipient_name: recipientName || null,
      subject: parsed.subject,
      text_body: bodyWithCta,
      html_body: htmlBody,
      send_status: "pending",
      metadata: {
        savedJobId,
        employerIntroLinkId: introLink?.id || null,
        bookingLink: bookingLink || null,
        sentByUserId: user?.id || null,
      },
    })
    .select("id")
    .single()

  if (insertError || !messageRow) {
    return NextResponse.json({ error: insertError?.message || "Could not create outreach message" }, { status: 500 })
  }

  try {
    const postmarkRes = await fetch("https://api.postmarkapp.com/email", {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "X-Postmark-Server-Token": postmarkToken,
      },
      body: JSON.stringify({
        MessageStream: messageStream,
        From: formatFromHeader(sender),
        To: recipientEmail,
        Subject: parsed.subject,
        TextBody: bodyWithCta,
        HtmlBody: htmlBody,
        ReplyTo: sender.email,
        TrackOpens: true,
        Metadata: {
          savedJobId,
          outreachMessageId: messageRow.id,
        },
      }),
    })

    const postmarkJson = await postmarkRes.json().catch(() => null)
    if (!postmarkRes.ok || postmarkJson?.ErrorCode) {
      const failureReason =
        typeof postmarkJson?.Message === "string"
          ? postmarkJson.Message
          : `Postmark request failed (${postmarkRes.status})`

      await admin
        .from("outreach_messages")
        .update({
          send_status: "failed",
          failed_at: new Date().toISOString(),
          failure_reason: failureReason,
        })
        .eq("id", messageRow.id)

      return NextResponse.json({ error: failureReason }, { status: 500 })
    }

    const sentAt = typeof postmarkJson?.SubmittedAt === "string"
      ? new Date(postmarkJson.SubmittedAt).toISOString()
      : new Date().toISOString()

    const { error: updateMessageError } = await admin
      .from("outreach_messages")
      .update({
        provider_message_id: postmarkJson?.MessageID || null,
        send_status: "sent",
        sent_at: sentAt,
        failure_reason: null,
      })
      .eq("id", messageRow.id)

    if (updateMessageError) {
      return NextResponse.json({ error: updateMessageError.message }, { status: 500 })
    }

    const { error: savedJobUpdateError } = await admin
      .from("admin_saved_jobs")
      .update({
        email_sent: true,
        email_sent_at: sentAt,
      })
      .eq("id", savedJobId)

    if (savedJobUpdateError) {
      return NextResponse.json({ error: savedJobUpdateError.message }, { status: 500 })
    }

    return NextResponse.json({
      data: {
        id: messageRow.id,
        providerMessageId: postmarkJson?.MessageID || null,
        sentAt,
        recipientEmail,
      },
    })
  } catch (error) {
    const failureReason = error instanceof Error ? error.message : "Unknown error"
    await admin
      .from("outreach_messages")
      .update({
        send_status: "failed",
        failed_at: new Date().toISOString(),
        failure_reason: failureReason,
      })
      .eq("id", messageRow.id)

    return NextResponse.json({ error: failureReason }, { status: 500 })
  }
}
