import { NextResponse } from "next/server"
import { getServerSupabase } from "@/lib/supabaseServer"
import { getSupabaseAdmin } from "@/lib/supabaseAdmin"

export const runtime = "nodejs"

function sanitizeCvStoragePath(value: string | null | undefined) {
  if (!value) return null
  return value.startsWith("cvs/") ? value.slice(4) : value
}

function guessFilename(path: string | null) {
  if (!path) return "cv.pdf"
  const last = path.split("/").pop() || "cv.pdf"
  return last.includes(".") ? last : `${last}.pdf`
}

export async function GET() {
  const supabase = await getServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const admin = getSupabaseAdmin()
  const { data: profile } = await admin
    .from("candidate_profiles")
    .select("cv_bucket_path")
    .eq("user_id", user.id)
    .maybeSingle()

  const cvStoragePath = sanitizeCvStoragePath(profile?.cv_bucket_path)
  if (!cvStoragePath) {
    return NextResponse.json({ error: "No CV found on profile" }, { status: 404 })
  }

  const { data: signed, error } = await admin.storage.from("cvs").createSignedUrl(cvStoragePath, 60 * 15)
  if (error || !signed?.signedUrl) {
    return NextResponse.json({ error: error?.message || "Could not create CV download url" }, { status: 500 })
  }

  return NextResponse.json({
    data: {
      url: signed.signedUrl,
      filename: guessFilename(cvStoragePath),
    },
  })
}
