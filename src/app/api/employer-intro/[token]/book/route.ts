import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabaseAdmin"
import { buildBrandedEmailHtml, formatFromHeader, getClientIp } from "@/lib/outreach"
import { generateInterviewPreparation } from "@/lib/interviewPrep"

export const runtime = "nodejs"
export const maxDuration = 30

function toMinutes(timeValue: string) {
  const [hours, minutes] = timeValue.slice(0, 5).split(":").map(Number)
  return hours * 60 + minutes
}

function overlaps(startA: number, endA: number, startB: number, endB: number) {
  return startA < endB && endA > startB
}

function normalizeMeetingLink(value: unknown) {
  const trimmed = typeof value === "string" ? value.trim() : ""
  if (!trimmed) return null

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

function buildEmployerIntroUrl(token: string) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://jobbnu.se"
  return `${baseUrl}/employer-intro/${token}`
}

function sanitizeCvStoragePath(value: string | null | undefined) {
  const trimmed = typeof value === "string" ? value.trim() : ""
  if (!trimmed) return null
  return trimmed.startsWith("cvs/") ? trimmed.slice(4) : trimmed
}

function guessAttachmentName(path: string | null | undefined) {
  const trimmed = typeof path === "string" ? path.trim() : ""
  if (!trimmed) return "kandidat-cv.pdf"
  const parts = trimmed.split("/")
  return parts[parts.length - 1] || "kandidat-cv.pdf"
}

function formatInterviewSlot(params: { bookingDate: string; startTime: string; endTime: string }) {
  const timeLabel = `${params.startTime.slice(0, 5)}-${params.endTime.slice(0, 5)}`
  return `${params.bookingDate} kl. ${timeLabel}`
}

async function sendCandidateInterviewEmail(params: {
  admin: ReturnType<typeof getSupabaseAdmin>
  employerIntroLinkId: string
  adminSavedJobId: string
  candidateProfileId: string | null
  bookingId: string
  companyName: string
  contactName: string
  contactPhone: string | null
  meetingLink: string | null
  bookingDate: string
  startTime: string
  endTime: string
}) {
  const postmarkToken = process.env.POSTMARK_SERVER_API_TOKEN || process.env.POSTMARK_API_TOKEN
  if (!postmarkToken || !params.candidateProfileId) {
    return { status: "skipped", reason: !postmarkToken ? "postmark_not_configured" : "candidate_profile_missing" }
  }

  const [{ data: candidate }, { data: savedJob }] = await Promise.all([
    params.admin
      .from("candidate_profiles")
      .select("id,full_name,email")
      .eq("id", params.candidateProfileId)
      .maybeSingle(),
    params.admin
      .from("admin_saved_jobs")
      .select("headline,company,webpage_url,job_id")
      .eq("id", params.adminSavedJobId)
      .maybeSingle(),
  ])

  const candidateEmail = typeof candidate?.email === "string" ? candidate.email.trim() : ""
  if (!candidateEmail) {
    return { status: "skipped", reason: "candidate_email_missing" }
  }

  const jobId = typeof savedJob?.job_id === "string" ? savedJob.job_id : ""
  const { data: jobRow } = jobId
    ? await params.admin
        .from("job_ads")
        .select("description_text")
        .eq("id", jobId)
        .maybeSingle()
    : { data: null }

  const companyName = savedJob?.company || params.companyName
  const jobHeadline = savedJob?.headline || "rollen"
  const jobLink = typeof savedJob?.webpage_url === "string" ? savedJob.webpage_url.trim() : ""
  const jobDescription = typeof jobRow?.description_text === "string" ? jobRow.description_text : ""
  const interviewPreparation = await generateInterviewPreparation({
    companyName: companyName || "arbetsgivaren",
    jobHeadline: jobHeadline || "rollen",
    jobDescription,
  })
  const interviewSlot = formatInterviewSlot({
    bookingDate: params.bookingDate,
    startTime: params.startTime,
    endTime: params.endTime,
  })

  const subject = `Intervju bokad med ${companyName || "arbetsgivaren"} via JobbNu`
  const textBody = [
    `Hej${candidate?.full_name ? ` ${candidate.full_name.split(/\s+/)[0]}` : ""},`,
    `Din intervju är nu bokad med ${companyName || "arbetsgivaren"} för ${jobHeadline || "rollen"}.`,
    `Tid: ${interviewSlot}`,
    `Kontaktperson: ${params.contactName}`,
    `Telefon: ${params.contactPhone || "saknas"}`,
    params.meetingLink ? `Möteslänk: ${params.meetingLink}` : "",
    params.meetingLink ? "Var redo och testa länken 15 min innan själva intervjun." : "",
    jobLink ? `Jobbannons: ${jobLink}` : "",
    `Kort förberedelse inför intervjun: ${interviewPreparation}`,
    "Svara gärna på detta mejl om du vill ha stöd inför intervjun.",
  ]
    .filter(Boolean)
    .join("\n\n")

  const htmlBodyText = [
    `Hej${candidate?.full_name ? ` ${candidate.full_name.split(/\s+/)[0]}` : ""},`,
    `Din intervju är nu bokad med ${companyName || "arbetsgivaren"} för ${jobHeadline || "rollen"}.`,
    `Tid: ${interviewSlot}`,
    `Kontaktperson: ${params.contactName}`,
    `Telefon: ${params.contactPhone || "saknas"}`,
    params.meetingLink ? `Möteslänk: ${params.meetingLink}` : "",
    params.meetingLink ? "Var redo och testa länken 15 min innan själva intervjun." : "",
    !params.meetingLink && jobLink ? "Läs gärna jobbannonsen en gång till via knappen nedan inför intervjun." : "",
    params.meetingLink && jobLink ? `Jobbannons: ${jobLink}` : "",
    `Kort förberedelse inför intervjun: ${interviewPreparation}`,
    "Svara gärna på detta mejl om du vill ha stöd inför intervjun.",
  ]
    .filter(Boolean)
    .join("\n\n")

  const htmlBody = buildBrandedEmailHtml(htmlBodyText, {
    primaryButtonUrl: params.meetingLink || jobLink || null,
    primaryButtonLabel: params.meetingLink ? "Öppna möteslänk" : jobLink ? "Se jobbannons" : null,
    primaryButtonHint: params.meetingLink
      ? "Länken öppnar det mötesrum som arbetsgivaren skickade inför intervjun."
      : jobLink
        ? "Läs gärna annonsen en gång till inför intervjun."
        : null,
  })

  const sender = getOutreachSender()
  const messageStream = process.env.POSTMARK_MESSAGE_STREAM || "outbound"
  const { data: messageRow, error: insertError } = await params.admin
    .from("outreach_messages")
    .insert({
      admin_saved_job_id: params.adminSavedJobId,
      employer_intro_link_id: params.employerIntroLinkId,
      candidate_profile_id: params.candidateProfileId,
      job_id: jobId || null,
      provider: "postmark",
      provider_message_stream: messageStream,
      sender_email: sender.email,
      sender_name: sender.name,
      recipient_email: candidateEmail,
      recipient_name: candidate?.full_name || null,
      subject,
      text_body: textBody,
      html_body: htmlBody,
      send_status: "pending",
      metadata: {
        messageKind: "candidate_interview_invite",
        bookingId: params.bookingId,
        meetingLink: params.meetingLink,
        contactName: params.contactName,
        contactPhone: params.contactPhone,
      },
    })
    .select("id")
    .single()

  if (insertError || !messageRow) {
    return { status: "failed", reason: insertError?.message || "could_not_create_message_row" }
  }

  try {
    const postmarkRes = await fetch("https://api.postmarkapp.com/email", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Postmark-Server-Token": postmarkToken,
      },
      body: JSON.stringify({
        MessageStream: messageStream,
        From: formatFromHeader(sender),
        To: candidateEmail,
        Subject: subject,
        TextBody: textBody,
        HtmlBody: htmlBody,
        ReplyTo: sender.email,
        TrackOpens: true,
        Metadata: {
          adminSavedJobId: params.adminSavedJobId,
          outreachMessageId: messageRow.id,
          bookingId: params.bookingId,
          messageKind: "candidate_interview_invite",
        },
      }),
    })

    const postmarkJson = await postmarkRes.json().catch(() => null)
    if (!postmarkRes.ok || postmarkJson?.ErrorCode) {
      const failureReason =
        typeof postmarkJson?.Message === "string"
          ? postmarkJson.Message
          : `Postmark request failed (${postmarkRes.status})`

      await params.admin
        .from("outreach_messages")
        .update({
          send_status: "failed",
          failed_at: new Date().toISOString(),
          failure_reason: failureReason,
        })
        .eq("id", messageRow.id)

      return { status: "failed", reason: failureReason }
    }

    const sentAt =
      typeof postmarkJson?.SubmittedAt === "string"
        ? new Date(postmarkJson.SubmittedAt).toISOString()
        : new Date().toISOString()

    await params.admin
      .from("outreach_messages")
      .update({
        provider_message_id: postmarkJson?.MessageID || null,
        send_status: "sent",
        sent_at: sentAt,
        failure_reason: null,
      })
      .eq("id", messageRow.id)

    return { status: "sent", sentAt }
  } catch (error) {
    const failureReason = error instanceof Error ? error.message : "Unknown error"
    await params.admin
      .from("outreach_messages")
      .update({
        send_status: "failed",
        failed_at: new Date().toISOString(),
        failure_reason: failureReason,
      })
      .eq("id", messageRow.id)

    return { status: "failed", reason: failureReason }
  }
}

async function sendEmployerBookingConfirmationEmail(params: {
  admin: ReturnType<typeof getSupabaseAdmin>
  employerIntroLinkId: string
  employerIntroToken: string
  adminSavedJobId: string
  candidateProfileId: string | null
  bookingId: string
  companyName: string
  contactName: string
  contactEmail: string
  contactPhone: string | null
  meetingLink: string | null
  bookingDate: string
  startTime: string
  endTime: string
}) {
  const postmarkToken = process.env.POSTMARK_SERVER_API_TOKEN || process.env.POSTMARK_API_TOKEN
  if (!postmarkToken || !params.contactEmail || !params.candidateProfileId) {
    return { status: "skipped", reason: !postmarkToken ? "postmark_not_configured" : "missing_required_fields" }
  }

  const [{ data: candidate }, { data: savedJob }] = await Promise.all([
    params.admin
      .from("candidate_profiles")
      .select("id,full_name,phone,cv_bucket_path,cv_file_url")
      .eq("id", params.candidateProfileId)
      .maybeSingle(),
    params.admin
      .from("admin_saved_jobs")
      .select("headline")
      .eq("id", params.adminSavedJobId)
      .maybeSingle(),
  ])

  const candidateFullName = typeof candidate?.full_name === "string" ? candidate.full_name.trim() : "Kandidaten"
  const candidatePhone = typeof candidate?.phone === "string" ? candidate.phone.trim() : ""
  const employerIntroUrl = buildEmployerIntroUrl(params.employerIntroToken)
  const interviewSlot = formatInterviewSlot({
    bookingDate: params.bookingDate,
    startTime: params.startTime,
    endTime: params.endTime,
  })

  let attachments: Array<{ Name: string; Content: string; ContentType: string }> = []
  const cvStoragePath = sanitizeCvStoragePath(candidate?.cv_bucket_path)
  if (cvStoragePath) {
    const { data: cvFile } = await params.admin.storage.from("cvs").download(cvStoragePath)
    if (cvFile) {
      const buffer = Buffer.from(await cvFile.arrayBuffer())
      attachments = [{
        Name: guessAttachmentName(cvStoragePath),
        Content: buffer.toString("base64"),
        ContentType: cvFile.type || "application/pdf",
      }]
    }
  }

  const subject = `Intervju bokad med ${candidateFullName} via JobbNu`
  const textBody = [
    `Hej ${params.contactName},`,
    `Intervjun är nu bokad ${interviewSlot}${savedJob?.headline ? ` för ${savedJob.headline}` : ""}.`,
    `Kandidatens fullständiga namn: ${candidateFullName}`,
    `Kandidatens telefonnummer: ${candidatePhone || "saknas"}`,
    `Möteslänk: ${params.meetingLink || "Ingen länk angiven ännu. Gå tillbaka till arbetsgivarsidan om ni vill lägga till en möteslänk inför intervjun: " + employerIntroUrl}`,
    "Kandidaten har nu fått information om mötet från JobbNu.",
    attachments.length > 0
      ? "Kandidatens fullständiga CV finns bifogat i detta mejl."
      : `Kandidatens CV kunde inte bifogas automatiskt. Använd arbetsgivarsidan för fortsatt dialog: ${employerIntroUrl}`,
  ].join("\n\n")

  const htmlBody = buildBrandedEmailHtml(textBody, {
    primaryButtonUrl: employerIntroUrl,
    primaryButtonLabel: "Öppna arbetsgivarsidan",
    primaryButtonHint: "Här kan ni se kandidatprofilen igen och vid behov lägga till möteslänk eller uppdatera bokningen.",
  })

  const sender = getOutreachSender()
  const messageStream = process.env.POSTMARK_MESSAGE_STREAM || "outbound"
  const { data: messageRow, error: insertError } = await params.admin
    .from("outreach_messages")
    .insert({
      admin_saved_job_id: params.adminSavedJobId,
      employer_intro_link_id: params.employerIntroLinkId,
      candidate_profile_id: params.candidateProfileId,
      provider: "postmark",
      provider_message_stream: messageStream,
      sender_email: sender.email,
      sender_name: sender.name,
      recipient_email: params.contactEmail,
      recipient_name: params.contactName || null,
      subject,
      text_body: textBody,
      html_body: htmlBody,
      send_status: "pending",
      metadata: {
        messageKind: "employer_booking_confirmation",
        bookingId: params.bookingId,
        meetingLink: params.meetingLink,
      },
    })
    .select("id")
    .single()

  if (insertError || !messageRow) {
    return { status: "failed", reason: insertError?.message || "could_not_create_message_row" }
  }

  try {
    const postmarkRes = await fetch("https://api.postmarkapp.com/email", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Postmark-Server-Token": postmarkToken,
      },
      body: JSON.stringify({
        MessageStream: messageStream,
        From: formatFromHeader(sender),
        To: params.contactEmail,
        Subject: subject,
        TextBody: textBody,
        HtmlBody: htmlBody,
        Attachments: attachments,
        ReplyTo: sender.email,
        TrackOpens: true,
        Metadata: {
          adminSavedJobId: params.adminSavedJobId,
          outreachMessageId: messageRow.id,
          bookingId: params.bookingId,
          messageKind: "employer_booking_confirmation",
        },
      }),
    })

    const postmarkJson = await postmarkRes.json().catch(() => null)
    if (!postmarkRes.ok || postmarkJson?.ErrorCode) {
      const failureReason =
        typeof postmarkJson?.Message === "string"
          ? postmarkJson.Message
          : `Postmark request failed (${postmarkRes.status})`

      await params.admin
        .from("outreach_messages")
        .update({
          send_status: "failed",
          failed_at: new Date().toISOString(),
          failure_reason: failureReason,
        })
        .eq("id", messageRow.id)

      return { status: "failed", reason: failureReason }
    }

    const sentAt =
      typeof postmarkJson?.SubmittedAt === "string"
        ? new Date(postmarkJson.SubmittedAt).toISOString()
        : new Date().toISOString()

    await params.admin
      .from("outreach_messages")
      .update({
        provider_message_id: postmarkJson?.MessageID || null,
        send_status: "sent",
        sent_at: sentAt,
        failure_reason: null,
      })
      .eq("id", messageRow.id)

    return { status: "sent", sentAt }
  } catch (error) {
    const failureReason = error instanceof Error ? error.message : "Unknown error"
    await params.admin
      .from("outreach_messages")
      .update({
        send_status: "failed",
        failed_at: new Date().toISOString(),
        failure_reason: failureReason,
      })
      .eq("id", messageRow.id)

    return { status: "failed", reason: failureReason }
  }
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
  const normalizedMeetingLink = normalizeMeetingLink(body?.meetingLink)

  if (!slotId || !startTime || !endTime || !acceptanceId || !companyName || !contactName || !contactEmail) {
    return NextResponse.json({ error: "Missing booking fields" }, { status: 400 })
  }
  if (normalizedMeetingLink && "error" in normalizedMeetingLink) {
    return NextResponse.json({ error: normalizedMeetingLink.error }, { status: 400 })
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

  const meetingLink = normalizedMeetingLink && "value" in normalizedMeetingLink ? normalizedMeetingLink.value : null
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
      meeting_link: meetingLink,
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
      meetingLink,
    },
  })

  const candidateEmailResult = await sendCandidateInterviewEmail({
    admin,
    employerIntroLinkId: link.id,
    adminSavedJobId: link.admin_saved_job_id,
    candidateProfileId: link.candidate_profile_id,
    bookingId: booking.id,
    companyName,
    contactName,
    contactPhone: contactPhone || null,
    meetingLink,
    bookingDate: booking.booking_date,
    startTime: booking.start_time,
    endTime: booking.end_time,
  })

  const employerEmailResult = await sendEmployerBookingConfirmationEmail({
    admin,
    employerIntroLinkId: link.id,
    employerIntroToken: token,
    adminSavedJobId: link.admin_saved_job_id,
    candidateProfileId: link.candidate_profile_id,
    bookingId: booking.id,
    companyName,
    contactName,
    contactEmail,
    contactPhone: contactPhone || null,
    meetingLink,
    bookingDate: booking.booking_date,
    startTime: booking.start_time,
    endTime: booking.end_time,
  })

  await admin.from("employer_intro_page_events").insert({
    employer_intro_link_id: link.id,
    admin_saved_job_id: link.admin_saved_job_id,
    candidate_profile_id: link.candidate_profile_id,
    acceptance_id: acceptanceId,
    booking_id: booking.id,
    event_type: `candidate_interview_email_${candidateEmailResult.status}`,
    occurred_at: new Date().toISOString(),
    ip_address: getClientIp(req),
    user_agent: req.headers.get("user-agent"),
    referrer: req.headers.get("referer"),
    metadata: {
      reason: "reason" in candidateEmailResult ? candidateEmailResult.reason : null,
      sentAt: "sentAt" in candidateEmailResult ? candidateEmailResult.sentAt : null,
    },
  })

  await admin.from("employer_intro_page_events").insert({
    employer_intro_link_id: link.id,
    admin_saved_job_id: link.admin_saved_job_id,
    candidate_profile_id: link.candidate_profile_id,
    acceptance_id: acceptanceId,
    booking_id: booking.id,
    event_type: `employer_booking_email_${employerEmailResult.status}`,
    occurred_at: new Date().toISOString(),
    ip_address: getClientIp(req),
    user_agent: req.headers.get("user-agent"),
    referrer: req.headers.get("referer"),
    metadata: {
      reason: "reason" in employerEmailResult ? employerEmailResult.reason : null,
      sentAt: "sentAt" in employerEmailResult ? employerEmailResult.sentAt : null,
    },
  })

  return NextResponse.json({
    data: {
      ...booking,
      meeting_link: meetingLink,
    },
  })
}
