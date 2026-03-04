// PATCH /api/admin/users/[id]/role
// Admin-only: sets or clears the role in app_metadata for a Supabase auth user.
// Body: { role: "moderator" | null }  — null removes the role (back to regular user)
import { NextResponse } from "next/server"
import { getServerSupabase } from "@/lib/supabaseServer"
import { isAdminUser } from "@/lib/admin"

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await getServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()

  // Only admins can change roles
  if (!isAdminUser(user)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id: targetUserId } = await params
  const body = await req.json()
  const role: string | null = body.role ?? null // "moderator" | null

  // Validate
  if (role !== null && role !== "moderator") {
    return NextResponse.json({ error: "Invalid role. Allowed: moderator or null" }, { status: 400 })
  }

  // Use Supabase Auth Admin API to update app_metadata
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_KEY!

  const res = await fetch(`${supabaseUrl}/auth/v1/admin/users/${targetUserId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "apikey": serviceKey,
      "Authorization": `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({
      app_metadata: { role: role ?? "" },
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    console.error("Supabase auth update failed:", errText)
    return NextResponse.json({ error: "Failed to update user role" }, { status: 500 })
  }

  return NextResponse.json({ success: true, role })
}
