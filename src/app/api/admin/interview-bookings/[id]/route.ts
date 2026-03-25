import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getServerSupabase } from "@/lib/supabaseServer"
import { isAdminOrModerator } from "@/lib/admin"
import { isEmployerFollowupStatus } from "@/lib/interviewFollowup"

function getSupabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!)
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await getServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!isAdminOrModerator(user)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const adminFollowupStatus =
    typeof body?.adminFollowupStatus === "string" ? body.adminFollowupStatus.trim() : ""

  if (!adminFollowupStatus || !isEmployerFollowupStatus(adminFollowupStatus)) {
    return NextResponse.json({ error: "adminFollowupStatus is required" }, { status: 400 })
  }

  const patch: Record<string, unknown> = { admin_followup_status: adminFollowupStatus }
  const nowIso = new Date().toISOString()
  if (adminFollowupStatus === "salary_confirmed") patch.salary_confirmed_at = nowIso
  if (adminFollowupStatus === "active_billing") patch.active_billing_at = nowIso
  if (adminFollowupStatus === "employment_ended") patch.employment_ended_at = nowIso.slice(0, 10)

  const admin = getSupabaseAdmin()
  const { data, error } = await admin
    .from("employer_interview_bookings")
    .update(patch)
    .eq("id", id)
    .select(
      "id,admin_saved_job_id,candidate_profile_id,company_name,contact_name,contact_email,contact_phone,meeting_link,booking_date,start_time,end_time,status,admin_followup_status,created_at,followup_token,employer_followup_email_sent_at,employer_followup_completed_at,employer_followup_notes,agreed_base_salary_sek,employment_start_date,employment_type,employment_contract_signed,proof_document_path,proof_document_name,salary_confirmed_at,active_billing_at,employment_ended_at"
    )
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
