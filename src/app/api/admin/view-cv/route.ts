import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getServerSupabase } from "@/lib/supabaseServer"
import { isAdminUser } from "@/lib/admin"

function getSupabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!)
}

export async function POST(req: Request) {
  const supabase = await getServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()

  if (!isAdminUser(user)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const pathRaw =
    typeof body?.path === "string" && body.path.trim()
      ? body.path.trim()
      : typeof body?.filename === "string" && body.filename.trim()
      ? body.filename.trim()
      : ""

  if (!pathRaw) {
    return NextResponse.json({ error: "Missing file path" }, { status: 400 })
  }

  const path = pathRaw.startsWith("cvs/") ? pathRaw.slice(4) : pathRaw
  const supabaseAdmin = getSupabaseAdmin()
  const { data, error } = await supabaseAdmin.storage
    .from("cvs")
    .createSignedUrl(path, 60 * 10)

  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: error?.message || "Could not create signed URL" }, { status: 500 })
  }

  return NextResponse.json({ signedUrl: data.signedUrl })
}
