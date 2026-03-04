// src/lib/cvGenerator.ts
// CV and cover letter generation via Anthropic Claude

export interface JobAdContext {
  headline: string
  company: string | null
  description_text: string
}

export interface GenerationResult {
  cv: string | null
  letter: string | null
  error?: string
}

// ---------------------------------------------------------------------------
// Arbetsförmedlingen URL helpers
// ---------------------------------------------------------------------------

export function isArbetsformedlingenUrl(url: string): boolean {
  try {
    return new URL(url).hostname.includes("arbetsformedlingen.se")
  } catch {
    return false
  }
}

export function extractArbetsformedlingenJobId(url: string): string | null {
  try {
    const match = new URL(url).pathname.match(/\/annonser\/(\d+)/)
    return match?.[1] ?? null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Anthropic call
// ---------------------------------------------------------------------------

async function callClaude(system: string, user: string, temperature = 0.3): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set")

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      temperature,
      system,
      messages: [{ role: "user", content: user }],
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Anthropic API ${res.status}: ${body}`)
  }

  const data = await res.json()
  return (data.content?.[0]?.text ?? "").trim()
}

// ---------------------------------------------------------------------------
// CV prompt — outputs structured JSON for the CvPreview template renderer
// ---------------------------------------------------------------------------

function buildCvSystemPrompt(): string {
  return `Du är en professionell CV-skribent med djup expertis inom den svenska arbetsmarknaden 2025–2026.

ABSOLUTA REGLER – BRYTS ALDRIG:
1. Använd ENBART information som angetts av användaren. Hitta ALDRIG på företag, titlar, datum, prestationer, kompetenser eller annat.
2. Du FÅR förbättra formuleringar och professionellt språk.
3. Du FÅR skriva om arbetsuppgifter med starkare action-verb – men enbart baserat på vad användaren angett.
4. Alla fakta ska kunna verifieras mot det användaren gett in.

OUTPUT: Returnera ENBART ett JSON-objekt med exakt denna struktur (ingen text utanför JSON):

{
  "name": "string",
  "title": "string – nuvarande eller sökt yrkesroll/titel",
  "email": "string",
  "phone": "string",
  "location": "string – ort/stad",
  "profile": "string – 3–5 meningar, professionell profiltext på svenska",
  "experience": [
    {
      "title": "string",
      "company": "string",
      "period": "string – t.ex. 2020-03 – Pågående",
      "bullets": ["string – action-verb-bullet", "string"]
    }
  ],
  "education": [
    {
      "degree": "string",
      "school": "string",
      "period": "string"
    }
  ],
  "skills": {
    "KategoriNamn": ["kompetens1", "kompetens2"]
  },
  "languages": ["string"],
  "certifications": ["string"],
  "driverLicense": "string eller null"
}

REGLER FÖR JSON:
- Lämna "languages": [] om ingen språkinfo angetts
- Lämna "certifications": [] om inga certifikat angetts
- driverLicense: null om inget körkort angetts
- Svara ENBART med JSON-objektet, inga kommentarer, inga förklaringar, ingen text utanför
- Varje experience ska ha 2–4 bullets med starka action-verb
- ATS-optimerat: matcha nyckelord från jobbannonsen om en sådan angetts
- Håll allt till max 2 A4-sidor (korta, kärnfulla bullets)`
}

function buildCvUserPrompt(order: Record<string, unknown>, job: JobAdContext | null): string {
  const exp = (order.intake_experiences as Record<string, unknown>[]) ?? []
  const inclExp3 = Boolean(order.intake_include_experience_3)
  const inclEdu2 = Boolean(order.intake_include_additional_education)
  const edu1 = (order.intake_education_primary as Record<string, unknown>) ?? {}
  const edu2 = (order.intake_education_additional as Record<string, unknown>) ?? {}

  const formatExp = (e: Record<string, unknown>, idx: number): string | null => {
    if (!e?.title && !e?.company) return null
    const period = e.current
      ? `${e.start ?? "?"} – pågående`
      : `${e.start ?? "?"} – ${e.end ?? "?"}`
    return [
      `Erfarenhet ${idx + 1}:`,
      `  Titel: ${e.title ?? ""}`,
      `  Företag: ${e.company ?? ""}`,
      `  Period: ${period}`,
      `  Beskrivning: ${e.description ?? "(ej angivet)"}`,
    ].join("\n")
  }

  const formatEdu = (e: Record<string, unknown>): string | null => {
    if (!e?.program && !e?.school) return null
    const period = e.current
      ? `${e.start ?? "?"} – pågående`
      : `${e.start ?? "?"} – ${e.end ?? "?"}`
    return [
      `  Program: ${e.program ?? ""}`,
      `  Skola: ${e.school ?? ""}`,
      `  Period: ${period}`,
    ].join("\n")
  }

  const experiences = exp
    .slice(0, inclExp3 ? 3 : 2)
    .map((e, i) => formatExp(e, i))
    .filter(Boolean)
    .join("\n\n")

  const educations = [
    formatEdu(edu1),
    inclEdu2 ? formatEdu(edu2) : null,
  ]
    .filter(Boolean)
    .join("\n\n")

  const jobSection = job
    ? `JOBBANNONS (optimera CV:t mot denna roll – matcha nyckelord):
Tjänst: ${job.headline}
Företag: ${job.company ?? ""}
Annons (de första 2000 tecknen):
${job.description_text.slice(0, 2000)}

---
`
    : ""

  return `Skapa ett professionellt CV på svenska för följande person. Returnera ENBART JSON.

${jobSection}PERSONUPPGIFTER:
Namn: ${order.intake_full_name ?? ""}
E-post: ${order.intake_email ?? ""}
Telefon: ${order.intake_phone ?? ""}
Ort: ${order.intake_address ?? ""}

PROFILSAMMANFATTNING (användarens egna ord – omformulera professionellt):
${order.intake_profile_summary ?? "(ej angivet)"}

ARBETSLIVSERFARENHET:
${experiences || "(ingen erfarenhet angiven)"}

UTBILDNING:
${educations || "(ingen utbildning angiven)"}

KOMPETENSER:
${order.intake_skills_text ?? "(ej angivet)"}

CERTIFIKAT:
${order.intake_certifications_text ?? "(ej angivet)"}

SPRÅK:
${order.intake_languages_text ?? "(ej angivet)"}

KÖRKORT:
${order.intake_driver_license ?? "(ej angivet)"}

Returnera nu ett ATS-optimerat, professionellt CV som ett JSON-objekt enligt systemprompten.`
}

// ---------------------------------------------------------------------------
// Cover letter prompt
// ---------------------------------------------------------------------------

function buildLetterSystemPrompt(tone: string, language: string): string {
  const inSwedish = !language.toLowerCase().includes("eng")
  const langInstruction = inSwedish
    ? "Skriv brevet på svenska."
    : "Write the letter in English."
  const toneNote = tone
    ? `Ton: ${tone}.`
    : "Ton: Professionell men personlig och engagerad."

  return `Du är en expert på personliga brev för den svenska arbetsmarknaden 2025–2026.

ABSOLUTA REGLER – BRYTS ALDRIG:
1. Använd ENBART information som angetts av användaren. Hitta ALDRIG på fakta.
2. Brevet måste vara SPECIFIKT och PERSONLIGT – aldrig generiskt.
3. Koppla konkreta krav från jobbannonsen till kandidatens faktiska erfarenhet.
4. ${toneNote}
5. ${langInstruction}

OUTPUT – ren text (ingen markdown-formatering, inga rubriker):

[Ort,] [Datum]

[Namn]
[E-post] · [Telefon]

[Företag],

[Stycke 1 – Öppning: Varför just denna roll och detta företag? Fånga uppmärksamheten direkt.]

[Stycke 2 – Matchning: Hur matchar din konkreta erfarenhet kraven i annonsen? Specifika exempel.]

[Stycke 3 – Mervärde: Vad tillför du specifikt? Koppla till deras behov och din unika kombination.]

[Avslutning: Konkret nästa steg. Tacka för deras tid.]

Med vänliga hälsningar,
[Namn]
[Telefon] · [E-post]

STILREGLER:
- "Lagom" – genuint engagerad, inte överdrivet entusiastisk
- Specifik om företaget och rollen, aldrig generell
- Max 1 A4-sida (ungefär 400–500 ord)
- Varje påstående ska backas av kandidatens faktiska erfarenhet`
}

function buildLetterUserPrompt(
  order: Record<string, unknown>,
  job: JobAdContext | null,
  backgroundOverride?: string
): string {
  const exp = (order.intake_experiences as Record<string, unknown>[]) ?? []
  const inclExp3 = Boolean(order.intake_include_experience_3)

  const expSummary = exp
    .slice(0, inclExp3 ? 3 : 2)
    .filter((e) => e?.title || e?.company)
    .map((e) => {
      const period = e.current
        ? `${e.start ?? "?"} – pågående`
        : `${e.start ?? "?"} – ${e.end ?? "?"}`
      return `- ${e.title ?? ""} på ${e.company ?? ""} (${period})`
    })
    .join("\n")

  const background = backgroundOverride ?? expSummary

  // Job ad source: DB fetch (Arbetsförmedlingen) preferred
  const jobSection = job
    ? `JOBBANNONS (hämtad från Arbetsförmedlingen):
Tjänst: ${job.headline}
Företag: ${job.company ?? ""}
Beskrivning (de första 2500 tecknen):
${job.description_text.slice(0, 2500)}`
    : "Ingen jobbannons angiven."

  return `Skapa ett personligt brev för följande kandidat.

${jobSection}

---

KANDIDATENS INFORMATION:
Namn: ${order.intake_full_name ?? ""}
E-post: ${order.intake_email ?? ""}
Telefon: ${order.intake_phone ?? ""}
Söker tjänsten: ${order.letter_job_title ?? order.target_role ?? job?.headline ?? ""}
Företag: ${order.letter_company_name ?? job?.company ?? ""}

Bakgrund/erfarenhet:
${background || "(se CV)"}

Kompetenser: ${String(order.intake_skills_text ?? "").slice(0, 500)}

KANDIDATENS EGNA SVAR:

Varför vill du ha rollen och detta företag?
${order.letter_why_this_role ?? "(ej angivet)"}

2–3 konkreta exempel att lyfta i brevet:
${order.letter_key_examples ?? "(ej angivet)"}

Generera nu ett slagkraftigt, specifikt personligt brev i ren text enligt systemprompten.`
}

// ---------------------------------------------------------------------------
// Standalone letter flow (letter_intake) — one letter per job link
// ---------------------------------------------------------------------------

export interface MultiLetterResult {
  jobLink: string
  headline: string
  company: string
  letter: string
}

async function generateLettersForLinks(
  order: Record<string, unknown>,
  jobLinks: string[],
  fetchJobAd: (jobId: string) => Promise<JobAdContext | null>
): Promise<MultiLetterResult[]> {
  const tone = String(order.letter_tone ?? "")
  const lang = String(order.letter_language ?? "svenska")
  const background = String(order.intake_profile_summary ?? "")
  const results: MultiLetterResult[] = []

  for (const link of jobLinks) {
    let job: JobAdContext | null = null
    if (isArbetsformedlingenUrl(link)) {
      const id = extractArbetsformedlingenJobId(link)
      if (id) job = await fetchJobAd(id)
    }

    const letter = await callClaude(
      buildLetterSystemPrompt(tone, lang),
      buildLetterUserPrompt(order, job, background)
    )

    results.push({
      jobLink: link,
      headline: job?.headline ?? "",
      company: job?.company ?? "",
      letter,
    })
  }

  return results
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function generateCvAndLetter(
  order: Record<string, unknown>,
  job: JobAdContext | null,
  fetchJobAd?: (jobId: string) => Promise<JobAdContext | null>
): Promise<GenerationResult> {
  const flow = String(order.package_flow ?? "cv_intake")

  try {
    // --- letter_intake: standalone cover letter(s), no CV ---
    if (flow === "letter_intake") {
      const tone = String(order.letter_tone ?? "")
      const lang = String(order.letter_language ?? "svenska")
      const background = String(order.intake_profile_summary ?? "")

      // Support multi-job links stored in intake_payload
      const intakePayload = order.intake_payload as Record<string, unknown> | null
      const intakeData = intakePayload?.data as Record<string, unknown> | null
      const jobLinks: string[] = Array.isArray(intakeData?.jobLinks)
        ? (intakeData!.jobLinks as string[]).filter((l) => typeof l === "string" && l.trim())
        : []

      if (jobLinks.length > 1 && fetchJobAd) {
        // Multi-job: generate one letter per link
        const multiResults = await generateLettersForLinks(order, jobLinks, fetchJobAd)
        return {
          cv: null,
          letter: JSON.stringify(multiResults),
        }
      }

      // Single job: use the resolved job that was already fetched
      const letter = await callClaude(
        buildLetterSystemPrompt(tone, lang),
        buildLetterUserPrompt(order, job, background)
      )
      return { cv: null, letter }
    }

    // --- cv_intake: generate CV only ---
    // Use lower temperature for JSON output to minimise parse failures
    const cv = await callClaude(buildCvSystemPrompt(), buildCvUserPrompt(order, job), 0.2)

    return { cv, letter: null }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[cvGenerator] Generation failed:", msg)
    return { cv: null, letter: null, error: msg }
  }
}
