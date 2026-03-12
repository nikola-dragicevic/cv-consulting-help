import { NextResponse } from "next/server"
import { getServerSupabase } from "@/lib/supabaseServer"

type DocumentOrderRow = {
  id: string
  package_flow: string | null
  cv_generation_status: string | null
  generated_cv_text: string | null
  generated_letter_text: string | null
  cv_generated_at: string | null
  created_at: string | null
}

export async function GET() {
  const supabase = await getServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { data, error } = await supabase
    .from("document_orders")
    .select("id, package_flow, cv_generation_status, generated_cv_text, generated_letter_text, cv_generated_at, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = (data || []) as DocumentOrderRow[]
  const latestOrder = rows[0] ?? null
  const latestCv = rows.find((row) => typeof row.generated_cv_text === "string" && row.generated_cv_text.trim()) ?? null
  const latestLetter =
    rows.find((row) => typeof row.generated_letter_text === "string" && row.generated_letter_text.trim()) ?? null

  return NextResponse.json({
    latestOrder: latestOrder
      ? {
          id: latestOrder.id,
          packageFlow: latestOrder.package_flow,
          generationStatus: latestOrder.cv_generation_status,
          createdAt: latestOrder.created_at,
        }
      : null,
    latestCv: latestCv
      ? {
          id: latestCv.id,
          generatedAt: latestCv.cv_generated_at ?? latestCv.created_at,
          content: latestCv.generated_cv_text,
        }
      : null,
    latestLetter: latestLetter
      ? {
          id: latestLetter.id,
          generatedAt: latestLetter.cv_generated_at ?? latestLetter.created_at,
          content: latestLetter.generated_letter_text,
        }
      : null,
  })
}
