import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getServerSupabase } from "@/lib/supabaseServer"
import { isAdminOrModerator } from "@/lib/admin"
import { buildEmployerFollowupUrl } from "@/lib/interviewFollowup"

function getSupabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!)
}

export async function GET(req: Request) {
  const supabase = await getServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!isAdminOrModerator(user)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const url = new URL(req.url)
  const candidateProfileId = url.searchParams.get("candidateProfileId")?.trim() || null
  const admin = getSupabaseAdmin()

  let query = admin
    .from("employer_interview_bookings")
    .select(
      "id,admin_saved_job_id,candidate_profile_id,company_name,contact_name,contact_email,contact_phone,meeting_link,booking_date,start_time,end_time,status,admin_followup_status,created_at,followup_token,employer_followup_email_sent_at,employer_followup_completed_at,employer_followup_notes,agreed_base_salary_sek,employment_start_date,employment_type,employment_contract_signed,proof_document_path,proof_document_name,salary_confirmed_at,active_billing_at,employment_ended_at"
    )
    .order("booking_date", { ascending: true })
    .order("start_time", { ascending: true })
    .limit(500)

  if (candidateProfileId) {
    query = query.eq("candidate_profile_id", candidateProfileId)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const enriched = await Promise.all(
    (data || []).map(async (booking) => {
      let proofDocumentUrl: string | null = null
      if (booking.proof_document_path) {
        const signed = await admin.storage
          .from("employer-proofs")
          .createSignedUrl(booking.proof_document_path, 60 * 60)
        proofDocumentUrl = signed.data?.signedUrl || null
      }

      return {
        ...booking,
        proof_document_url: proofDocumentUrl,
        followup_url: booking.followup_token ? buildEmployerFollowupUrl(booking.followup_token) : null,
      }
    })
  )

  return NextResponse.json({ data: enriched })
}
