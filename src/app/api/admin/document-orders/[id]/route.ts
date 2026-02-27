import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getServerSupabase } from "@/lib/supabaseServer"
import { isAdminUser } from "@/lib/admin"

function getSupabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!)
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await getServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()

  if (!isAdminUser(user)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await ctx.params
  const body = await req.json().catch(() => ({}))
  const status = typeof body?.status === "string" ? body.status : undefined
  const deliveryNotes =
    typeof body?.deliveryNotes === "string" ? body.deliveryNotes.trim() : undefined

  const allowedStatuses = new Set(["paid", "in_progress", "delivered", "cancelled", "failed", "checkout_created", "draft"])
  if (status && !allowedStatuses.has(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 })
  }

  const patch: Record<string, unknown> = {}
  if (status) patch.status = status
  if (deliveryNotes !== undefined) patch.delivery_notes = deliveryNotes || null
  if (status === "delivered") {
    patch.delivered_at = new Date().toISOString()
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No updates provided" }, { status: 400 })
  }

  const supabaseAdmin = getSupabaseAdmin()
  const { data, error } = await supabaseAdmin
    .from("document_orders")
    .update(patch)
    .eq("id", id)
    .select("id,status,delivery_notes,delivered_at,updated_at")
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}
