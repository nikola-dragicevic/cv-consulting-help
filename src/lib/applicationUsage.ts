import { getSupabaseAdmin } from "@/lib/supabaseAdmin"

export const FREE_AUTO_APPLY_APPLICATIONS = 2

export async function countCandidateApplications(userId: string) {
  const admin = getSupabaseAdmin()
  const { count, error } = await admin
    .from("candidate_job_applications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)

  if (error) {
    throw new Error(error.message)
  }

  return count ?? 0
}

export async function recordCandidateApplication(params: {
  userId: string
  jobId: string
  channel: "direct_email" | "external_apply" | "unknown"
  submissionSource: "mailbox_send" | "self_reported"
  recipientEmail?: string | null
}) {
  const admin = getSupabaseAdmin()
  const { error } = await admin
    .from("candidate_job_applications")
    .upsert(
      {
        user_id: params.userId,
        job_id: params.jobId,
        channel: params.channel,
        submission_source: params.submissionSource,
        recipient_email: params.recipientEmail ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,job_id" }
    )

  if (error) {
    throw new Error(error.message)
  }
}
