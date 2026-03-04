"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import type { User as SupabaseUser } from "@supabase/supabase-js"
import Link from "next/link"
import { Plus, Trash2 } from "lucide-react"
import { getBrowserSupabase } from "@/lib/supabaseBrowser"
import { isAdminUser } from "@/lib/admin"
import { useLanguage } from "@/components/i18n/LanguageProvider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

const BASE_PRICE = 99
const EXTRA_JOB_PRICE = 30
const MAX_JOBS = 5

function validateAfLink(url: string): string | null {
  try {
    const u = new URL(url.trim())
    if (!["http:", "https:"].includes(u.protocol)) return "Länken måste börja med http eller https."
    if (!u.hostname.includes("arbetsformedlingen.se")) return "Endast arbetsformedlingen.se-länkar accepteras."
    if (!u.pathname.match(/\/annonser\/\d+/)) return "Länken måste peka på en specifik annons."
    return null
  } catch {
    return "Ogiltig länk."
  }
}

type LetterDraft = {
  fullName: string
  email: string
  phone: string
  background: string   // brief professional background
  jobLinks: string[]   // 1–5 Arbetsförmedlingen job links
  whyThisRole: string  // why this role + company combined
  keyExamples: string
  tone: string
  letterLanguage: string
}

function createDraft(email = ""): LetterDraft {
  return {
    fullName: "",
    email,
    phone: "",
    background: "",
    jobLinks: [""],
    whyThisRole: "",
    keyExamples: "",
    tone: "",
    letterLanguage: "svenska",
  }
}

export function LetterOrderForm() {
  const router = useRouter()
  const { t, lang } = useLanguage()

  const [user, setUser] = useState<SupabaseUser | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [draft, setDraft] = useState<LetterDraft>(createDraft())
  const [message, setMessage] = useState("")
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const supabase = getBrowserSupabase()
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const u = session?.user ?? null
      setUser(u)
      setDraft((prev) => ({ ...prev, email: u?.email || prev.email }))
      setAuthLoading(false)
      if (!u) router.push("/login")
    }
    void load()
    const { data } = supabase.auth.onAuthStateChange((_e, session) => {
      const u = session?.user ?? null
      setUser(u)
      if (!u) router.push("/login")
    })
    return () => data.subscription.unsubscribe()
  }, [router])

  const canBypassPayment = useMemo(() => isAdminUser(user), [user])

  // Dynamic pricing
  const validLinks = draft.jobLinks.filter((l) => l.trim() && !validateAfLink(l))
  const totalPrice = BASE_PRICE + Math.max(0, validLinks.length - 1) * EXTRA_JOB_PRICE

  const handleField = <K extends keyof LetterDraft>(key: K, value: LetterDraft[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }))
  }

  const setJobLink = (idx: number, value: string) => {
    setDraft((prev) => {
      const next = [...prev.jobLinks]
      next[idx] = value
      return { ...prev, jobLinks: next }
    })
  }

  const addJobLink = () => {
    if (draft.jobLinks.length < MAX_JOBS) {
      setDraft((prev) => ({ ...prev, jobLinks: [...prev.jobLinks, ""] }))
    }
  }

  const removeJobLink = (idx: number) => {
    setDraft((prev) => {
      const next = prev.jobLinks.filter((_, i) => i !== idx)
      return { ...prev, jobLinks: next.length > 0 ? next : [""] }
    })
  }

  const validate = (): string | null => {
    if (!draft.fullName.trim()) return t("Fyll i fullständigt namn.", "Enter full name.")
    if (!draft.phone.trim()) return t("Fyll i telefonnummer.", "Enter phone number.")
    if (!draft.email.trim()) return t("Fyll i e-post.", "Enter email.")
    if (!draft.background.trim()) return t("Beskriv din yrkesbakgrund kort.", "Briefly describe your professional background.")
    if (!draft.whyThisRole.trim()) return t("Berätta varför du söker rollen.", "Explain why you are applying.")

    for (let i = 0; i < draft.jobLinks.length; i++) {
      const link = draft.jobLinks[i].trim()
      if (!link) return t(`Fyll i jobblänk ${i + 1}.`, `Enter job link ${i + 1}.`)
      const err = validateAfLink(link)
      if (err) return t(`Jobblänk ${i + 1}: ${err}`, `Job link ${i + 1}: ${err}`)
    }

    return null
  }

  const submit = async (bypassPayment = false) => {
    const err = validate()
    if (err) { setMessage(err); return }

    const cleanLinks = draft.jobLinks.map((l) => l.trim()).filter(Boolean)
    const price = BASE_PRICE + Math.max(0, cleanLinks.length - 1) * EXTRA_JOB_PRICE

    const payload = {
      package: { name: "Personligt Brev", amount: price, flow: "letter_intake" },
      submittedAt: new Date().toISOString(),
      data: {
        fullName: draft.fullName,
        email: draft.email,
        phone: draft.phone,
        profileSummary: draft.background,   // stored as intake_profile_summary
        jobLinks: cleanLinks,               // all job links for multi-letter generation
        whyThisRole: draft.whyThisRole,
        keyExamples: draft.keyExamples,
        tone: draft.tone,
        letterLanguage: draft.letterLanguage,
      },
    }

    try {
      setSubmitting(true)
      setMessage("")

      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          packageName: "Personligt Brev",
          amount: price,
          orderType: "document_intake",
          intakeType: "letter_intake",
          targetJobLink: cleanLinks[0],     // first link as primary for DB column
          intakePayload: payload,
          bypassPayment,
        }),
      })

      const json = await res.json()
      if (json?.bypassed) {
        setMessage(t("Testorder skapad utan betalning.", "Test order created without payment."))
        return
      }
      if (json?.url) { window.location.href = json.url; return }
      setMessage(t("Kunde inte starta betalning just nu.", "Could not start payment right now."))
    } catch {
      setMessage(t("Ett anslutningsfel uppstod.", "A connection error occurred."))
    } finally {
      setSubmitting(false)
    }
  }

  if (authLoading) {
    return <div className="container mx-auto px-4 py-10 text-sm text-slate-500">{t("Laddar...", "Loading...")}</div>
  }

  return (
    <div className="container mx-auto max-w-2xl px-4 py-8">
      <Card>
        <CardHeader>
          <CardTitle>{t("Personligt Brev", "Cover Letter")}</CardTitle>
          <CardDescription>
            {t(
              "AI:n hämtar jobbannonsen från Arbetsförmedlingen och skräddarsyr ett unikt brev mot varje tjänst.",
              "AI fetches the job posting from Arbetsförmedlingen and tailors a unique letter for each position."
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-7">
          {message && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">{message}</div>
          )}

          {/* 1. Contact */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-800">{t("1. Dina uppgifter", "1. Your details")}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">{t("Fullständigt namn", "Full name")} *</Label>
                <Input value={draft.fullName} onChange={(e) => handleField("fullName", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t("E-post", "Email")} *</Label>
                <Input type="email" value={draft.email} onChange={(e) => handleField("email", e.target.value)} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs">{t("Telefonnummer", "Phone number")} *</Label>
                <Input type="tel" className="sm:max-w-xs" value={draft.phone} onChange={(e) => handleField("phone", e.target.value)} />
              </div>
            </div>
          </section>

          {/* 2. Background */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-800">{t("2. Din yrkesbakgrund", "2. Your professional background")} *</h2>
            <p className="text-xs text-slate-500">
              {t(
                "2–4 meningar om din erfarenhet och kompetenser. AI:n använder detta för att matcha mot jobbannonsen.",
                "2–4 sentences about your experience and skills. AI uses this to match against the job posting."
              )}
            </p>
            <Textarea
              rows={3}
              placeholder={t(
                "T.ex.: Erfaren säljare med 6 år inom B2B-försäljning. Specialiserad på SaaS och teknikförsäljning. Stark kommunikatör med dokumenterat resultat – överskred quota med 130% senaste år.",
                "E.g.: Experienced sales professional with 6 years in B2B sales. Specialised in SaaS and technology sales. Strong communicator with documented results – exceeded quota 130% last year."
              )}
              value={draft.background}
              onChange={(e) => handleField("background", e.target.value)}
            />
          </section>

          {/* 3. Job links */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-800">
                {t("3. Jobb du söker", "3. Jobs you are applying for")} *
              </h2>
              <span className="text-xs text-slate-500">
                {draft.jobLinks.length > 1
                  ? t(
                    `${draft.jobLinks.length} jobb · ${totalPrice} kr`,
                    `${draft.jobLinks.length} jobs · ${totalPrice} SEK`
                  )
                  : t("1 jobb · 99 kr", "1 job · 99 SEK")}
              </span>
            </div>
            <div className="rounded-lg border border-blue-100 bg-blue-50/30 p-3 text-xs text-blue-700">
              {t(
                "Hämta jobblänkar från din",
                "Get job links from your"
              )}{" "}
              <Link href="/dashboard" className="font-semibold underline hover:text-blue-900">
                {t("Matchningsdashboard →", "Matching Dashboard →")}
              </Link>
            </div>
            <div className="space-y-2">
              {draft.jobLinks.map((link, idx) => (
                <div key={idx} className="flex items-start gap-2">
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs">
                      {t(`Jobb ${idx + 1}`, `Job ${idx + 1}`)}
                      {idx === 0 ? " *" : t(` (+${EXTRA_JOB_PRICE} kr)`, ` (+${EXTRA_JOB_PRICE} SEK)`)}
                    </Label>
                    <Input
                      placeholder="https://arbetsformedlingen.se/platsbanken/annonser/..."
                      value={link}
                      onChange={(e) => setJobLink(idx, e.target.value)}
                    />
                    {link.trim() && validateAfLink(link) && (
                      <p className="text-xs text-red-600">{validateAfLink(link)}</p>
                    )}
                    {link.trim() && !validateAfLink(link) && (
                      <p className="text-xs text-green-600">✓ {t("Giltig länk", "Valid link")}</p>
                    )}
                  </div>
                  {draft.jobLinks.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeJobLink(idx)}
                      className="mt-6 text-slate-400 hover:text-red-500 transition-colors"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {draft.jobLinks.length < MAX_JOBS && (
              <button
                type="button"
                onClick={addJobLink}
                className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 transition-colors"
              >
                <Plus size={13} />
                {t(`Lägg till jobb (+${EXTRA_JOB_PRICE} kr)`, `Add another job (+${EXTRA_JOB_PRICE} SEK)`)}
              </button>
            )}
          </section>

          {/* 4. Why this role */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-800">
              {t("4. Varför söker du dessa roller?", "4. Why are you applying for these roles?")} *
            </h2>
            <Textarea
              rows={3}
              placeholder={t(
                "T.ex.: Jag söker dessa roller för att kombinera min tekniska bakgrund med kundkontakt. Företagen tilltalar mig för deras fokus på innovation och tillväxt.",
                "E.g.: I am applying for these roles to combine my technical background with customer interaction. The companies appeal to me for their focus on innovation and growth."
              )}
              value={draft.whyThisRole}
              onChange={(e) => handleField("whyThisRole", e.target.value)}
            />
          </section>

          {/* 5. Key examples (optional) */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-800">
              {t("5. Konkreta exempel att lyfta", "5. Concrete examples to highlight")}
              <span className="ml-2 text-xs font-normal text-slate-400">{t("(valfritt)", "(optional)")}</span>
            </h2>
            <Textarea
              rows={2}
              placeholder={t(
                "T.ex.: Ökade teamets försäljning med 45% på 6 månader. Lanserade produkt som fick 10,000 användare första veckan.",
                "E.g.: Increased team sales by 45% in 6 months. Launched product that gained 10,000 users in the first week."
              )}
              value={draft.keyExamples}
              onChange={(e) => handleField("keyExamples", e.target.value)}
            />
          </section>

          {/* 6. Tone + Language */}
          <section className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">{t("Ton", "Tone")}</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={draft.tone}
                onChange={(e) => handleField("tone", e.target.value)}
              >
                <option value="">{t("Professionell (standard)", "Professional (default)")}</option>
                <option value="Personlig och engagerad">{t("Personlig och engagerad", "Personal and engaged")}</option>
                <option value="Energisk och driven">{t("Energisk och driven", "Energetic and driven")}</option>
                <option value="Formell">{t("Formell", "Formal")}</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t("Språk för brevet", "Letter language")}</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={draft.letterLanguage}
                onChange={(e) => handleField("letterLanguage", e.target.value)}
              >
                <option value="svenska">Svenska</option>
                <option value="english">English</option>
              </select>
            </div>
          </section>

          {/* Price summary */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm text-slate-700">
                <p className="font-medium">
                  {validLinks.length} {validLinks.length === 1
                    ? t("personligt brev", "cover letter")
                    : t("personliga brev", "cover letters")}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {t("99 kr + 30 kr/extra jobb. Genereras direkt efter betalning.", "99 SEK + 30 SEK/extra job. Generated immediately after payment.")}
                </p>
              </div>
              <div className="text-xl font-bold text-slate-900">{totalPrice} kr</div>
            </div>
          </div>

          {/* Submit */}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            {canBypassPayment && (
              <Button type="button" variant="secondary" onClick={() => submit(true)} disabled={submitting}>
                {submitting ? t("Skapar testorder...", "Creating test order...") : t("Admin: Testorder", "Admin: Test order")}
              </Button>
            )}
            <Button type="button" className="bg-blue-600 hover:bg-blue-700" onClick={() => submit(false)} disabled={submitting}>
              {submitting
                ? t("Startar betalning...", "Starting payment...")
                : t(`Beställ · ${totalPrice} kr`, `Order · ${totalPrice} SEK`)}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
