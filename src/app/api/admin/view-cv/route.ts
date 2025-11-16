// src/app/api/admin/view-cv/route.ts
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY! // Service key gives admin access
)

export async function POST(req: NextRequest) {
  const { filename } = await req.json()

  if (!filename) {
    return NextResponse.json({ error: "Missing filename" }, { status: 400 })
  }

  const { data, error } = await supabase.storage
    .from("cvs")
    .createSignedUrl(filename, 60 * 60) // 1 hour

  if (error) {
    console.error("Signed URL error:", error)
    return NextResponse.json({ error: "Could not generate signed URL" }, { status: 500 })
  }

  return NextResponse.json({ signedUrl: data.signedUrl })
}
