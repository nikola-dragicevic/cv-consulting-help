import { NextResponse } from "next/server"
import { getServerSupabase } from "@/lib/supabaseServer"
import { countCandidateApplications, FREE_AUTO_APPLY_APPLICATIONS, recordCandidateApplication } from "@/lib/applicationUsage"
import { getSupabaseAdmin } from "@/lib/supabaseAdmin"

export const runtime = "nodejs"

export async function POST(req: Request) {
  const supabase = await getServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const jobId = typeof body?.jobId === "string" ? body.jobId.trim() : ""
  const channel = body?.channel === "direct_email" || body?.channel === "external_apply" ? body.channel : "unknown"

  if (!jobId) {
    return NextResponse.json({ error: "jobId is required" }, { status: 400 })
  }

  const admin = getSupabaseAdmin()
  const { data: profile } = await admin
    .from("candidate_profiles")
    .select("representation_active")
    .eq("user_id", user.id)
    .maybeSingle()

  const hasAutoApplySubscription = profile?.representation_active === true
  const usedBefore = await countCandidateApplications(user.id)

  const { count: existingCount, error: existingError } = await admin
    .from("candidate_job_applications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("job_id", jobId)

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 })
  }

  const alreadyRecorded = (existingCount ?? 0) > 0

  if (!hasAutoApplySubscription && !alreadyRecorded && usedBefore >= FREE_AUTO_APPLY_APPLICATIONS) {
    return NextResponse.json(
      {
        error: "Du har använt dina 2 fria ansökningar. Starta Auto Apply 300 kr/mån för att fortsätta.",
        freeApplicationsUsed: usedBefore,
        freeApplicationsRemaining: 0,
      },
      { status: 402 }
    )
  }

  try {
    await recordCandidateApplication({
      userId: user.id,
      jobId,
      channel,
      submissionSource: "self_reported",
    })

    const usedAfter = alreadyRecorded ? usedBefore : usedBefore + 1

    return NextResponse.json({
      success: true,
      freeApplicationsUsed: usedAfter,
      freeApplicationsRemaining: hasAutoApplySubscription ? FREE_AUTO_APPLY_APPLICATIONS : Math.max(0, FREE_AUTO_APPLY_APPLICATIONS - usedAfter),
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not record application" },
      { status: 500 }
    )
  }
}
