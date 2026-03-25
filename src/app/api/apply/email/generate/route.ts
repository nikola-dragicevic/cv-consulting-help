import { NextResponse } from "next/server"
import { getServerSupabase } from "@/lib/supabaseServer"
import { getSupabaseAdmin } from "@/lib/supabaseAdmin"
import { generateApplicationEmail } from "@/lib/applicationEmail"

export const runtime = "nodejs"
export const maxDuration = 30

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
      .select("id,full_name,email,phone,city,candidate_text_vector,search_keywords,experience_titles,education_titles,skills_text")
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

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 })
  }

  const email = await generateApplicationEmail({
    profile,
    job: {
      ...job,
      skills_data: job.skills_data as { required_skills?: string[]; preferred_skills?: string[] } | null | undefined,
    },
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  })

  return NextResponse.json({ email })
}
