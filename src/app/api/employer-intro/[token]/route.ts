import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabaseAdmin"
import { getClientIp } from "@/lib/outreach"

// ---------------------------------------------------------------------------
// Claude-powered employer analysis
// ---------------------------------------------------------------------------

type ClaudeEmployerAnalysis = {
  yearsExperience: number | null
  employerJudgment: { summary: string; bullets: string[] }
  shortProfile: string
  whyFit: string[]
  senioritySummary: string
}

type EmployerIntroSnapshot = {
  savedJob: {
    candidate_label: string
    headline: string | null
    company: string | null
    city: string | null
    distance_km: number | null
    occupation_group_label: string | null
    search_keyword: string | null
    candidate_cv_text: string | null
    interview_analysis?: string | null
    webpage_url?: string | null
  } | null
  candidate: {
    city: string | null
    category_tags: string[] | null
    search_keywords: string[] | null
    experience_titles: string[] | null
    education_titles: string[] | null
    seniority_reason: string | null
    experience_summary: string | null
    skills_text: string | null
  } | null
  analysis: {
    firstName: string
    fitLabel: "Perfekt match" | "Väldigt bra match"
    semanticSimilarity: number | null
    keywordHits: string[]
    keywordMisses: string[]
    matchedRequiredSkills: string[]
    matchedPreferredSkills: string[]
    whyFit: string[]
    taxonomyFit: boolean
    swedishProfileSummary: string
    swedishSenioritySummary: string
  }
  employerJudgment: {
    summary: string
    bullets: string[]
  }
  cvSections: {
    profile: string | null
    coreCompetencies: string[]
    detailedExperience: string[]
    experienceEntries: ExperienceEntry[]
    detailedEducation: string[]
    detailedCertifications: string[]
    detailedSkills: string[]
    references: string | null
    yearsExperience: number | null
  }
  interviewerAnalysis: string | null
}

async function callClaudeForEmployerAnalysis(params: {
  cvText: string
  jobHeadline: string
  jobCompany: string | null
  jobCity: string | null
  jobDescription: string
  firstName: string
  interviewAnalysis?: string | null
}): Promise<ClaudeEmployerAnalysis | null> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return null

  const systemPrompt = `Du är rekryteringsexpert på JobbNu. Din uppgift är att skriva en specifik och övertygande kandidatintroduktion för en arbetsgivare som fått ett tips om en kandidat.

REGLER:
1. Var KONKRET — nämn specifika arbetsgivare, exakta antal år, faktiska certifieringar från CV:t
2. Räkna erfarenhetsår korrekt: summera faktiska anställningsperioder från erfarenhetslistan, räkna INTE utbildningstid som yrkeserfarenhet
3. Undvik generiska fraser utan konkret belägg — "stark kandidat" är meningslöst utan specifika skäl
4. Skriv som om JobbNu personligen granskat och valt ut just denna kandidat för just detta uppdrag
5. Matcha kandidatens specifika bakgrund mot tjänstens krav — lyft fram de direkta kopplingarna
6. Tone: professionell, varm, övertygande — som en betrodd rekryteringspartner
7. Skriv på svenska
8. Om JobbNu intervjuanalys innehåller en viktig begränsning eller försiktighetspunkt ska den vägas in sakligt och professionellt

Returnera EXAKT följande JSON (ingen annan text):
{
  "yearsExperience": <heltal: antal år i yrket, räkna från CV:ts erfarenhetsposter>,
  "employerJudgment": {
    "summary": "<2-3 meningar: specifik bedömning av kandidaten för JUST DENNA tjänst, nämn konkreta matchpunkter och arbetsgivare/år>",
    "bullets": [
      "<specifik punkt 1 med konkret detalj från CV:t>",
      "<specifik punkt 2 med konkret detalj>",
      "<specifik punkt 3 med konkret detalj>",
      "<specifik punkt 4 om certifieringar eller praktisk styrka>"
    ]
  },
  "shortProfile": "<3-4 meningar: personlig profil som kopplar kandidatens konkreta bakgrund till just denna tjänst>",
  "whyFit": [
    "<specifik anledning 1 kopplad till tjänstens krav, med konkret bevis från CV:t>",
    "<specifik anledning 2 med konkret erfarenhet eller certifiering>",
    "<specifik anledning 3 om stabilitet, självständighet eller annan styrka>"
  ],
  "senioritySummary": "<1-2 meningar om erfarenhetsnivå med konkreta år och namngivna arbetsgivare>"
}`

  const userPrompt = `TJÄNST:
Titel: ${params.jobHeadline}
Företag: ${params.jobCompany || "ej angett"}
Plats: ${params.jobCity || "ej angett"}
Beskrivning:
${params.jobDescription.slice(0, 2000)}

KANDIDATENS CV (förnamn: ${params.firstName}):
${params.cvText.slice(0, 4000)}

JOBBNU INTERVJUANALYS:
${params.interviewAnalysis?.trim() || "saknas"}`

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
        max_tokens: 1500,
        temperature: 0.3,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    })

    if (!res.ok) return null
    const data = await res.json()
    const text = (data.content?.[0]?.text ?? "").trim()

    // Strip markdown code fences if present
    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim()
    const parsed = JSON.parse(cleaned) as ClaudeEmployerAnalysis
    return parsed
  } catch {
    return null
  }
}

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

function joinSwedishList(items: string[], maxItems = items.length) {
  const normalized = items.map((item) => item.trim()).filter(Boolean).slice(0, maxItems)
  if (normalized.length === 0) return ""
  if (normalized.length === 1) return normalized[0]
  if (normalized.length === 2) return `${normalized[0]} och ${normalized[1]}`
  return `${normalized.slice(0, -1).join(", ")} och ${normalized[normalized.length - 1]}`
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
    return "Väldigt bra match"
  }

  return "Väldigt bra match"
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

function normalizeHeading(value: string) {
  return value
    .toUpperCase()
    .replace(/[^\p{L}\p{N}&/ ]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
}

function parseCvSections(cvText: string) {
  const sectionMap = new Map<string, string>([
    ["PROFIL", "profile"],
    ["KARNKOMPETENSER", "core_competencies"],
    ["KÄRNKOMPETENSER", "core_competencies"],
    ["ERFARENHET", "experience"],
    ["UTBILDNING & BEHORIGHETER", "education"],
    ["UTBILDNING & BEHÖRIGHETER", "education"],
    ["CERTIFIERINGAR & TILLSTAND", "certifications"],
    ["CERTIFIERINGAR & TILLSTÅND", "certifications"],
    ["FARDIGHETER", "skills"],
    ["FÄRDIGHETER", "skills"],
    ["REFERENSER", "references"],
  ])

  const sections: Record<string, string[]> = {}
  let currentKey: string | null = null

  for (const rawLine of cvText.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) {
      if (currentKey) {
        sections[currentKey] = [...(sections[currentKey] || []), ""]
      }
      continue
    }

    const sectionKey = sectionMap.get(normalizeHeading(line))
    if (sectionKey) {
      currentKey = sectionKey
      if (!sections[currentKey]) sections[currentKey] = []
      continue
    }

    if (currentKey) {
      sections[currentKey] = [...(sections[currentKey] || []), line]
    }
  }

  return {
    profile: (sections.profile || []).join("\n").trim() || null,
    coreCompetencies: (sections.core_competencies || []).join("\n").trim() || null,
    experience: (sections.experience || []).join("\n").trim() || null,
    education: (sections.education || []).join("\n").trim() || null,
    certifications: (sections.certifications || []).join("\n").trim() || null,
    skills: (sections.skills || []).join("\n").trim() || null,
    references: (sections.references || []).join("\n").trim() || null,
  }
}

function toLineItems(value: string | null | undefined, limit = Number.POSITIVE_INFINITY) {
  if (!value) return []
  return value
    .split(/\n+/)
    .map((item) => item.replace(/^[•\-]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, limit)
}

function toBlocks(value: string | null | undefined, limit = Number.POSITIVE_INFINITY) {
  if (!value) return []
  return value
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .slice(0, limit)
}

type ExperienceEntry = {
  heading: string
  period: string | null
  bullets: string[]
}

function parseExperienceEntries(value: string | null | undefined, limit = 10): ExperienceEntry[] {
  if (!value) return []

  const blocks = value
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)

  return blocks.slice(0, limit).map((block) => {
    const lines = block
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)

    const heading = lines[0] || ""
    let period: string | null = null
    let bulletStart = 1

    if (lines[1] && /\b(19|20)\d{2}\b/.test(lines[1])) {
      period = lines[1]
      bulletStart = 2
    }

    const bullets = lines
      .slice(bulletStart)
      .map((line) => line.replace(/^[•\-]\s*/, "").trim())
      .filter(Boolean)

    return {
      heading,
      period,
      bullets,
    }
  })
}

function estimateExperienceYears(cvText: string) {
  const years = Array.from(cvText.matchAll(/\b(19|20)\d{2}\b/g)).map((match) => Number.parseInt(match[0], 10))
  if (years.length === 0) return null
  const earliestYear = Math.min(...years)
  const currentYear = new Date().getFullYear()
  return earliestYear > currentYear ? null : currentYear - earliestYear
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
      `${params.firstName} kommer från praktiskt arbete som ${joinSwedishList(params.experienceTitles, 3)}.`
    )
  }

  if (params.keywordHits.length > 0) {
    parts.push(
      `CV:t visar tydlig erfarenhet av ${joinSwedishList(params.keywordHits, 4)}.`
    )
  }

  if (params.matchedRequiredSkills.length > 0) {
    parts.push(
      `Annonsens viktigaste krav syns i erfarenhet av ${joinSwedishList(params.matchedRequiredSkills, 3)}.`
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
  firstName: string
  yearsExperience: number | null
  experienceTitles: string[]
  matchedRequiredSkills: string[]
  keywordHits: string[]
  coreCompetencies: string[]
}) {
  if (params.yearsExperience && params.yearsExperience >= 15) {
    return `${params.firstName} har en lång och konsekvent bakgrund i yrket med dokumenterad erfarenhet över många år.`
  }

  if (params.coreCompetencies.length >= 3) {
    return `CV:t visar bredd i både installation, service och felsökning, vilket gör profilen användbar i en roll där man behöver kunna ta hela uppdrag från start till lösning.`
  }

  if (params.experienceTitles.length > 0 && params.matchedRequiredSkills.length > 0) {
    return `Profilen visar praktisk erfarenhet nära rollen och match mot flera av annonsens viktigaste krav.`
  }

  if (params.experienceTitles.length >= 2) {
    return `Profilen visar en stabil teknisk bakgrund med erfarenhet som är relevant för fortsatt dialog.`
  }

  if (params.keywordHits.length > 0) {
    return `Profilen täcker flera viktiga delar av rollen och bedöms vara relevant för fortsatt dialog.`
  }

  return `Profilen bedöms ha relevant erfarenhetsnivå för att vara intressant för vidare dialog.`
}

function buildEmployerJudgment(params: {
  firstName: string
  fitLabel: string
  yearsExperience: number | null
  experienceEntries: ExperienceEntry[]
  coreCompetencies: string[]
  certifications: string[]
  keywordHits: string[]
}) {
  const summaryParts: string[] = []
  const fitVoice = params.fitLabel === "Perfekt match" ? "en mycket stark kandidat" : "en stark kandidat"
  const recentEntries = params.experienceEntries.slice(0, 2)

  summaryParts.push(
    `Efter genomgång av CV:t tycker vi att ${params.firstName} är ${fitVoice} för tjänsten.`
  )

  if (params.yearsExperience && params.yearsExperience >= 10) {
    summaryParts.push(
      `${params.firstName} har uppskattningsvis över ${params.yearsExperience} års dokumenterad erfarenhet i yrket.`
    )
  }

  if (recentEntries.length > 0) {
    summaryParts.push(
      `Den senaste bakgrunden omfattar bland annat ${joinSwedishList(recentEntries.map((entry) => entry.heading), 2)}.`
    )
  } else if (params.coreCompetencies.length > 0) {
    summaryParts.push(
      `Det som sticker ut är den tydliga bredden inom ${joinSwedishList(params.coreCompetencies, 4)}.`
    )
  }

  const bullets = [
    params.yearsExperience && params.yearsExperience >= 10
      ? `Det här är en kandidat med lång praktisk erfarenhet och vana att arbeta självständigt.`
      : "",
    params.keywordHits.length > 0
      ? `CV:t visar konkret erfarenhet av ${joinSwedishList(params.keywordHits, 3)}.`
      : "",
    recentEntries[0]
      ? `${recentEntries[0].heading}${recentEntries[0].period ? `, ${recentEntries[0].period}` : ""}: ${joinSwedishList(recentEntries[0].bullets.slice(0, 2), 2)}.`
      : "",
    recentEntries[1]
      ? `${recentEntries[1].heading}${recentEntries[1].period ? `, ${recentEntries[1].period}` : ""}: ${joinSwedishList(recentEntries[1].bullets.slice(0, 2), 2)}.`
      : "",
    params.certifications.length > 0
      ? `Behörigheter och tillstånd som stärker profilen inkluderar ${joinSwedishList(params.certifications, 4)}.`
      : "",
  ].filter(Boolean)

  return {
    summary: summaryParts.join(" "),
    bullets,
  }
}

async function buildEmployerIntroSnapshot(params: {
  admin: ReturnType<typeof getSupabaseAdmin>
  adminSavedJobId: string
  candidateProfileId: string | null
  jobId: string | null
}): Promise<EmployerIntroSnapshot> {
  const [{ data: savedJob }, { data: candidate }, { data: jobRow }] = await Promise.all([
    params.admin
      .from("admin_saved_jobs")
      .select("id,candidate_label,headline,company,city,distance_km,occupation_group_label,search_keyword,candidate_cv_text,notes,interview_analysis,webpage_url")
      .eq("id", params.adminSavedJobId)
      .single(),
    params.candidateProfileId
      ? params.admin
          .from("candidate_profiles")
          .select(
            "id,full_name,city,category_tags,search_keywords,experience_titles,education_titles,seniority_reason,experience_summary,skills_text,job_offer_consent,profile_vector"
          )
          .eq("id", params.candidateProfileId)
          .single()
      : Promise.resolve({ data: null }),
    params.jobId
      ? params.admin
          .from("job_ads")
          .select("headline,description_text,occupation_group_label,occupation_label,skills_data,embedding")
          .eq("id", params.jobId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const firstName = getFirstName(candidate?.full_name || savedJob?.candidate_label || null)
  const categoryTags = toStringArray((candidate as { category_tags?: unknown } | null)?.category_tags)
  const searchKeywords = toStringArray(candidate?.search_keywords)
  const experienceTitles = toStringArray(candidate?.experience_titles)
  const educationTitles = toStringArray(candidate?.education_titles)
  const candidateSkillsText = typeof candidate?.skills_text === "string" ? candidate.skills_text : ""
  const candidateCvText = typeof savedJob?.candidate_cv_text === "string" ? savedJob.candidate_cv_text : ""
  const cvSections = parseCvSections(candidateCvText)
  const coreCompetencyLines = toLineItems(cvSections.coreCompetencies, 10)
  const detailedExperienceBlocks = toBlocks(cvSections.experience, 10)
  const experienceEntries = parseExperienceEntries(cvSections.experience, 10)
  const detailedEducationLines = toLineItems(cvSections.education, 8)
  const detailedCertificationLines = toLineItems(cvSections.certifications, 8)
  const detailedSkillLines = toLineItems(cvSections.skills || candidateSkillsText, 12)
  const yearsExperience = estimateExperienceYears(candidateCvText)
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
      ? `${firstName} har tydlig rollmatch med praktisk erfarenhet av ${joinSwedishList(keywordHits, 3)}.`
      : "",
    matchedRequiredSkills.length > 0
      ? `Annonsens krav syns tydligt i erfarenhet av ${joinSwedishList(matchedRequiredSkills, 3)}.`
      : "",
    candidate?.seniority_reason
      ? `Bakgrunden ser stabil ut för den här typen av roll.`
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
    firstName,
    yearsExperience,
    experienceTitles,
    matchedRequiredSkills,
    keywordHits,
    coreCompetencies: coreCompetencyLines,
  })
  const employerJudgmentFallback = buildEmployerJudgment({
    firstName,
    fitLabel,
    yearsExperience,
    experienceEntries,
    coreCompetencies: coreCompetencyLines,
    certifications: detailedCertificationLines,
    keywordHits,
  })

  const claudeAnalysis = candidateCvText
      ? await callClaudeForEmployerAnalysis({
        cvText: candidateCvText,
        jobHeadline: savedJob?.headline || "",
        jobCompany: savedJob?.company || null,
        jobCity: savedJob?.city || null,
        jobDescription,
        firstName,
        interviewAnalysis:
          typeof savedJob?.interview_analysis === "string" ? savedJob.interview_analysis : null,
      })
    : null

  const finalEmployerJudgment = claudeAnalysis?.employerJudgment ?? employerJudgmentFallback
  const finalWhyFit = claudeAnalysis?.whyFit?.length ? claudeAnalysis.whyFit : whyFit
  const finalSwedishProfileSummary = claudeAnalysis?.shortProfile || swedishProfileSummary
  const finalSwedishSenioritySummary = claudeAnalysis?.senioritySummary || swedishSenioritySummary
  const finalYearsExperience = claudeAnalysis?.yearsExperience ?? yearsExperience

  return {
    savedJob,
    candidate: candidate
      ? {
          city: candidate.city,
          category_tags: candidate.category_tags,
          search_keywords: candidate.search_keywords,
          experience_titles: candidate.experience_titles,
          education_titles: candidate.education_titles,
          seniority_reason: candidate.seniority_reason,
          experience_summary: candidate.experience_summary,
          skills_text: candidate.skills_text,
        }
      : null,
    analysis: {
      firstName,
      fitLabel,
      semanticSimilarity,
      keywordHits,
      keywordMisses,
      matchedRequiredSkills,
      matchedPreferredSkills,
      whyFit: finalWhyFit,
      taxonomyFit,
      swedishProfileSummary: finalSwedishProfileSummary,
      swedishSenioritySummary: finalSwedishSenioritySummary,
    },
    employerJudgment: finalEmployerJudgment,
    cvSections: {
      profile: cvSections.profile,
      coreCompetencies: coreCompetencyLines,
      detailedExperience: detailedExperienceBlocks,
      experienceEntries,
      detailedEducation: detailedEducationLines,
      detailedCertifications: detailedCertificationLines,
      detailedSkills: detailedSkillLines,
      references: cvSections.references,
      yearsExperience: finalYearsExperience,
    },
    interviewerAnalysis:
      typeof savedJob?.interview_analysis === "string" && savedJob.interview_analysis.trim()
        ? savedJob.interview_analysis.trim()
        : null,
  }
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ token: string }> }
) {
  const { token } = await ctx.params
  const admin = getSupabaseAdmin()
  const url = new URL(req.url)
  const isWarmRequest = url.searchParams.get("warm") === "1"

  const { data: link, error: linkError } = await admin
    .from("employer_intro_links")
    .select("id,admin_saved_job_id,candidate_profile_id,job_id,status,terms_version,cached_intro_snapshot")
    .eq("token", token)
    .eq("status", "active")
    .maybeSingle()

  if (linkError) {
    return NextResponse.json({ error: linkError.message }, { status: 500 })
  }
  if (!link) {
    return NextResponse.json({ error: "Link not found" }, { status: 404 })
  }

  if (!isWarmRequest) {
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
  }

  let snapshot = link.cached_intro_snapshot as EmployerIntroSnapshot | null
  if (!snapshot) {
    snapshot = await buildEmployerIntroSnapshot({
      admin,
      adminSavedJobId: link.admin_saved_job_id,
      candidateProfileId: link.candidate_profile_id,
      jobId: link.job_id,
    })

    await admin
      .from("employer_intro_links")
      .update({
        cached_intro_snapshot: snapshot,
        cached_intro_generated_at: new Date().toISOString(),
      })
      .eq("id", link.id)
  }

  const [{ data: slots }, { data: acceptance }, { data: bookings }, { data: latestBooking }] = await Promise.all([
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
      .select("id,company_name,contact_name,contact_email,contact_phone,accepted_at,compensation_model,monthly_percentage,one_time_fee_sek")
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
    admin
      .from("employer_interview_bookings")
      .select("id,booking_date,start_time,end_time,status,meeting_link")
      .eq("employer_intro_link_id", link.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

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
    ...snapshot,
    slots: availableChunks,
    acceptance: acceptance || null,
    latestBooking: latestBooking || null,
  })
}
