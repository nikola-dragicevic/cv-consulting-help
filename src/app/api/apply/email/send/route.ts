import { NextResponse } from "next/server"
import { getServerSupabase } from "@/lib/supabaseServer"
import { getSupabaseAdmin } from "@/lib/supabaseAdmin"
import { parseGeneratedEmail } from "@/lib/outreach"
import { countCandidateApplications, FREE_AUTO_APPLY_APPLICATIONS, recordCandidateApplication } from "@/lib/applicationUsage"
import {
  getValidAccessToken,
  sendViaConnectedMailbox,
  type CandidateEmailAccountRow,
  type MailAttachment,
} from "@/lib/candidateMailbox"

export const runtime = "nodejs"
export const maxDuration = 30

function sanitizeCvStoragePath(value: string | null | undefined) {
  if (!value) return null
  return value.startsWith("cvs/") ? value.slice(4) : value
}

function guessAttachmentName(path: string) {
  const part = path.split("/").pop() || "cv.pdf"
  return part.includes(".") ? part : `${part}.pdf`
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

  if (!jobId || !emailText || !recipientEmail) {
    return NextResponse.json({ error: "jobId, recipientEmail and emailText are required" }, { status: 400 })
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
      .select("full_name,cv_bucket_path,representation_active")
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

  if (!profile) {
    return NextResponse.json({ error: "Candidate profile not found" }, { status: 404 })
  }

  const hasAutoApplySubscription = profile.representation_active === true
  const usedBefore = await countCandidateApplications(user.id)

  const { count: existingCount, error: existingError } = await admin
    .from("candidate_job_applications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("job_id", jobId)

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 })
  }

  const alreadyRecorded = (existingCount ?? 0) > 0

  if (!hasAutoApplySubscription && !alreadyRecorded && usedBefore >= FREE_AUTO_APPLY_APPLICATIONS) {
    return NextResponse.json(
      {
        error: "Du har använt dina 2 fria ansökningar. Starta Auto Apply 300 kr/mån för att fortsätta.",
        freeApplicationsUsed: usedBefore,
        freeApplicationsRemaining: 0,
      },
      { status: 402 }
    )
  }

  const parsed = parseGeneratedEmail(emailText)
  const cvStoragePath = sanitizeCvStoragePath(profile.cv_bucket_path)
  const attachments: MailAttachment[] = []

  if (cvStoragePath) {
    const { data: cvFile } = await admin.storage.from("cvs").download(cvStoragePath)
    if (cvFile) {
      const buffer = Buffer.from(await cvFile.arrayBuffer())
      attachments.push({
        filename: guessAttachmentName(cvStoragePath),
        contentType: cvFile.type || "application/pdf",
        contentBase64: buffer.toString("base64"),
      })
    }
  }

  try {
    const tokens = await getValidAccessToken({
      account: account as CandidateEmailAccountRow,
    })

    const result = await sendViaConnectedMailbox({
      provider: account.provider,
      accessToken: tokens.accessToken,
      fromEmail: account.email || user.email || "",
      toEmail: recipientEmail,
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

    await recordCandidateApplication({
      userId: user.id,
      jobId,
      channel: "direct_email",
      submissionSource: "mailbox_send",
      recipientEmail: recipientEmail || job?.contact_email || null,
    })

    const usedAfter = alreadyRecorded ? usedBefore : usedBefore + 1

    return NextResponse.json({
      success: true,
      data: {
        provider: account.provider,
        senderEmail: account.email || user.email || null,
        recipientEmail: recipientEmail || job?.contact_email || null,
        subject: parsed.subject,
        providerMessageId: result.providerMessageId,
        cvAttached: attachments.length > 0,
      },
      freeApplicationsUsed: usedAfter,
      freeApplicationsRemaining: hasAutoApplySubscription ? FREE_AUTO_APPLY_APPLICATIONS : Math.max(0, FREE_AUTO_APPLY_APPLICATIONS - usedAfter),
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
