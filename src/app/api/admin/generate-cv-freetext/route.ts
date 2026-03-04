// src/app/api/admin/generate-cv-freetext/route.ts
// Admin-only: generate a CV from pasted freeform text via Claude Haiku

import { NextResponse } from "next/server"
import { getServerSupabase } from "@/lib/supabaseServer"
import { isAdminOrModerator } from "@/lib/admin"

export const runtime = "nodejs"
export const maxDuration = 60

const SYSTEM_PROMPT = `Du är en professionell CV-skribent med djup expertis inom den svenska arbetsmarknaden 2025–2026.

ABSOLUTA REGLER – BRYTS ALDRIG:
1. Använd ENBART information som angetts av användaren. Hitta ALDRIG på företag, titlar, datum, prestationer, kompetenser eller annat.
2. Du FÅR förbättra formuleringar, struktur och professionellt språk.
3. Du FÅR skriva om arbetsuppgifter med starkare action-verb – men enbart baserat på vad användaren angett.
4. Alla fakta ska kunna verifieras mot det användaren gett in.

OUTPUT – Markdown-format med exakt denna struktur:

# [Fullständigt namn]
**[Titel/Yrkesroll]** · [Ort] · [Telefon] · [E-post]

---

## Profil
[3–5 meningar. Faktabaserad, inte skrytsam.]

## Arbetslivserfarenhet

### [Titel] — [Företag], [Ort] | [Startdatum] – [Slutdatum / Pågående]
- [Arbetsuppgift med starkt action-verb]
- [Arbetsuppgift]
- [Resultat/prestation OM användaren angett en – kvantifiera inte om det saknas]

## Utbildning

### [Program] — [Skola], [Ort] | [Startdatum] – [Slutdatum / Pågående]
[Relevanta kurser/ämnen om angett]

## Kompetenser
**[Kategori]:** [Kompetenser, kommaseparerade]

[Lägg till sektioner för Certifikat, Språk, Körkort, Övrigt ENBART om dessa är ifyllda]

STILREGLER (Svenska arbetsmarknaden):
- Ton: Professionell, faktabaserad – "lagom", inte skrytsam
- Action-verb: Ledde, Utvecklade, Implementerade, Optimerade, Koordinerade, Analyserade, Levererade, Förbättrade
- Kvantifiera resultat ENBART om användaren angett siffror
- Max 2 A4-sidor`

async function callClaude(systemPrompt: string, userContent: string): Promise<string> {
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
      temperature: 0.3,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Anthropic API ${res.status}: ${body}`)
  }

  const data = await res.json()
  return (data.content?.[0]?.text ?? "").trim()
}

export async function POST(req: Request) {
  try {
    const supabase = await getServerSupabase()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!isAdminOrModerator(user)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { text } = await req.json()
    if (!text || typeof text !== "string" || text.trim().length < 10) {
      return NextResponse.json({ error: "Ange minst 10 tecken text" }, { status: 400 })
    }

    const userPrompt = `Skapa ett professionellt CV på svenska baserat på följande information. Extrahera och strukturera all tillgänglig information som finns – namn, kontaktuppgifter, erfarenheter, utbildning, kompetenser etc.\n\n${text.slice(0, 8000)}`

    const cv = await callClaude(SYSTEM_PROMPT, userPrompt)
    return NextResponse.json({ cv })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    console.error("[generate-cv-freetext]", msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
