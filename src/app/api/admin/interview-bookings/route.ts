import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getServerSupabase } from "@/lib/supabaseServer"
import { isAdminOrModerator } from "@/lib/admin"

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
      "id,admin_saved_job_id,candidate_profile_id,company_name,contact_name,contact_email,contact_phone,booking_date,start_time,end_time,status,admin_followup_status,created_at"
    )
    .order("booking_date", { ascending: true })
    .order("start_time", { ascending: true })
    .limit(500)

  if (candidateProfileId) {
    query = query.eq("candidate_profile_id", candidateProfileId)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data: data || [] })
}
