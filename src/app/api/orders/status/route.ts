// GET /api/orders/status?id=<document_order_id>
// Returns generation status + generated content for the authenticated user's order.
// Used by SuccessClient to poll until generation is complete.

import { NextResponse } from "next/server"
import { getServerSupabase } from "@/lib/supabaseServer"

export async function GET(req: Request) {
  try {
    const supabase = await getServerSupabase()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const id = searchParams.get("id")
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 })

    const { data, error } = await supabase
      .from("document_orders")
      .select("id, status, package_flow, cv_generation_status, generated_cv_text, generated_letter_text, intake_full_name")
      .eq("id", id)
      .eq("user_id", user.id)
      .single()

    if (error || !data) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 })
    }

    return NextResponse.json({
      id: data.id,
      status: data.status,
      packageFlow: data.package_flow,
      generationStatus: data.cv_generation_status ?? null,
      generatedCv: data.generated_cv_text ?? null,
      generatedLetter: data.generated_letter_text ?? null,
      name: data.intake_full_name ?? null,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
