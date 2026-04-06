import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getServerSupabase } from "@/lib/supabaseServer"
import { isAdminUser } from "@/lib/admin"

function getSupabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!)
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await getServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()

  if (!isAdminUser(user)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params
  const body = await req.json()
  const patch: Record<string, unknown> = {}

  if (typeof body.manual_premium === "boolean") {
    patch.manual_premium = body.manual_premium
  }

  if (typeof body.representation_active === "boolean") {
    patch.representation_active = body.representation_active
    patch.representation_status = body.representation_active
      ? typeof body.representation_status === "string" && body.representation_status.trim()
        ? body.representation_status.trim()
        : "manual_grant"
      : null
    patch.representation_current_period_end =
      body.representation_active && typeof body.representation_current_period_end === "string"
        ? body.representation_current_period_end
        : null
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 })
  }

  const supabaseAdmin = getSupabaseAdmin()
  const { error } = await supabaseAdmin
    .from("candidate_profiles")
    .update(patch)
    .eq("id", id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
