import { NextResponse } from "next/server"
import { getServerSupabase } from "@/lib/supabaseServer"
import { isAdminOrModerator } from "@/lib/admin"
import { getSupabaseAdmin } from "@/lib/supabaseAdmin"
import { buildBrandedEmailHtml, formatFromHeader } from "@/lib/outreach"
import { buildEmployerFollowupUrl } from "@/lib/interviewFollowup"

export const runtime = "nodejs"
export const maxDuration = 30

function toMinutes(timeValue: string) {
  const [hours, minutes] = timeValue.slice(0, 5).split(":").map(Number)
  return hours * 60 + minutes
}

function getSender() {
  const email =
    process.env.OUTREACH_FROM_EMAIL ||
    process.env.BUSINESS_CONTACT_EMAIL ||
    process.env.BUSINESS_SMTP_USER ||
    process.env.SMTP_USER ||
    "info@jobbnu.se"
  const name = process.env.OUTREACH_FROM_NAME || "JobbNu"
  return { email, name }
}

function getStockholmNow() {
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
  const parts = formatter.formatToParts(new Date())
  const map = new Map(parts.map((part) => [part.type, part.value]))
  return {
    date: `${map.get("year")}-${map.get("month")}-${map.get("day")}`,
    minutes: Number(map.get("hour")) * 60 + Number(map.get("minute")) - 30,
  }
}

function isDueForFollowup(params: { bookingDate: string; endTime: string; stockholmDate: string; stockholmMinutes: number }) {
  if (params.bookingDate < params.stockholmDate) return true
  if (params.bookingDate > params.stockholmDate) return false
  return toMinutes(params.endTime) <= params.stockholmMinutes
}

async function isAuthorized(req: Request) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim()
  if (cronSecret && authHeader === cronSecret) {
    return true
  }

  const supabase = await getServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return isAdminOrModerator(user)
}

export async function POST(req: Request) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const postmarkToken = process.env.POSTMARK_SERVER_API_TOKEN || process.env.POSTMARK_API_TOKEN
  if (!postmarkToken) {
    return NextResponse.json({ error: "POSTMARK_SERVER_API_TOKEN is not set" }, { status: 500 })
  }

  const admin = getSupabaseAdmin()
  const { data: bookings, error } = await admin
    .from("employer_interview_bookings")
    .select(
      "id,followup_token,admin_saved_job_id,employer_intro_link_id,candidate_profile_id,company_name,contact_name,contact_email,booking_date,start_time,end_time,admin_followup_status,employer_followup_email_sent_at"
    )
    .is("employer_followup_email_sent_at", null)
    .not("followup_token", "is", null)
    .limit(500)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const stockholmNow = getStockholmNow()
  const dueBookings = (bookings || []).filter((booking) =>
    isDueForFollowup({
      bookingDate: booking.booking_date,
      endTime: booking.end_time,
      stockholmDate: stockholmNow.date,
      stockholmMinutes: stockholmNow.minutes,
    })
  )

  if (dueBookings.length === 0) {
    return NextResponse.json({ ok: true, sent: 0 })
  }

  const savedJobIds = Array.from(new Set(dueBookings.map((booking) => booking.admin_saved_job_id).filter(Boolean)))
  const { data: savedJobs } = savedJobIds.length
    ? await admin
        .from("admin_saved_jobs")
        .select("id,headline,company")
        .in("id", savedJobIds)
    : { data: [] }
  const savedJobMap = new Map((savedJobs || []).map((job) => [job.id, job]))

  const sender = getSender()
  const messageStream = process.env.POSTMARK_MESSAGE_STREAM || "outbound"
  let sentCount = 0

  for (const booking of dueBookings) {
    const savedJob = booking.admin_saved_job_id ? savedJobMap.get(booking.admin_saved_job_id) : null
    const followupUrl = buildEmployerFollowupUrl(String(booking.followup_token))
    const roleLabel = savedJob?.headline || "rollen"
    const companyLabel = savedJob?.company || booking.company_name
    const subject = `Hur gick intervjun med kandidaten via JobbNu?`
    const textBody = [
      `Hej ${booking.contact_name || "där"},`,
      `Hoppas intervjun för ${roleLabel} hos ${companyLabel} gick bra.`,
      "Vi på JobbNu vill gärna veta hur intervjun gick och var ni befinner er i processen.",
      "Vi uppskattar om ni tar 30 sekunder och uppdaterar rätt steg via länken nedan.",
      "Ni kan ange om ni går vidare, om erbjudande planeras eller har skickats, och senare även bekräfta lön/startdatum när det är aktuellt.",
      followupUrl,
    ].join("\n\n")
    const htmlBody = buildBrandedEmailHtml(textBody, {
      primaryButtonUrl: followupUrl,
      primaryButtonLabel: "Uppdatera process",
      primaryButtonHint: "Länken går till JobbNus uppföljningssida för den här intervjun.",
    })

    const { data: messageRow, error: insertError } = await admin
      .from("outreach_messages")
      .insert({
        admin_saved_job_id: booking.admin_saved_job_id,
        employer_intro_link_id: booking.employer_intro_link_id,
        candidate_profile_id: booking.candidate_profile_id,
        provider: "postmark",
        provider_message_stream: messageStream,
        sender_email: sender.email,
        sender_name: sender.name,
        recipient_email: booking.contact_email,
        recipient_name: booking.contact_name || null,
        subject,
        text_body: textBody,
        html_body: htmlBody,
        send_status: "pending",
        metadata: {
          messageKind: "employer_interview_followup",
          bookingId: booking.id,
        },
      })
      .select("id")
      .single()

    if (insertError || !messageRow) {
      continue
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
          To: booking.contact_email,
          Subject: subject,
          TextBody: textBody,
          HtmlBody: htmlBody,
          ReplyTo: sender.email,
          TrackOpens: true,
          Metadata: {
            outreachMessageId: messageRow.id,
            bookingId: booking.id,
            messageKind: "employer_interview_followup",
          },
        }),
      })

      const postmarkJson = await postmarkRes.json().catch(() => null)
      if (!postmarkRes.ok || postmarkJson?.ErrorCode) {
        await admin
          .from("outreach_messages")
          .update({
            send_status: "failed",
            failed_at: new Date().toISOString(),
            failure_reason:
              typeof postmarkJson?.Message === "string"
                ? postmarkJson.Message
                : `Postmark request failed (${postmarkRes.status})`,
          })
          .eq("id", messageRow.id)
        continue
      }

      const sentAt =
        typeof postmarkJson?.SubmittedAt === "string"
          ? new Date(postmarkJson.SubmittedAt).toISOString()
          : new Date().toISOString()

      await admin
        .from("outreach_messages")
        .update({
          provider_message_id: postmarkJson?.MessageID || null,
          send_status: "sent",
          sent_at: sentAt,
        })
        .eq("id", messageRow.id)

      await admin
        .from("employer_interview_bookings")
        .update({ employer_followup_email_sent_at: sentAt })
        .eq("id", booking.id)

      sentCount += 1
    } catch (sendError) {
      await admin
        .from("outreach_messages")
        .update({
          send_status: "failed",
          failed_at: new Date().toISOString(),
          failure_reason: sendError instanceof Error ? sendError.message : "Unknown error",
        })
        .eq("id", messageRow.id)
    }
  }

  return NextResponse.json({ ok: true, sent: sentCount, due: dueBookings.length })
}
