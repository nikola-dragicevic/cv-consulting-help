// src/app/api/admin/saved-jobs/[id]/route.ts
import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getServerSupabase } from "@/lib/supabaseServer"
import { isAdminOrModerator } from "@/lib/admin"

function getSupabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!)
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await getServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!isAdminOrModerator(user)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const admin = getSupabaseAdmin()
  const { error } = await admin.from("admin_saved_jobs").delete().eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await getServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!isAdminOrModerator(user)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const admin = getSupabaseAdmin()

  const patch: Record<string, unknown> = {}
  if ("notes" in body) patch.notes = body.notes
  if ("interviewAnalysis" in body) patch.interview_analysis = body.interviewAnalysis
  if ("manualContactEmail" in body) patch.manual_contact_email = body.manualContactEmail
  if ("emailSent" in body) patch.email_sent = body.emailSent
  if (body.emailSent === true) patch.email_sent_at = new Date().toISOString()

  const { data, error } = await admin
    .from("admin_saved_jobs")
    .update(patch)
    .eq("id", id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
