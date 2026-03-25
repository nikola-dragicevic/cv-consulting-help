import { NextResponse } from "next/server"
import { getServerSupabase } from "@/lib/supabaseServer"
import { getSupabaseAdmin } from "@/lib/supabaseAdmin"
import { generateApplicationEmail, stripSubjectFromEmail } from "@/lib/applicationEmail"

export const runtime = "nodejs"

function splitName(fullName: string | null | undefined) {
  const value = (fullName || "").trim()
  if (!value) {
    return { firstName: "", lastName: "" }
  }
  const parts = value.split(/\s+/)
  return {
    firstName: parts[0] || "",
    lastName: parts.slice(1).join(" "),
  }
}

function sanitizeCvStoragePath(value: string | null | undefined) {
  if (!value) return null
  return value.startsWith("cvs/") ? value.slice(4) : value
}

function guessFilename(path: string | null) {
  if (!path) return "cv.pdf"
  const last = path.split("/").pop() || "cv.pdf"
  return last.includes(".") ? last : `${last}.pdf`
}

function normalizedUrlCandidates(rawUrl: string) {
  try {
    const url = new URL(rawUrl)
    const noHash = `${url.origin}${url.pathname}${url.search}`
    const noSearch = `${url.origin}${url.pathname}`
    const trimmedNoHash = noHash.endsWith("/") ? noHash.slice(0, -1) : noHash
    const trimmedNoSearch = noSearch.endsWith("/") ? noSearch.slice(0, -1) : noSearch
    return Array.from(new Set([rawUrl, noHash, noSearch, trimmedNoHash, trimmedNoSearch]))
  } catch {
    return [rawUrl]
  }
}

async function findJobForPageUrl(pageUrl: string, admin: ReturnType<typeof getSupabaseAdmin>) {
  const candidates = normalizedUrlCandidates(pageUrl)

  for (const candidate of candidates) {
    const { data } = await admin
      .from("job_ads")
      .select("id,headline,company,description_text,occupation_group_label,occupation_label,city,contact_email,skills_data,application_url,webpage_url,job_url")
      .or(`application_url.eq.${candidate},webpage_url.eq.${candidate},job_url.eq.${candidate}`)
      .limit(1)
      .maybeSingle()

    if (data) return data
  }

  try {
    const url = new URL(pageUrl)
    const basePath = `${url.origin}${url.pathname}`.replace(/\/$/, "")
    for (const column of ["application_url", "webpage_url", "job_url"] as const) {
      const { data } = await admin
        .from("job_ads")
        .select("id,headline,company,description_text,occupation_group_label,occupation_label,city,contact_email,skills_data,application_url,webpage_url,job_url")
        .ilike(column, `${basePath}%`)
        .limit(1)
        .maybeSingle()
      if (data) return data
    }
  } catch {
    return null
  }

  return null
}

export async function GET(req: Request) {
  const supabase = await getServerSupabase()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const admin = getSupabaseAdmin()
  const { data: profile, error } = await admin
    .from("candidate_profiles")
    .select("full_name,email,phone,city,street,cv_bucket_path,candidate_text_vector,search_keywords,experience_titles,education_titles")
    .eq("user_id", user.id)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const cvStoragePath = sanitizeCvStoragePath(profile?.cv_bucket_path)
  let cvSignedUrl: string | null = null

  if (cvStoragePath) {
    const { data: signed } = await admin.storage.from("cvs").createSignedUrl(cvStoragePath, 60 * 30)
    cvSignedUrl = signed?.signedUrl || null
  }

  const { firstName, lastName } = splitName(profile?.full_name)
  const pageUrl = new URL(req.url).searchParams.get("pageUrl")?.trim() || ""
  const matchedJob = pageUrl ? await findJobForPageUrl(pageUrl, admin) : null
  let generatedApplicationText = ""
  let generatedApplicationSubject = ""

  if (profile && matchedJob) {
    const email = await generateApplicationEmail({
      profile,
      job: {
        ...matchedJob,
        skills_data: matchedJob.skills_data as { required_skills?: string[]; preferred_skills?: string[] } | null | undefined,
      },
      anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    })
    const parsed = stripSubjectFromEmail(email)
    generatedApplicationText = parsed.body
    generatedApplicationSubject = parsed.subject
  }

  return NextResponse.json({
    data: {
      fullName: profile?.full_name || "",
      firstName,
      lastName,
      email: profile?.email || user.email || "",
      phone: profile?.phone || "",
      city: profile?.city || "",
      street: profile?.street || "",
      coverLetterContext: typeof profile?.candidate_text_vector === "string" ? profile.candidate_text_vector : "",
      generatedApplicationText,
      generatedApplicationSubject,
      matchedJob: matchedJob
        ? {
            id: matchedJob.id,
            headline: matchedJob.headline || "",
            company: matchedJob.company || "",
          }
        : null,
      cv: {
        signedUrl: cvSignedUrl,
        filename: guessFilename(cvStoragePath),
      },
    },
  })
}
