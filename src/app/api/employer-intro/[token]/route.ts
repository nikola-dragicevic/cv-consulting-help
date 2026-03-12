import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

function getSupabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!)
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ token: string }> }
) {
  const { token } = await ctx.params
  const admin = getSupabaseAdmin()

  const { data: link, error: linkError } = await admin
    .from("employer_intro_links")
    .select("id,admin_saved_job_id,candidate_profile_id,job_id,status,terms_version")
    .eq("token", token)
    .eq("status", "active")
    .maybeSingle()

  if (linkError) {
    return NextResponse.json({ error: linkError.message }, { status: 500 })
  }
  if (!link) {
    return NextResponse.json({ error: "Link not found" }, { status: 404 })
  }

  const [{ data: savedJob }, { data: candidate }, { data: slots }, { data: acceptance }] = await Promise.all([
    admin
      .from("admin_saved_jobs")
      .select("id,candidate_label,headline,company,city,distance_km,occupation_group_label,search_keyword,candidate_cv_text,notes")
      .eq("id", link.admin_saved_job_id)
      .single(),
    link.candidate_profile_id
      ? admin
          .from("candidate_profiles")
          .select(
            "id,full_name,city,search_keywords,experience_titles,education_titles,seniority_reason,experience_summary,skills_text,job_offer_consent"
          )
          .eq("id", link.candidate_profile_id)
          .single()
      : Promise.resolve({ data: null }),
    link.candidate_profile_id
      ? admin
          .from("candidate_interview_slots")
          .select("id,slot_date,start_time,end_time")
          .eq("candidate_profile_id", link.candidate_profile_id)
          .eq("is_booked", false)
          .order("slot_date", { ascending: true })
          .order("start_time", { ascending: true })
      : Promise.resolve({ data: [] }),
    admin
      .from("employer_intro_acceptances")
      .select("id,company_name,contact_name,contact_email,accepted_at")
      .eq("employer_intro_link_id", link.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  return NextResponse.json({
    link: {
      id: link.id,
      termsVersion: link.terms_version,
    },
    savedJob,
    candidate,
    slots: slots || [],
    acceptance: acceptance || null,
  })
}
