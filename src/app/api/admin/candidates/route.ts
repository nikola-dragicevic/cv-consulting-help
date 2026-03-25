import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getServerSupabase } from "@/lib/supabaseServer"
import { isAdminOrModerator } from "@/lib/admin"

function getSupabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!)
}

export async function GET() {
  const supabase = await getServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()

  if (!isAdminOrModerator(user)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabaseAdmin = getSupabaseAdmin()
  const { data, error } = await supabaseAdmin
    .from("candidate_profiles")
    .select("id,user_id,full_name,email,age,city,street,location_lat,location_lon,commute_radius_km,cv_file_url,cv_bucket_path,category_tags,primary_occupation_field,manual_premium,representation_active,representation_status,representation_current_period_end,created_at,candidate_text_vector,search_keywords,experience_titles,education_titles,seniority_reason,relevant_experience_years")
    .order("created_at", { ascending: false })
    .limit(300)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: data || [] })
}
