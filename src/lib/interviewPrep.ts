const INTERVIEW_PREP_SYSTEM_PROMPT = `Du skriver kort, varm och konkret intervjuforberedelse pa svenska till en kandidat.

MAL:
- Hjälpa kandidaten forbereda sig infor en specifik intervju
- Halla det kortfattat och praktiskt

REGLER:
- Skriv pa idiomatisk svenska
- 90 till 150 ord
- Inga hallucinationer eller obekraftade detaljer
- Utga bara fran jobbbeskrivningen och given kontext
- Ge 3 till 5 konkreta forberedelserad
- Undvik generiska floskler
- Ingen signatur
- Ingen markdown-tabell
`

function fallbackPreparation(params: {
  companyName: string
  jobHeadline: string
  jobDescription: string
}) {
  const role = params.jobHeadline.trim() || "rollen"
  const company = params.companyName.trim() || "arbetsgivaren"
  const mentionsCustomerContact = /kund|g[aä]st|service|support|bem[oö]tande/i.test(params.jobDescription)
  const mentionsTeamwork = /team|samarbete|kolleg|samverkan/i.test(params.jobDescription)
  const mentionsStructure = /planer|struktur|rutiner|noggrann|kvalitet/i.test(params.jobDescription)

  const points = [
    `Läs igenom annonsen en gång till och förbered 2 till 3 exempel på hur din erfarenhet passar ${role} hos ${company}.`,
    mentionsCustomerContact
      ? "Var redo att beskriva hur du bemöter kunder, löser problem och håller ett lugnt och professionellt bemötande."
      : "Var redo att beskriva hur du arbetar praktiskt i liknande uppgifter och hur du snabbt kommer in i nya arbetssätt.",
    mentionsTeamwork
      ? "Förbered ett konkret exempel på hur du samarbetar med kollegor och bidrar till att teamet fungerar bra."
      : "Förbered ett konkret exempel på ett ansvar du har tagit och vilket resultat det ledde till.",
    mentionsStructure
      ? "Lyft gärna hur du arbetar strukturerat, följer rutiner och håller kvalitet i vardagen."
      : "Fundera också på varför du vill ha just den här rollen och vad som motiverar dig i arbetet.",
  ]

  return points.join(" ")
}

export async function generateInterviewPreparation(params: {
  companyName: string
  jobHeadline: string
  jobDescription: string
}) {
  const jobDescription = params.jobDescription.trim()
  if (!jobDescription) {
    return fallbackPreparation(params)
  }

  const key = process.env.ANTHROPIC_API_KEY
  if (!key) {
    return fallbackPreparation(params)
  }

  const userPrompt = `Bolag: ${params.companyName || "Arbetsgivaren"}
Roll: ${params.jobHeadline || "saknas"}

Jobbannons:
${jobDescription.slice(0, 2200)}

Skriv en kort intervjuforberedelse till kandidaten infor intervjun.
Fokusera pa vad kandidaten bor lasa pa, vilka erfarenheter som bor lyftas och vilka fragor som ar smarta att vara redo for.`

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
        system: INTERVIEW_PREP_SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      }),
    })

    if (!res.ok) {
      return fallbackPreparation(params)
    }

    const data = await res.json()
    const text = typeof data?.content?.[0]?.text === "string" ? data.content[0].text.trim() : ""
    return text || fallbackPreparation(params)
  } catch {
    return fallbackPreparation(params)
  }
}
