import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabaseAdmin"
import { getClientIp } from "@/lib/outreach"

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
}

function getFirstName(fullName: string | null | undefined) {
  const trimmed = typeof fullName === "string" ? fullName.trim() : ""
  if (!trimmed) return "Kandidaten"
  return trimmed.split(/\s+/)[0] || "Kandidaten"
}

function findKeywordHits(textParts: Array<string | null | undefined>, keywords: string[]) {
  if (keywords.length === 0) return []
  const haystack = textParts
    .filter(Boolean)
    .join("\n")
    .toLocaleLowerCase("sv-SE")
  const hits = new Set<string>()

  for (const keyword of keywords) {
    const normalized = keyword.trim()
    if (!normalized) continue
    if (haystack.includes(normalized.toLocaleLowerCase("sv-SE"))) {
      hits.add(normalized)
    }
  }

  return Array.from(hits)
}

function fitLabelFromEvidence(params: {
  semanticSimilarity: number | null
  taxonomyFit: boolean
  keywordHitCount: number
  keywordMissCount: number
}) {
  const { semanticSimilarity, taxonomyFit, keywordHitCount, keywordMissCount } = params

  if (
    taxonomyFit &&
    keywordHitCount >= 4 &&
    keywordMissCount <= 1 &&
    semanticSimilarity !== null &&
    semanticSimilarity >= 0.78
  ) {
    return "Perfekt match"
  }

  if (
    taxonomyFit &&
    keywordHitCount >= 2 &&
    keywordMissCount <= 2 &&
    (semanticSimilarity === null || semanticSimilarity >= 0.68)
  ) {
    return "Mycket bra match"
  }

  return "Bra match"
}

function cosineSimilarity(a: number[], b: number[]) {
  if (!a.length || !b.length || a.length !== b.length) return null
  let dot = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }

  if (!normA || !normB) return null
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

function toMinutes(timeValue: string) {
  const [hours, minutes] = timeValue.slice(0, 5).split(":").map(Number)
  return hours * 60 + minutes
}

function toTimeString(totalMinutes: number) {
  const hours = String(Math.floor(totalMinutes / 60)).padStart(2, "0")
  const minutes = String(totalMinutes % 60).padStart(2, "0")
  return `${hours}:${minutes}:00`
}

function overlaps(startA: number, endA: number, startB: number, endB: number) {
  return startA < endB && endA > startB
}

function buildSwedishProfileSummary(params: {
  firstName: string
  experienceTitles: string[]
  educationTitles: string[]
  keywordHits: string[]
  matchedRequiredSkills: string[]
}) {
  const parts: string[] = []

  if (params.experienceTitles.length > 0) {
    parts.push(
      `${params.firstName} har relevant erfarenhet som ${params.experienceTitles.slice(0, 3).join(", ")}.`
    )
  }

  if (params.keywordHits.length > 0) {
    parts.push(
      `Profilen har tydlig koppling till rollen genom erfarenhet inom ${params.keywordHits.slice(0, 4).join(", ")}.`
    )
  }

  if (params.matchedRequiredSkills.length > 0) {
    parts.push(
      `Annonsens viktigaste krav matchas inom ${params.matchedRequiredSkills.slice(0, 3).join(", ")}.`
    )
  }

  if (params.educationTitles.length > 0) {
    parts.push(`Utbildningsbakgrunden inkluderar ${params.educationTitles.slice(0, 2).join(" och ")}.`)
  }

  if (parts.length === 0) {
    return `${params.firstName} har en profil med relevant erfarenhet och kompetens för rollen.`
  }

  return parts.join(" ")
}

function buildSwedishSenioritySummary(params: {
  experienceTitles: string[]
  matchedRequiredSkills: string[]
  keywordHits: string[]
}) {
  if (params.experienceTitles.length > 0 && params.matchedRequiredSkills.length > 0) {
    return `Kandidaten visar relevant erfarenhetsnivå genom praktiskt arbete i närliggande roller och match mot flera av annonsens viktigaste krav.`
  }

  if (params.experienceTitles.length >= 2) {
    return `Kandidaten har byggt upp relevant erfarenhet över flera tekniska roller och har en bakgrund som passar fortsatt fördjupning i området.`
  }

  if (params.keywordHits.length > 0) {
    return `Kandidaten har relevant bakgrund inom flera delar av rollen och bedöms ha en nivå som passar för fortsatt dialog.`
  }

  return `Kandidaten bedöms ha relevant erfarenhetsnivå för att vara intressant för vidare dialog.`
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ token: string }> }
) {
  const { token } = await ctx.params
  const admin = getSupabaseAdmin()

  const { data: link, error: linkError } = await admin
    .from("employer_intro_links")
    .select("id,admin_saved_job_id,candidate_profile_id,job_id,status,terms_version")
    .eq("token", token)
    .eq("status", "active")
    .maybeSingle()

  if (linkError) {
    return NextResponse.json({ error: linkError.message }, { status: 500 })
  }
  if (!link) {
    return NextResponse.json({ error: "Link not found" }, { status: 404 })
  }

  await admin.from("employer_intro_page_events").insert({
    employer_intro_link_id: link.id,
    admin_saved_job_id: link.admin_saved_job_id,
    candidate_profile_id: link.candidate_profile_id,
    event_type: "page_view",
    occurred_at: new Date().toISOString(),
    ip_address: getClientIp(req),
    user_agent: req.headers.get("user-agent"),
    referrer: req.headers.get("referer"),
    metadata: {
      termsVersion: link.terms_version,
    },
  })

  const [{ data: savedJob }, { data: candidate }, { data: jobRow }, { data: slots }, { data: acceptance }, { data: bookings }] = await Promise.all([
    admin
      .from("admin_saved_jobs")
      .select("id,candidate_label,headline,company,city,distance_km,occupation_group_label,search_keyword,candidate_cv_text,notes,interview_analysis")
      .eq("id", link.admin_saved_job_id)
      .single(),
    link.candidate_profile_id
      ? admin
          .from("candidate_profiles")
          .select(
            "id,full_name,city,category_tags,search_keywords,experience_titles,education_titles,seniority_reason,experience_summary,skills_text,job_offer_consent,profile_vector"
          )
          .eq("id", link.candidate_profile_id)
          .single()
      : Promise.resolve({ data: null }),
    link.job_id
      ? admin
          .from("job_ads")
          .select("headline,description_text,occupation_group_label,occupation_label,skills_data,embedding")
          .eq("id", link.job_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    link.candidate_profile_id
      ? admin
          .from("candidate_interview_slots")
          .select("id,slot_date,start_time,end_time")
          .eq("candidate_profile_id", link.candidate_profile_id)
          .eq("is_booked", false)
          .order("slot_date", { ascending: true })
          .order("start_time", { ascending: true })
      : Promise.resolve({ data: [] }),
    admin
      .from("employer_intro_acceptances")
      .select("id,company_name,contact_name,contact_email,accepted_at")
      .eq("employer_intro_link_id", link.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    link.candidate_profile_id
      ? admin
          .from("employer_interview_bookings")
          .select("candidate_slot_id,booking_date,start_time,end_time")
          .eq("candidate_profile_id", link.candidate_profile_id)
      : Promise.resolve({ data: [] }),
  ])

  const firstName = getFirstName(candidate?.full_name || savedJob?.candidate_label || null)
  const categoryTags = toStringArray((candidate as { category_tags?: unknown } | null)?.category_tags)
  const searchKeywords = toStringArray(candidate?.search_keywords)
  const experienceTitles = toStringArray(candidate?.experience_titles)
  const educationTitles = toStringArray(candidate?.education_titles)
  const candidateSkillsText = typeof candidate?.skills_text === "string" ? candidate.skills_text : ""
  const candidateCvText = typeof savedJob?.candidate_cv_text === "string" ? savedJob.candidate_cv_text : ""
  const jobDescription = typeof jobRow?.description_text === "string" ? jobRow.description_text : ""
  const jobGroup =
    typeof jobRow?.occupation_group_label === "string"
      ? jobRow.occupation_group_label
      : typeof savedJob?.occupation_group_label === "string"
        ? savedJob.occupation_group_label
        : ""
  const jobOccupationLabel = typeof jobRow?.occupation_label === "string" ? jobRow.occupation_label : ""
  const jobSkillsRequired = toStringArray((jobRow?.skills_data as { required_skills?: string[] } | null)?.required_skills)
  const jobSkillsPreferred = toStringArray((jobRow?.skills_data as { preferred_skills?: string[] } | null)?.preferred_skills)
  const profileVector = Array.isArray((candidate as { profile_vector?: unknown } | null)?.profile_vector)
    ? ((candidate as { profile_vector: number[] }).profile_vector)
    : []
  const jobVector = Array.isArray(jobRow?.embedding) ? (jobRow.embedding as number[]) : []
  const semanticSimilarity = cosineSimilarity(profileVector, jobVector)
  const keywordHits = findKeywordHits(
    [savedJob?.headline, jobDescription, jobGroup, jobOccupationLabel],
    searchKeywords
  )
  const keywordMisses = searchKeywords.filter((keyword) => !keywordHits.includes(keyword)).slice(0, 5)
  const matchedRequiredSkills = findKeywordHits(
    [candidateSkillsText, candidateCvText, experienceTitles.join(", "), educationTitles.join(", ")],
    jobSkillsRequired
  )
  const matchedPreferredSkills = findKeywordHits(
    [candidateSkillsText, candidateCvText, experienceTitles.join(", "), educationTitles.join(", ")],
    jobSkillsPreferred
  )
  const taxonomyFit = jobGroup ? categoryTags.includes(jobGroup) : false
  const fitLabel = fitLabelFromEvidence({
    semanticSimilarity,
    taxonomyFit,
    keywordHitCount: keywordHits.length,
    keywordMissCount: keywordMisses.length,
  })
  const whyFit = [
    keywordHits.length > 0
      ? `${firstName} har tydlig rollmatch genom erfarenhet inom ${keywordHits.slice(0, 3).join(", ")}.`
      : "",
    matchedRequiredSkills.length > 0
      ? `Annonsens krav matchas inom ${matchedRequiredSkills.slice(0, 3).join(", ")}.`
      : "",
    typeof savedJob?.distance_km === "number"
      ? `Kandidaten finns ${savedJob.distance_km.toFixed(1)} km från tjänsten, vilket förenklar tillgänglighet och start.`
      : "",
    candidate?.seniority_reason
      ? `Erfarenhetsnivån bedöms som relevant för rollen.`
      : "",
  ].filter(Boolean)
  const swedishProfileSummary = buildSwedishProfileSummary({
    firstName,
    experienceTitles,
    educationTitles,
    keywordHits,
    matchedRequiredSkills,
  })
  const swedishSenioritySummary = buildSwedishSenioritySummary({
    experienceTitles,
    matchedRequiredSkills,
    keywordHits,
  })

  const availableChunks = (slots || []).flatMap((slot) => {
    const slotStart = toMinutes(slot.start_time)
    const slotEnd = toMinutes(slot.end_time)
    const relatedBookings = (bookings || []).filter(
      (booking) => booking.candidate_slot_id === slot.id && booking.booking_date === slot.slot_date
    )

    const chunks: Array<{ id: string; source_slot_id: string; slot_date: string; start_time: string; end_time: string }> = []
    for (let cursor = slotStart; cursor + 60 <= slotEnd; cursor += 30) {
      const chunkStart = cursor
      const chunkEnd = cursor + 60
      const isTaken = relatedBookings.some((booking) =>
        overlaps(chunkStart, chunkEnd, toMinutes(booking.start_time), toMinutes(booking.end_time))
      )
      if (isTaken) continue

      const startTime = toTimeString(chunkStart)
      const endTime = toTimeString(chunkEnd)
      chunks.push({
        id: `${slot.id}:${startTime}:${endTime}`,
        source_slot_id: slot.id,
        slot_date: slot.slot_date,
        start_time: startTime,
        end_time: endTime,
      })
    }
    return chunks
  })

  return NextResponse.json({
    link: {
      id: link.id,
      termsVersion: link.terms_version,
    },
    savedJob,
    candidate,
    analysis: {
      firstName,
      fitLabel,
      semanticSimilarity,
      keywordHits,
      keywordMisses,
      matchedRequiredSkills,
      matchedPreferredSkills,
      whyFit,
      taxonomyFit,
      swedishProfileSummary,
      swedishSenioritySummary,
    },
    interviewerAnalysis:
      typeof savedJob?.interview_analysis === "string" && savedJob.interview_analysis.trim()
        ? savedJob.interview_analysis.trim()
        : null,
    slots: availableChunks,
    acceptance: acceptance || null,
  })
}
