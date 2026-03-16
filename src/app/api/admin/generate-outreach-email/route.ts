// src/app/api/admin/generate-outreach-email/route.ts
// Generates a recruiter-style outreach email from JobbNu (info@jobbnu.se) to an employer about a candidate.

import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getServerSupabase } from "@/lib/supabaseServer"
import { isAdminOrModerator } from "@/lib/admin"
import { extractKeywordsFromCV } from "@/lib/categorization"

export const runtime = "nodejs"
export const maxDuration = 30

function getSupabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!)
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
}

function getFirstName(fullName: string) {
  const trimmed = fullName.trim()
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

const SYSTEM_PROMPT = `Du skriver klickstarka, professionella första kontaktmejl på svenska från JobbNu (info@jobbnu.se) till arbetsgivare.

Målet med mejlet är ENDAST att få mottagaren att klicka på den privata länken för att:
- se kandidatprofilen
- förstå varför kandidaten är relevant
- godkänna villkoren
- boka intervju direkt

REGLER:
- All utgående text måste vara på idiomatisk svenska
- 90 till 130 ord i mejltexten
- Använd endast kandidatens förnamn, aldrig efternamn
- Låt mänsklig, trygg och konkret
- Nämn högst 2 till 3 skarpa skäl till varför kandidaten är relevant
- Om avstånd hjälper får det nämnas kort
- Skriv aldrig ut procent, vektorscore eller intern teknisk terminologi
- Om matchnivå nämns, använd bara: "Perfekt match", "Mycket bra match" eller "Bra match"
- Skriv inte "AI", "algoritm", "semantisk likhet" eller liknande
- Använd inte engelska ord eller engelska meningar om det inte är ett egennamn eller en jobbtitel som måste citeras
- Undvik fluff och generiska fraser
- Avsluta med en tydlig CTA till bokningslänken om den finns
- Signera alltid exakt:
"Med vänliga hälsningar,
JobbNu
info@jobbnu.se"

FORMAT:
Subject: [kort ämnesrad]

[kort mejltext]`

export async function POST(req: Request) {
  const supabase = await getServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!isAdminOrModerator(user)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()
  const {
    jobId,
    candidateLabel,
    candidateProfileId,
    cvText,
    jobHeadline,
    company,
    distanceKm,
    occupationGroupLabel,
    bookingLink,
    interviewAnalysis,
  } = body

  if (!jobId && !jobHeadline) {
    return NextResponse.json({ error: "jobId or jobHeadline is required" }, { status: 400 })
  }

  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return NextResponse.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 500 })

  const admin = getSupabaseAdmin()

  let jobDescription = ""
  let jobGroup = typeof occupationGroupLabel === "string" ? occupationGroupLabel : ""
  let jobOccupationLabel = ""
  let jobCity = ""
  let jobSkillsRequired: string[] = []
  let jobSkillsPreferred: string[] = []
  let semanticSimilarity: number | null = null

  if (jobId) {
    const { data: jobRow } = await admin
      .from("job_ads")
      .select("description_text,headline,company,city,occupation_group_label,occupation_label,skills_data,embedding")
      .eq("id", jobId)
      .single()

    if (jobRow?.description_text) jobDescription = jobRow.description_text.slice(0, 1600)
    if (jobRow?.occupation_group_label) jobGroup = jobRow.occupation_group_label
    if (jobRow?.occupation_label) jobOccupationLabel = jobRow.occupation_label
    if (jobRow?.city) jobCity = jobRow.city

    const skillsData = jobRow?.skills_data as
      | { required_skills?: string[]; preferred_skills?: string[] }
      | null
      | undefined
    jobSkillsRequired = toStringArray(skillsData?.required_skills)
    jobSkillsPreferred = toStringArray(skillsData?.preferred_skills)

    if (candidateProfileId && Array.isArray(jobRow?.embedding)) {
      const { data: profileRow } = await admin
        .from("candidate_profiles")
        .select(
          "full_name,profile_vector,category_tags,search_keywords,experience_titles,education_titles,seniority_reason,experience_summary,skills_text"
        )
        .eq("id", candidateProfileId)
        .single()

      const profileVector = Array.isArray(profileRow?.profile_vector)
        ? (profileRow.profile_vector as number[])
        : []
      const jobVector = Array.isArray(jobRow.embedding)
        ? (jobRow.embedding as number[])
        : []
      semanticSimilarity = cosineSimilarity(profileVector, jobVector)

      const candidateName = typeof profileRow?.full_name === "string" && profileRow.full_name.trim()
        ? profileRow.full_name.trim()
        : typeof candidateLabel === "string"
          ? candidateLabel.trim()
          : "Kandidaten"
      const firstName = getFirstName(candidateName)

      const categoryTags = toStringArray(profileRow?.category_tags)
      const searchKeywords = toStringArray(profileRow?.search_keywords)
      const experienceTitles = toStringArray(profileRow?.experience_titles)
      const educationTitles = toStringArray(profileRow?.education_titles)
      const fallbackKeywords = cvText ? extractKeywordsFromCV(String(cvText)).slice(0, 12) : []
      const rankedKeywords = searchKeywords.length > 0 ? searchKeywords : fallbackKeywords
      const keywordHits = findKeywordHits(
        [jobHeadline, jobDescription, jobGroup, jobOccupationLabel],
        rankedKeywords
      )
      const keywordMisses = rankedKeywords.filter((keyword) => !keywordHits.includes(keyword)).slice(0, 5)
      const matchedRequiredSkills = findKeywordHits(
        [String(cvText || ""), String(profileRow?.skills_text || ""), experienceTitles.join(", "), educationTitles.join(", ")],
        jobSkillsRequired
      )
      const matchedPreferredSkills = findKeywordHits(
        [String(cvText || ""), String(profileRow?.skills_text || ""), experienceTitles.join(", "), educationTitles.join(", ")],
        jobSkillsPreferred
      )
      const taxonomyFit = jobGroup ? categoryTags.includes(jobGroup) : false
      const fitLabel = fitLabelFromEvidence({
        semanticSimilarity,
        taxonomyFit,
        keywordHitCount: keywordHits.length,
        keywordMissCount: keywordMisses.length,
      })

      const bookingCallToAction =
        typeof bookingLink === "string" && bookingLink.trim()
          ? `Här kan ni se kandidatprofilen, varför matchningen är relevant och boka intervju direkt: ${bookingLink.trim()}`
          : "Be mottagaren svara på mejlet om de vill gå vidare."
      const whyFitLines = [
        keywordHits.length > 0 ? `Träffade nyckelord: ${keywordHits.slice(0, 5).join(", ")}` : "",
        matchedRequiredSkills.length > 0
          ? `Matchade kravkompetenser: ${matchedRequiredSkills.slice(0, 4).join(", ")}`
          : "",
        matchedPreferredSkills.length > 0
          ? `Matchade meriterande kompetenser: ${matchedPreferredSkills.slice(0, 4).join(", ")}`
          : "",
        experienceTitles.length > 0 ? `Relevant erfarenhet: ${experienceTitles.slice(0, 4).join(", ")}` : "",
      ]
        .filter(Boolean)
        .join("\n")

      const userPrompt = `Kandidatens förnamn: ${firstName}
Roll: ${jobHeadline || ""} på ${company || "företaget"}
Bolag: ${company || "företaget"}
Ort: ${jobCity || ""}
Avstånd: ${typeof distanceKm === "number" ? `${distanceKm.toFixed(1)} km` : "okänt"}
Matchnivå: ${fitLabel}
Taxonomimatch: ${taxonomyFit ? "Ja" : "Nej"}
Erfarenhetsroller: ${experienceTitles.length > 0 ? experienceTitles.join(", ") : "saknas"}
Utbildning: ${educationTitles.length > 0 ? educationTitles.join(", ") : "saknas"}
Erfarenhetssammanfattning: ${profileRow?.experience_summary || "saknas"}
Seniority: ${profileRow?.seniority_reason || "saknas"}
JobbNu intervjuanalys: ${
        typeof interviewAnalysis === "string" && interviewAnalysis.trim()
          ? interviewAnalysis.trim()
          : "saknas"
      }
Evidens:
${whyFitLines || "Ingen tydlig evidens tillgänglig"}

Det länken ska beskrivas som:
${bookingCallToAction}

Jobbannons (utdrag):
${jobDescription || "saknas"}

Kandidatens CV/bakgrund:
${String(cvText || "").slice(0, 2200)}

Skriv ett kort första kontaktmejl till ${company || "företaget"} om ${firstName}.
Mejlet ska få mottagaren att klicka vidare, inte förklara allt.
Inkludera:
- en stark första mening om varför kandidaten är relevant
- 2 eller högst 3 konkreta skäl
- om JobbNu intervjuanalys finns, använd den som stöd för trovärdig mänsklig bedömning
- en tydlig uppmaning att öppna länken för kandidatprofil och bokning
- att länken visar kandidatprofil, matchmotivering och tider för intervju`

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
            max_tokens: 700,
            temperature: 0.35,
            system: SYSTEM_PROMPT,
            messages: [{ role: "user", content: userPrompt }],
          }),
        })

        if (!res.ok) {
          const errText = await res.text()
          return NextResponse.json({ error: `Anthropic ${res.status}: ${errText}` }, { status: 500 })
        }

        const data = await res.json()
        const email = (data.content?.[0]?.text ?? "").trim()
        return NextResponse.json({
          email,
          analysis: {
            firstName,
            fitLabel,
            distanceKm: typeof distanceKm === "number" ? distanceKm : null,
            taxonomyFit,
            semanticSimilarity,
            keywordHits,
            keywordMisses,
            matchedRequiredSkills,
            matchedPreferredSkills,
          },
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error"
        return NextResponse.json({ error: msg }, { status: 500 })
      }
    }
  }

  const firstName = getFirstName(String(candidateLabel || "Kandidaten"))
  const fallbackKeywords = cvText ? extractKeywordsFromCV(String(cvText)).slice(0, 12) : []
  const keywordHits = findKeywordHits([jobHeadline, jobDescription, jobGroup, jobOccupationLabel], fallbackKeywords)
  const fitLabel = keywordHits.length >= 3 ? "Mycket bra match" : "Bra match"

  const fallbackPrompt = `Kandidatens förnamn: ${firstName}
Roll: ${jobHeadline || ""} på ${company || "företaget"}
Avstånd: ${typeof distanceKm === "number" ? `${distanceKm.toFixed(1)} km` : "okänt"}
Matchnivå: ${fitLabel}
Träffade nyckelord: ${keywordHits.length > 0 ? keywordHits.join(", ") : "inga tydliga nyckelord"}
JobbNu intervjuanalys: ${
    typeof interviewAnalysis === "string" && interviewAnalysis.trim() ? interviewAnalysis.trim() : "saknas"
  }
Länk/CTA: ${
    typeof bookingLink === "string" && bookingLink.trim()
      ? `Här kan mottagaren se kandidatprofilen, varför matchningen är relevant och boka intervju direkt: ${bookingLink.trim()}`
      : "Be mottagaren svara på mejlet om de vill gå vidare."
  }

Jobbannons (utdrag):
${jobDescription || "saknas"}

Kandidatens CV/bakgrund:
${String(cvText || "").slice(0, 2200)}

Skriv ett kort första kontaktmejl till ${company || "företaget"} om ${firstName}.
Mejlet ska vara skarpt, konkret och leda till klick vidare.`

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
        max_tokens: 700,
        temperature: 0.35,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: fallbackPrompt }],
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      return NextResponse.json({ error: `Anthropic ${res.status}: ${errText}` }, { status: 500 })
    }

    const data = await res.json()
    const email = (data.content?.[0]?.text ?? "").trim()
    return NextResponse.json({
      email,
      analysis: {
        firstName,
        fitLabel,
        distanceKm: typeof distanceKm === "number" ? distanceKm : null,
        taxonomyFit: null,
        semanticSimilarity: null,
        keywordHits,
        keywordMisses: [],
        matchedRequiredSkills: [],
        matchedPreferredSkills: [],
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
