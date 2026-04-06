// src/app/api/admin/generate-cv-freetext/route.ts
// Admin-only: generate a CV from pasted freeform text using the same JSON CV pipeline as /cv

import { NextResponse } from "next/server"
import { getServerSupabase } from "@/lib/supabaseServer"
import { isAdminOrModerator } from "@/lib/admin"
import { generateCvFromFreeText } from "@/lib/cvGenerator"

export const runtime = "nodejs"
export const maxDuration = 60

export async function POST(req: Request) {
  try {
    const supabase = await getServerSupabase()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!isAdminOrModerator(user)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { text } = await req.json()
    if (!text || typeof text !== "string" || text.trim().length < 10) {
      return NextResponse.json({ error: "Ange minst 10 tecken text" }, { status: 400 })
    }

    const cv = await generateCvFromFreeText(text)
    return NextResponse.json({ cv })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    console.error("[generate-cv-freetext]", msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
