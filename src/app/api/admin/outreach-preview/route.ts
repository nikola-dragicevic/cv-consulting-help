import { randomBytes } from "crypto"
import { NextResponse } from "next/server"
import { isAdminOrModerator } from "@/lib/admin"
import { getSupabaseAdmin } from "@/lib/supabaseAdmin"
import { getServerSupabase } from "@/lib/supabaseServer"
import { buildBrandedEmailHtml, parseGeneratedEmail } from "@/lib/outreach"

export const runtime = "nodejs"
export const maxDuration = 30

function buildPublicUrl(token: string) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://jobbnu.se"
  return `${baseUrl}/employer-intro/${token}`
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
  const emailText = typeof body?.emailText === "string" ? body.emailText.trim() : ""

  if (!savedJobId || !emailText) {
    return NextResponse.json({ error: "savedJobId and emailText are required" }, { status: 400 })
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
  const textBody =
    bookingLink && !parsed.body.includes(bookingLink)
      ? `${parsed.body}\n\nSe kandidatprofil och boka intervju här: ${bookingLink}`
      : parsed.body

  const htmlBody = buildBrandedEmailHtml(textBody, {
    primaryButtonUrl: bookingLink || null,
    primaryButtonLabel: bookingLink ? "Se kandidatprofil och boka intervju" : null,
    primaryButtonHint: bookingLink
      ? "Länken går till jobbnu.se där arbetsgivaren kan läsa kandidatprofilen, godkänna villkoren och boka intervju."
      : null,
  })

  return NextResponse.json({
    data: {
      subject: parsed.subject,
      textBody,
      htmlBody,
      bookingLink: bookingLink || null,
    },
  })
}
