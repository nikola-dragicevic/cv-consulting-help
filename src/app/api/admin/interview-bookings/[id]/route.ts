import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getServerSupabase } from "@/lib/supabaseServer"
import { isAdminOrModerator } from "@/lib/admin"

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

  if (!adminFollowupStatus) {
    return NextResponse.json({ error: "adminFollowupStatus is required" }, { status: 400 })
  }

  const admin = getSupabaseAdmin()
  const { data, error } = await admin
    .from("employer_interview_bookings")
    .update({ admin_followup_status: adminFollowupStatus })
    .eq("id", id)
    .select(
      "id,admin_saved_job_id,candidate_profile_id,company_name,contact_name,contact_email,contact_phone,booking_date,start_time,end_time,status,admin_followup_status,created_at"
    )
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
