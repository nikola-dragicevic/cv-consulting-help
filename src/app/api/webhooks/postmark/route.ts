import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabaseAdmin"

type PostmarkWebhookPayload = {
  RecordType?: string
  MessageID?: string
  Recipient?: string
  Email?: string
  ReceivedAt?: string
  DeliveredAt?: string
}

function normalizeEventType(recordType: string | undefined) {
  switch ((recordType || "").toLowerCase()) {
    case "delivery":
      return "delivered"
    case "open":
      return "opened"
    case "click":
      return "clicked"
    case "bounce":
      return "bounced"
    case "spamcomplaint":
      return "spam_complaint"
    default:
      return (recordType || "unknown").toLowerCase()
  }
}

function getOccurredAt(payload: PostmarkWebhookPayload) {
  const value = payload.ReceivedAt || payload.DeliveredAt
  if (!value) return new Date().toISOString()
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString()
}

export async function POST(req: Request) {
  const webhookToken = process.env.POSTMARK_WEBHOOK_TOKEN
  if (webhookToken) {
    const authHeader = req.headers.get("authorization")
    const receivedToken = authHeader?.replace(/^Bearer\s+/i, "").trim()
    if (receivedToken !== webhookToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  }

  const rawBody = await req.json().catch(() => null)
  const payloads = Array.isArray(rawBody) ? rawBody : rawBody ? [rawBody] : []
  if (payloads.length === 0) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 })
  }

  const admin = getSupabaseAdmin()

  for (const payload of payloads as PostmarkWebhookPayload[]) {
    const providerMessageId = typeof payload.MessageID === "string" ? payload.MessageID : ""
    if (!providerMessageId) continue

    const { data: message } = await admin
      .from("outreach_messages")
      .select("id,admin_saved_job_id,first_delivered_at,opened_at,first_clicked_at")
      .eq("provider_message_id", providerMessageId)
      .maybeSingle()

    if (!message) continue

    const eventType = normalizeEventType(payload.RecordType)
    const occurredAt = getOccurredAt(payload)
    const recipientEmail =
      typeof payload.Recipient === "string"
        ? payload.Recipient
        : typeof payload.Email === "string"
          ? payload.Email
          : null

    await admin.from("outreach_message_events").insert({
      outreach_message_id: message.id,
      admin_saved_job_id: message.admin_saved_job_id,
      provider: "postmark",
      provider_message_id: providerMessageId,
      recipient_email: recipientEmail,
      event_type: eventType,
      occurred_at: occurredAt,
      payload,
    })

    if (eventType === "delivered" && !message.first_delivered_at) {
      await admin
        .from("outreach_messages")
        .update({ first_delivered_at: occurredAt })
        .eq("id", message.id)
    }

    if (eventType === "opened" && !message.opened_at) {
      await admin
        .from("outreach_messages")
        .update({ opened_at: occurredAt })
        .eq("id", message.id)
    }

    if (eventType === "clicked" && !message.first_clicked_at) {
      await admin
        .from("outreach_messages")
        .update({ first_clicked_at: occurredAt })
        .eq("id", message.id)
    }
  }

  return NextResponse.json({ ok: true })
}
