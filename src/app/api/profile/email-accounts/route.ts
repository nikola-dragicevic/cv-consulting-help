import { NextResponse } from "next/server"
import { getServerSupabase } from "@/lib/supabaseServer"
import { getSupabaseAdmin } from "@/lib/supabaseAdmin"

export const runtime = "nodejs"

export async function GET() {
  const supabase = await getServerSupabase()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const admin = getSupabaseAdmin()
  const { data, error } = await admin
    .from("candidate_email_accounts")
    .select("provider,email,display_name,status,scopes,connected_at,disconnected_at,last_tested_at,last_error,updated_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    data: (data || []).map((row) => ({
      provider: row.provider,
      email: row.email,
      displayName: row.display_name,
      status: row.status,
      scopes: row.scopes || [],
      connectedAt: row.connected_at,
      disconnectedAt: row.disconnected_at,
      lastTestedAt: row.last_tested_at,
      lastError: row.last_error,
      updatedAt: row.updated_at,
    })),
  })
}

export async function DELETE(req: Request) {
  const supabase = await getServerSupabase()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const provider = typeof body?.provider === "string" ? body.provider.trim() : ""
  if (provider !== "google" && provider !== "microsoft") {
    return NextResponse.json({ error: "Invalid provider" }, { status: 400 })
  }

  const admin = getSupabaseAdmin()
  const { error } = await admin
    .from("candidate_email_accounts")
    .update({
      status: "revoked",
      encrypted_access_token: null,
      encrypted_refresh_token: null,
      access_token_expires_at: null,
      disconnected_at: new Date().toISOString(),
      last_error: null,
      metadata: { disconnectedByUser: true },
    })
    .eq("user_id", user.id)
    .eq("provider", provider)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
