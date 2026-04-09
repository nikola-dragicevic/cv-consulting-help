import { NextResponse } from "next/server"
import { getServerSupabase } from "@/lib/supabaseServer"
import { getSupabaseAdmin } from "@/lib/supabaseAdmin"
import { generateApplicationEmail } from "@/lib/applicationEmail"
import { generateTailoredCvForJob, type JobAdContext } from "@/lib/cvGenerator"
import { cvTemplateDataToEditableText, parseCvTemplateData } from "@/lib/cvTemplate"

export const runtime = "nodejs"
export const maxDuration = 45

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
  if (!jobId) {
    return NextResponse.json({ error: "jobId is required" }, { status: 400 })
  }

  const admin = getSupabaseAdmin()
  const [{ data: profile }, { data: job }] = await Promise.all([
    admin
      .from("candidate_profiles")
      .select("id,full_name,email,phone,city,street,candidate_text_vector,search_keywords,experience_titles,education_titles,skills_text")
      .eq("user_id", user.id)
      .maybeSingle(),
    admin
      .from("job_ads")
      .select("id,headline,company,description_text,occupation_group_label,occupation_label,city,contact_email,skills_data")
      .eq("id", jobId)
      .maybeSingle(),
  ])

  if (!profile) {
    return NextResponse.json({ error: "Candidate profile not found" }, { status: 404 })
  }

  if (!job || typeof job.description_text !== "string" || !job.description_text.trim()) {
    return NextResponse.json({ error: "Job not found or missing description" }, { status: 404 })
  }

  const cvSourceText = typeof profile.candidate_text_vector === "string" ? profile.candidate_text_vector.trim() : ""
  if (!cvSourceText) {
    return NextResponse.json({ error: "No CV/profile text found on profile" }, { status: 400 })
  }

  const jobContext: JobAdContext = {
    headline: job.headline || "Rollen",
    company: job.company || null,
    description_text: job.description_text,
  }

  const [cv, email] = await Promise.all([
    generateTailoredCvForJob(profile, jobContext),
    generateApplicationEmail({
      profile,
      job: {
        ...job,
        skills_data: job.skills_data as { required_skills?: string[]; preferred_skills?: string[] } | null | undefined,
      },
      anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    }),
  ])

  const parsedCv = typeof cv === "string" ? parseCvTemplateData(cv) : null

  return NextResponse.json({
    cv,
    cvText: parsedCv ? cvTemplateDataToEditableText(parsedCv) : "",
    email,
    recipientEmail: job.contact_email || null,
  })
}
