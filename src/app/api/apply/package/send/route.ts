import { NextResponse } from "next/server"
import { getServerSupabase } from "@/lib/supabaseServer"
import { getSupabaseAdmin } from "@/lib/supabaseAdmin"
import { parseGeneratedEmail } from "@/lib/outreach"
import { countCandidateApplications, recordCandidateApplication } from "@/lib/applicationUsage"
import {
  getValidAccessToken,
  sendViaConnectedMailbox,
  type CandidateEmailAccountRow,
  type MailAttachment,
} from "@/lib/candidateMailbox"
import { canUseQuota, getRemainingQuota, getUserEntitlements } from "@/lib/subscriptionEntitlements"
import { buildCvPrintHtml, parseCvTemplateData } from "@/lib/cvTemplate"
import { generateCvFromFreeText } from "@/lib/cvGenerator"
import { renderHtmlToPdfBuffer } from "@/lib/pdfRenderer"

export const runtime = "nodejs"
export const maxDuration = 45

function slugify(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "cv"
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
  const jobId = typeof body?.jobId === "string" ? body.jobId.trim() : ""
  const emailText = typeof body?.emailText === "string" ? body.emailText.trim() : ""
  const recipientEmail = typeof body?.recipientEmail === "string" ? body.recipientEmail.trim() : ""
  const cvText = typeof body?.cvText === "string" ? body.cvText.trim() : ""
  const sendTestToSelf = body?.sendTestToSelf === true

  if (!jobId || !emailText || !recipientEmail || !cvText) {
    return NextResponse.json({ error: "jobId, recipientEmail, emailText and cvText are required" }, { status: 400 })
  }

  const normalizedCvRaw = await generateCvFromFreeText(cvText)
  const parsedCv = parseCvTemplateData(normalizedCvRaw)
  if (!parsedCv) {
    return NextResponse.json({ error: "Generated CV is not valid" }, { status: 400 })
  }

  const admin = getSupabaseAdmin()
  const [{ data: account }, { data: profile }, { data: job }] = await Promise.all([
    admin
      .from("candidate_email_accounts")
      .select("id,user_id,provider,email,display_name,status,encrypted_access_token,encrypted_refresh_token,access_token_expires_at")
      .eq("user_id", user.id)
      .eq("status", "connected")
      .order("connected_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("candidate_profiles")
      .select("full_name")
      .eq("user_id", user.id)
      .maybeSingle(),
    admin
      .from("job_ads")
      .select("headline,company,contact_email")
      .eq("id", jobId)
      .maybeSingle(),
  ])

  if (!account) {
    return NextResponse.json({ error: "No connected Gmail or Outlook account found" }, { status: 400 })
  }

  const finalRecipientEmail = sendTestToSelf ? (account.email || user.email || "") : recipientEmail
  if (!finalRecipientEmail) {
    return NextResponse.json({ error: "No valid recipient email found" }, { status: 400 })
  }

  const usedBefore = await countCandidateApplications(user.id)
  const entitlements = await getUserEntitlements({
    userId: user.id,
    email: user.email,
  })

  const { count: existingCount, error: existingError } = await admin
    .from("candidate_job_applications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("job_id", jobId)

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 })
  }

  const alreadyRecorded = (existingCount ?? 0) > 0
  if (!sendTestToSelf && !canUseQuota(entitlements.applicationLimit, usedBefore, alreadyRecorded)) {
    return NextResponse.json(
      {
        error: entitlements.hasActiveSubscription
          ? "Du har använt dina 4 email i Premium Dashboard. Uppgradera till Auto Apply för obegränsat."
          : "Du har använt dina 2 fria email. Starta Auto Apply 300 kr/mån för att fortsätta.",
        freeApplicationsUsed: usedBefore,
        freeApplicationsRemaining: 0,
        applicationLimit: entitlements.applicationLimit,
      },
      { status: 402 }
    )
  }

  const parsed = parseGeneratedEmail(emailText)
  const attachmentHtml = buildCvPrintHtml(parsedCv)
  const attachmentName = `${slugify(profile?.full_name || parsedCv.name || "cv")}-${slugify(job?.headline || "ansokan")}.pdf`
  const pdfBuffer = await renderHtmlToPdfBuffer(attachmentHtml)
  const attachments: MailAttachment[] = [
    {
      filename: attachmentName,
      contentType: "application/pdf",
      contentBase64: pdfBuffer.toString("base64"),
    },
  ]

  try {
    const tokens = await getValidAccessToken({
      account: account as CandidateEmailAccountRow,
    })

    const result = await sendViaConnectedMailbox({
      provider: account.provider,
      accessToken: tokens.accessToken,
      fromEmail: account.email || user.email || "",
      toEmail: finalRecipientEmail,
      subject: parsed.subject,
      textBody: parsed.body,
      attachments,
    })

    await admin
      .from("candidate_email_accounts")
      .update({
        encrypted_access_token: tokens.encryptedAccessToken,
        encrypted_refresh_token: tokens.encryptedRefreshToken,
        access_token_expires_at: tokens.expiresAt,
        last_tested_at: new Date().toISOString(),
        last_error: null,
      })
      .eq("id", account.id)

    if (!sendTestToSelf) {
      await recordCandidateApplication({
        userId: user.id,
        jobId,
        channel: "direct_email",
        submissionSource: "mailbox_send",
        recipientEmail: recipientEmail || job?.contact_email || null,
      })
    }

    const usedAfter = sendTestToSelf ? usedBefore : (alreadyRecorded ? usedBefore : usedBefore + 1)
    return NextResponse.json({
      success: true,
      data: {
        provider: account.provider,
        senderEmail: account.email || user.email || null,
        recipientEmail: finalRecipientEmail,
        subject: parsed.subject,
        providerMessageId: result.providerMessageId,
        cvAttached: true,
        cvAttachmentName: attachmentName,
        testSend: sendTestToSelf,
      },
      freeApplicationsUsed: usedAfter,
      freeApplicationsRemaining: getRemainingQuota(entitlements.applicationLimit, usedAfter),
      applicationLimit: entitlements.applicationLimit,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not send email"

    await admin
      .from("candidate_email_accounts")
      .update({
        last_tested_at: new Date().toISOString(),
        last_error: message,
      })
      .eq("id", account.id)

    return NextResponse.json({ error: message }, { status: 500 })
  }
}
