import { extractKeywordsFromCV } from "@/lib/categorization"

export const APPLICATION_EMAIL_SYSTEM_PROMPT = `Du skriver korta, trovärdiga och mänskliga jobbansökningar på svenska från kandidatens perspektiv.

MAL:
- skriva ett personligt email till arbetsgivaren
- kandidaten söker jobbet direkt själv
- tonen ska vara professionell, varm och konkret

REGLER:
- 90 till 150 ord i själva emailtexten
- skriv på svenska
- inkludera inte signaturblock
- nämn att CV bifogas
- lyft 2 till 3 specifika skäl till varför kandidaten passar rollen
- undvik generiska fraser och överdrifter
- skriv inte om AI, scoring, vektorer eller matchningsmotorer
- använd bara information som finns i underlaget

FORMAT:
Subject: [ämnesrad]

[själva emailtexten]`

export function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)
}

export function buildFallbackApplicationEmail(params: {
  fullName: string
  company: string
  headline: string
  skills: string[]
  experienceTitles: string[]
}) {
  const subject = `${params.headline} - ansokan från ${params.fullName}`
  const skills = params.skills.slice(0, 4).join(", ")
  const experience = params.experienceTitles.slice(0, 2).join(", ")
  const body = [
    "Hej,",
    `Jag vill gärna söka tjänsten som ${params.headline}${params.company ? ` hos ${params.company}` : ""}.`,
    `Min bakgrund inom ${skills || "relevanta områden"}${experience ? ` samt erfarenhet från ${experience}` : ""} gör att jag tror att jag kan bidra snabbt i rollen.`,
    "Det som särskilt lockar mig är möjligheten att bidra med både ansvarstagande, struktur och kvalitet i det dagliga arbetet.",
    "Jag bifogar mitt CV och berättar gärna mer om min erfarenhet i ett kort samtal.",
  ].join("\n\n")

  return `Subject: ${subject}\n\n${body}`
}

export function stripSubjectFromEmail(email: string) {
  const normalized = email.replace(/\r\n/g, "\n").trim()
  const subjectMatch = normalized.match(/^Subject:\s*(.+)$/im)
  const body = normalized.replace(/^Subject:\s*.+$/im, "").trim()
  return {
    subject: subjectMatch?.[1]?.trim() || "",
    body,
  }
}

export async function generateApplicationEmail(params: {
  profile: {
    full_name?: string | null
    email?: string | null
    phone?: string | null
    city?: string | null
    candidate_text_vector?: string | null
    search_keywords?: string[] | null
    experience_titles?: string[] | null
    education_titles?: string[] | null
  }
  job: {
    headline?: string | null
    company?: string | null
    description_text?: string | null
    occupation_group_label?: string | null
    occupation_label?: string | null
    city?: string | null
    contact_email?: string | null
    skills_data?: { required_skills?: string[]; preferred_skills?: string[] } | null
  }
  anthropicApiKey?: string | null
}) {
  const profile = params.profile
  const job = params.job
  const cvText = typeof profile.candidate_text_vector === "string" ? profile.candidate_text_vector.trim() : ""
  const experienceTitles = toStringArray(profile.experience_titles)
  const educationTitles = toStringArray(profile.education_titles)
  const searchKeywords = toStringArray(profile.search_keywords)
  const fallbackKeywords = cvText ? extractKeywordsFromCV(cvText).slice(0, 12) : []
  const rankedKeywords = searchKeywords.length > 0 ? searchKeywords : fallbackKeywords
  const requiredSkills = toStringArray(job.skills_data?.required_skills)
  const preferredSkills = toStringArray(job.skills_data?.preferred_skills)

  if (!params.anthropicApiKey) {
    return buildFallbackApplicationEmail({
      fullName: profile.full_name || "Kandidaten",
      company: job.company || "",
      headline: job.headline || "rollen",
      skills: rankedKeywords,
      experienceTitles,
    })
  }

  const userPrompt = `Kandidat:
Namn: ${profile.full_name || "saknas"}
Email: ${profile.email || "saknas"}
Telefon: ${profile.phone || "saknas"}
Ort: ${profile.city || "saknas"}

Relevant erfarenhet:
${experienceTitles.join(", ") || "saknas"}

Utbildning:
${educationTitles.join(", ") || "saknas"}

Nyckelkompetenser:
${rankedKeywords.join(", ") || "saknas"}

Fri CV-text / profil:
${cvText.slice(0, 2600) || "saknas"}

Jobb:
Rubrik: ${job.headline || "saknas"}
Bolag: ${job.company || "saknas"}
Ort: ${job.city || "saknas"}
Yrkesgrupp: ${job.occupation_group_label || "saknas"}
Yrke: ${job.occupation_label || "saknas"}
Kontaktmail i annons: ${job.contact_email || "saknas"}
Kravkompetenser: ${requiredSkills.join(", ") || "saknas"}
Meriterande kompetenser: ${preferredSkills.join(", ") || "saknas"}

Jobbbeskrivning:
${String(job.description_text || "").slice(0, 2600)}

Skriv ett skarpt men mänskligt ansökningsmail från kandidatens perspektiv.`

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": params.anthropicApiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 700,
        temperature: 0.5,
        system: APPLICATION_EMAIL_SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      }),
    })

    const json = await res.json().catch(() => null)
    const email = typeof json?.content?.[0]?.text === "string" ? json.content[0].text.trim() : ""
    if (!res.ok || !email) {
      throw new Error("generation_failed")
    }
    return email
  } catch {
    return buildFallbackApplicationEmail({
      fullName: profile.full_name || "Kandidaten",
      company: job.company || "",
      headline: job.headline || "rollen",
      skills: rankedKeywords,
      experienceTitles,
    })
  }
}
