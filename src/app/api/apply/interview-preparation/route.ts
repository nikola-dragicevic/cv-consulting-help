import { NextResponse } from "next/server"
import { getServerSupabase } from "@/lib/supabaseServer"
import { getSupabaseAdmin } from "@/lib/supabaseAdmin"
import { generateInterviewPreparation } from "@/lib/interviewPrep"
import {
  countCandidateInterviewPreparations,
  hasCandidateInterviewPreparation,
  recordCandidateInterviewPreparation,
} from "@/lib/interviewPreparationUsage"
import { canUseQuota, getRemainingQuota, getUserEntitlements } from "@/lib/subscriptionEntitlements"

export const runtime = "nodejs"
export const maxDuration = 30

const QUESTIONS_SYSTEM_PROMPT = `Du hjälper en kandidat att förbereda sig inför intervju på svenska.

Skriv 4 till 6 sannolika intervjufrågor som kandidaten borde förbereda sig på.

REGLER:
- bara punktlista
- varje fråga på en egen rad
- inga påhittade fakta
- fokusera på frågor som verkligen är rimliga utifrån rollen och annonsen`

function fallbackQuestions(jobHeadline: string) {
  return [
    `Berätta kort om din bakgrund och varför du söker rollen som ${jobHeadline || "den här tjänsten"}.`,
    "Vilka tidigare erfarenheter är mest relevanta för den här rollen?",
    "Hur har du arbetat med liknande ansvar eller tekniker tidigare?",
    "Hur prioriterar du när tempot är högt eller flera uppgifter kommer samtidigt?",
    "Varför vill du arbeta hos just den här arbetsgivaren?",
  ].join("\n")
}

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
  if (!jobId) {
    return NextResponse.json({ error: "jobId is required" }, { status: 400 })
  }

  const [usedBefore, alreadyRecorded, entitlements] = await Promise.all([
    countCandidateInterviewPreparations(user.id),
    hasCandidateInterviewPreparation(user.id, jobId),
    getUserEntitlements({
      userId: user.id,
      email: user.email,
    }),
  ])

  if (!canUseQuota(entitlements.interviewPreparationLimit, usedBefore, alreadyRecorded)) {
    return NextResponse.json(
      {
        error: entitlements.hasActiveSubscription
          ? "Du har använt dina 4 intervjuförberedelser i Premium Dashboard. Uppgradera till Auto Apply för obegränsat."
          : "Du har använt dina 2 fria intervjuförberedelser. Starta Auto Apply 300 kr/mån för att fortsätta.",
        interviewPreparationsUsed: usedBefore,
        interviewPreparationsRemaining: 0,
        interviewPreparationLimit: entitlements.interviewPreparationLimit,
      },
      { status: 402 }
    )
  }

  const admin = getSupabaseAdmin()
  const { data: job } = await admin
    .from("job_ads")
    .select("headline,company,description_text")
    .eq("id", jobId)
    .maybeSingle()

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 })
  }

  const preparation = await generateInterviewPreparation({
    companyName: job.company || "Arbetsgivaren",
    jobHeadline: job.headline || "rollen",
    jobDescription: job.description_text || "",
  })

  const key = process.env.ANTHROPIC_API_KEY
  if (!key) {
    await recordCandidateInterviewPreparation(user.id, jobId)

    const usedAfter = alreadyRecorded ? usedBefore : usedBefore + 1

    return NextResponse.json({
      preparation,
      likelyQuestions: fallbackQuestions(job.headline || "rollen"),
      interviewPreparationsUsed: usedAfter,
      interviewPreparationsRemaining: getRemainingQuota(entitlements.interviewPreparationLimit, usedAfter),
      interviewPreparationLimit: entitlements.interviewPreparationLimit,
    })
  }

  const userPrompt = `Bolag: ${job.company || "Arbetsgivaren"}
Roll: ${job.headline || "saknas"}

Jobbannons:
${String(job.description_text || "").slice(0, 2600)}`

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 500,
        temperature: 0.3,
        system: QUESTIONS_SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      }),
    })

    const json = await res.json().catch(() => null)
    const likelyQuestions = typeof json?.content?.[0]?.text === "string"
      ? json.content[0].text.trim()
      : ""

    await recordCandidateInterviewPreparation(user.id, jobId)

    const usedAfter = alreadyRecorded ? usedBefore : usedBefore + 1

    return NextResponse.json({
      preparation,
      likelyQuestions: likelyQuestions || fallbackQuestions(job.headline || "rollen"),
      interviewPreparationsUsed: usedAfter,
      interviewPreparationsRemaining: getRemainingQuota(entitlements.interviewPreparationLimit, usedAfter),
      interviewPreparationLimit: entitlements.interviewPreparationLimit,
    })
  } catch {
    await recordCandidateInterviewPreparation(user.id, jobId)

    const usedAfter = alreadyRecorded ? usedBefore : usedBefore + 1

    return NextResponse.json({
      preparation,
      likelyQuestions: fallbackQuestions(job.headline || "rollen"),
      interviewPreparationsUsed: usedAfter,
      interviewPreparationsRemaining: getRemainingQuota(entitlements.interviewPreparationLimit, usedAfter),
      interviewPreparationLimit: entitlements.interviewPreparationLimit,
    })
  }
}
