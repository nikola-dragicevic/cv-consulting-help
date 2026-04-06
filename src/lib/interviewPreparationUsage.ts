import { getSupabaseAdmin } from "@/lib/supabaseAdmin"

export async function countCandidateInterviewPreparations(userId: string) {
  const admin = getSupabaseAdmin()
  const { count, error } = await admin
    .from("candidate_interview_preparations")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)

  if (error) {
    throw new Error(error.message)
  }

  return count ?? 0
}

export async function hasCandidateInterviewPreparation(userId: string, jobId: string) {
  const admin = getSupabaseAdmin()
  const { count, error } = await admin
    .from("candidate_interview_preparations")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("job_id", jobId)

  if (error) {
    throw new Error(error.message)
  }

  return (count ?? 0) > 0
}

export async function recordCandidateInterviewPreparation(userId: string, jobId: string) {
  const admin = getSupabaseAdmin()
  const { error } = await admin
    .from("candidate_interview_preparations")
    .upsert(
      {
        user_id: userId,
        job_id: jobId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,job_id" }
    )

  if (error) {
    throw new Error(error.message)
  }
}

