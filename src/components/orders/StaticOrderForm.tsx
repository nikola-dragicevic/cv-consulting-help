"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import type { User as SupabaseUser } from "@supabase/supabase-js"
import { format } from "date-fns"
import { getBrowserSupabase } from "@/lib/supabaseBrowser"
import { isAdminUser } from "@/lib/admin"
import { useLanguage } from "@/components/i18n/LanguageProvider"
import BookingCalendar from "@/components/ui/BokningsCalendar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

type PackageFlow = "booking" | "cv_intake"

type PackageConfig = {
  name: string
  amount: number
  flow: PackageFlow
  includesLetter: boolean
  includesConsultation: boolean
}

type ExperienceEntry = {
  title: string
  company: string
  start: string
  end: string
  current: boolean
  description: string // combined: tasks + achievements + tools
}

type EducationEntry = {
  program: string
  school: string
  start: string
  end: string
  current: boolean
}

type IntakeDraft = {
  fullName: string
  address: string       // stores ort/stad for CV header
  phone: string
  email: string
  targetJobLink: string
  profileSummary: string
  experiences: [ExperienceEntry, ExperienceEntry, ExperienceEntry]
  includeExperience3: boolean
  education: EducationEntry
  includeAdditionalEducation: boolean
  education2: EducationEntry
  skills: string
  certifications: string
  languages: string
  driverLicense: string
  // letter fields
  jobTitle: string
  companyName: string
  whyThisRole: string   // combined: why role + why this company
  keyExamples: string
  tone: string
  letterLanguage: string
}

function emptyExperience(): ExperienceEntry {
  return { title: "", company: "", start: "", end: "", current: false, description: "" }
}

function emptyEducation(): EducationEntry {
  return { program: "", school: "", start: "", end: "", current: false }
}

function createInitialDraft(email = ""): IntakeDraft {
  return {
    fullName: "",
    address: "",
    phone: "",
    email,
    targetJobLink: "",
    profileSummary: "",
    experiences: [emptyExperience(), emptyExperience(), emptyExperience()],
    includeExperience3: false,
    education: emptyEducation(),
    includeAdditionalEducation: false,
    education2: emptyEducation(),
    skills: "",
    certifications: "",
    languages: "",
    driverLicense: "",
    jobTitle: "",
    companyName: "",
    whyThisRole: "",
    keyExamples: "",
    tone: "",
    letterLanguage: "svenska",
  }
}

function validateDraft(
  draft: IntakeDraft,
  config: PackageConfig,
  lang: "sv" | "en",
  slot: { date: Date | null; time: string }
): string | null {
  const t = (sv: string, en: string) => (lang === "sv" ? sv : en)
  if (!draft.fullName.trim()) return t("Fyll i fullständigt namn.", "Enter full name.")
  if (!draft.phone.trim()) return t("Fyll i telefonnummer.", "Enter phone number.")
  if (!draft.email.trim()) return t("Fyll i e-post.", "Enter email.")
  if (!draft.profileSummary.trim()) return t("Skriv en kort profiltext.", "Write a short profile summary.")
  if (!draft.experiences[0].title.trim()) return t("Ange titel för Erfarenhet 1.", "Enter title for Experience 1.")
  if (!draft.experiences[0].company.trim()) return t("Ange företag för Erfarenhet 1.", "Enter company for Experience 1.")
  if (!draft.education.program.trim()) return t("Fyll i utbildning/examen.", "Enter education/degree.")
  if (!draft.skills.trim()) return t("Fyll i kompetenser.", "Enter skills.")

  if (draft.targetJobLink.trim()) {
    try {
      const url = new URL(draft.targetJobLink.trim())
      if (!["http:", "https:"].includes(url.protocol)) {
        return t("Länken måste börja med http eller https.", "The link must start with http or https.")
      }
      if (!url.hostname.includes("arbetsformedlingen.se")) {
        return t(
          "Endast länkar från arbetsformedlingen.se accepteras.",
          "Only links from arbetsformedlingen.se are accepted."
        )
      }
      if (!url.pathname.match(/\/annonser\/\d+/)) {
        return t(
          "Länken måste peka på en specifik annons, t.ex. https://arbetsformedlingen.se/platsbanken/annonser/12345678",
          "The link must point to a specific job ad, e.g. https://arbetsformedlingen.se/platsbanken/annonser/12345678"
        )
      }
    } catch {
      return t("Ogiltig jobblänk.", "Invalid job link.")
    }
  }

  if (config.includesLetter) {
    if (!draft.jobTitle.trim()) return t("Fyll i vilket jobb du söker.", "Enter which role you are applying for.")
    if (!draft.whyThisRole.trim()) return t("Berätta varför du söker rollen.", "Explain why you are applying for this role.")
    if (!draft.targetJobLink.trim()) {
      return t(
        "Jobblänk från Arbetsförmedlingen krävs för personligt brev.",
        "A job link from Arbetsförmedlingen is required for the cover letter."
      )
    }
  }

  if (config.includesConsultation) {
    if (!slot.date || !slot.time) return t("Välj tid för konsultation.", "Select a consultation time.")
  }

  return null
}

export function StaticOrderForm({ config }: { config: PackageConfig }) {
  const router = useRouter()
  const { t, lang } = useLanguage()

  const [user, setUser] = useState<SupabaseUser | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [draft, setDraft] = useState<IntakeDraft>(createInitialDraft())
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [selectedTime, setSelectedTime] = useState("")
  const [message, setMessage] = useState("")
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const supabase = getBrowserSupabase()

    const load = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const sessionUser = session?.user ?? null
      setUser(sessionUser)
      setDraft((prev) => ({ ...prev, email: sessionUser?.email || prev.email }))
      setAuthLoading(false)

      if (!sessionUser) {
        router.push("/login")
      }
    }

    void load()

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const sessionUser = session?.user ?? null
      setUser(sessionUser)
      if (!sessionUser) {
        router.push("/login")
      }
    })

    return () => data.subscription.unsubscribe()
  }, [router])

  const canBypassPayment = useMemo(() => isAdminUser(user), [user])

  const handleField = <K extends keyof IntakeDraft>(key: K, value: IntakeDraft[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }))
  }

  const handleExperience = (index: 0 | 1 | 2, key: keyof ExperienceEntry, value: ExperienceEntry[keyof ExperienceEntry]) => {
    setDraft((prev) => {
      const next = [...prev.experiences] as [ExperienceEntry, ExperienceEntry, ExperienceEntry]
      next[index] = { ...next[index], [key]: value }
      return { ...prev, experiences: next }
    })
  }

  const handleEducation = (key: keyof EducationEntry, value: EducationEntry[keyof EducationEntry]) => {
    setDraft((prev) => ({ ...prev, education: { ...prev.education, [key]: value } }))
  }

  const handleEducation2 = (key: keyof EducationEntry, value: EducationEntry[keyof EducationEntry]) => {
    setDraft((prev) => ({ ...prev, education2: { ...prev.education2, [key]: value } }))
  }

  const slotLabel = selectedDate && selectedTime ? `${format(selectedDate, "yyyy-MM-dd")} ${selectedTime}` : null

  const submitOrder = async (bypassPayment = false) => {
    const validationError = validateDraft(draft, config, lang, { date: selectedDate, time: selectedTime })
    if (validationError) {
      setMessage(validationError)
      return
    }

    const payload = {
      package: {
        name: config.name,
        amount: config.amount,
        flow: config.flow,
      },
      submittedAt: new Date().toISOString(),
      data: draft,
    }

    try {
      setSubmitting(true)
      setMessage("")
      localStorage.setItem("cv-intake-draft", JSON.stringify(payload))

      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          packageName: config.name,
          amount: config.amount,
          orderType: "document_intake",
          intakeType: config.flow,
          targetJobLink: draft.targetJobLink || null,
          intakePayload: payload,
          bookingDate: selectedDate ? format(selectedDate, "yyyy-MM-dd") : undefined,
          bookingTime: selectedTime || undefined,
          bypassPayment,
        }),
      })

      const json = await response.json()
      if (json?.bypassed) {
        setMessage(t("Testorder skapad utan betalning.", "Test order created without payment."))
        return
      }
      if (json?.url) {
        window.location.href = json.url
        return
      }

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
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <Card>
        <CardHeader>
          <CardTitle>{config.name}</CardTitle>
          <CardDescription>
            {t(
              "Fyll i formuläret nedan. Vi genererar ett professionellt, ATS-optimerat CV med AI baserat på din info.",
              "Fill in the form below. We generate a professional, ATS-optimised CV using AI based on your information."
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          {message && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              {message}
            </div>
          )}

          {/* 1. Contact */}
          <section className="space-y-4">
            <h2 className="text-base font-semibold text-slate-800">{t("1. Kontaktuppgifter", "1. Contact details")}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>{t("Fullständigt namn", "Full name")} *</Label>
                <Input value={draft.fullName} onChange={(e) => handleField("fullName", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("E-post", "Email")} *</Label>
                <Input type="email" value={draft.email} onChange={(e) => handleField("email", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("Telefonnummer", "Phone number")} *</Label>
                <Input type="tel" value={draft.phone} onChange={(e) => handleField("phone", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("Ort / Stad", "City")}</Label>
                <Input placeholder={t("t.ex. Stockholm", "e.g. Stockholm")} value={draft.address} onChange={(e) => handleField("address", e.target.value)} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>
                  {config.includesLetter
                    ? t("Jobblänk från Arbetsförmedlingen (obligatorisk)", "Job link from Arbetsförmedlingen (required)")
                    : t("Jobblänk från Arbetsförmedlingen (valfritt – förbättrar CV:t)", "Job link from Arbetsförmedlingen (optional – improves CV)")}
                </Label>
                <Input
                  placeholder="https://arbetsformedlingen.se/platsbanken/annonser/..."
                  value={draft.targetJobLink}
                  onChange={(e) => handleField("targetJobLink", e.target.value)}
                />
                <p className="text-xs text-slate-500">
                  {t(
                    "Vi hämtar jobbbeskrivningen automatiskt och skräddarsyr ditt CV mot rollen.",
                    "We fetch the job description automatically and tailor your CV to the role."
                  )}
                </p>
              </div>
            </div>
          </section>

          {/* 2. Profile summary */}
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-slate-800">{t("2. Profiltext", "2. Profile summary")} *</h2>
            <p className="text-xs text-slate-500">
              {t(
                "2–4 meningar om dig själv: vem du är, vad du är bra på och vad du söker. AI:n förbättrar språket.",
                "2–4 sentences about yourself: who you are, your strengths, and what you are looking for. AI will polish the language."
              )}
            </p>
            <Textarea
              rows={4}
              placeholder={t(
                "T.ex.: Erfaren projektledare med 8 år inom IT-branschen. Specialiserad på agila metoder och teamledarskap. Söker en roll där jag kan driva digitala transformationsprojekt i en växande organisation.",
                "E.g.: Experienced project manager with 8 years in IT. Specialised in agile methods and team leadership. Looking for a role driving digital transformation in a growing organisation."
              )}
              value={draft.profileSummary}
              onChange={(e) => handleField("profileSummary", e.target.value)}
            />
          </section>

          {/* 3. Work experience */}
          <section className="space-y-4">
            <h2 className="text-base font-semibold text-slate-800">{t("3. Arbetslivserfarenhet", "3. Work experience")}</h2>
            {([0, 1, 2] as const).map((idx) => {
              if (idx === 2 && !draft.includeExperience3) return null
              const exp = draft.experiences[idx]
              const label = t(`Erfarenhet ${idx + 1}`, `Experience ${idx + 1}`)
              return (
                <div key={idx} className="rounded-lg border border-slate-200 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium text-slate-700">{label}</h3>
                    <label className="text-xs text-slate-600 inline-flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={exp.current}
                        onChange={(e) => handleExperience(idx, "current", e.target.checked)}
                      />
                      {t("Pågående", "Current")}
                    </label>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs">{t("Jobbtitel", "Job title")}{idx === 0 ? " *" : ""}</Label>
                      <Input
                        placeholder={t("t.ex. Projektledare", "e.g. Project Manager")}
                        value={exp.title}
                        onChange={(e) => handleExperience(idx, "title", e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">{t("Företag", "Company")}{idx === 0 ? " *" : ""}</Label>
                      <Input
                        placeholder={t("t.ex. Volvo AB", "e.g. Volvo AB")}
                        value={exp.company}
                        onChange={(e) => handleExperience(idx, "company", e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">{t("Startdatum", "Start date")}</Label>
                      <Input placeholder="YYYY-MM" value={exp.start} onChange={(e) => handleExperience(idx, "start", e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">{t("Slutdatum", "End date")}</Label>
                      <Input
                        placeholder={exp.current ? t("Pågående", "Current") : "YYYY-MM"}
                        disabled={exp.current}
                        value={exp.end}
                        onChange={(e) => handleExperience(idx, "end", e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label className="text-xs">{t("Beskrivning", "Description")}</Label>
                      <Textarea
                        rows={4}
                        placeholder={t(
                          "Beskriv dina uppgifter, resultat och verktyg du använde. T.ex.: Ledde ett team om 6 utvecklare i agila sprintar. Levererade nytt betalningssystem som ökade konverteringen med 15%. Använde React, Node.js och AWS.",
                          "Describe your tasks, results, and tools used. E.g.: Led a team of 6 developers in agile sprints. Delivered new payment system that increased conversion by 15%. Used React, Node.js, and AWS."
                        )}
                        value={exp.description}
                        onChange={(e) => handleExperience(idx, "description", e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              )
            })}
            <label className="text-sm text-slate-600 inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={draft.includeExperience3}
                onChange={(e) => handleField("includeExperience3", e.target.checked)}
              />
              {t("Lägg till Erfarenhet 3", "Add Experience 3")}
            </label>
          </section>

          {/* 4. Education */}
          <section className="space-y-4">
            <h2 className="text-base font-semibold text-slate-800">{t("4. Utbildning", "4. Education")}</h2>
            <div className="rounded-lg border border-slate-200 p-4 space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">{t("Utbildning / Examen", "Degree / Programme")} *</Label>
                  <Input
                    placeholder={t("t.ex. Civilingenjör Datateknik", "e.g. B.Sc. Computer Science")}
                    value={draft.education.program}
                    onChange={(e) => handleEducation("program", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t("Skola", "School")}</Label>
                  <Input
                    placeholder={t("t.ex. KTH", "e.g. Oxford University")}
                    value={draft.education.school}
                    onChange={(e) => handleEducation("school", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t("Startår", "Start year")}</Label>
                  <Input placeholder="YYYY" value={draft.education.start} onChange={(e) => handleEducation("start", e.target.value)} />
                </div>
                <div className="flex gap-3 items-end">
                  <div className="flex-1 space-y-1.5">
                    <Label className="text-xs">{t("Slutår", "End year")}</Label>
                    <Input
                      placeholder={draft.education.current ? t("Pågående", "Current") : "YYYY"}
                      disabled={draft.education.current}
                      value={draft.education.end}
                      onChange={(e) => handleEducation("end", e.target.value)}
                    />
                  </div>
                  <label className="text-xs text-slate-600 inline-flex items-center gap-1.5 cursor-pointer pb-2">
                    <input
                      type="checkbox"
                      checked={draft.education.current}
                      onChange={(e) => handleEducation("current", e.target.checked)}
                    />
                    {t("Pågående", "Current")}
                  </label>
                </div>
              </div>
            </div>
            <label className="text-sm text-slate-600 inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={draft.includeAdditionalEducation}
                onChange={(e) => handleField("includeAdditionalEducation", e.target.checked)}
              />
              {t("Lägg till ytterligare utbildning", "Add additional education")}
            </label>
            {draft.includeAdditionalEducation && (
              <div className="rounded-lg border border-slate-200 p-4 space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t("Utbildning / Examen", "Degree / Programme")}</Label>
                    <Input value={draft.education2.program} onChange={(e) => handleEducation2("program", e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t("Skola", "School")}</Label>
                    <Input value={draft.education2.school} onChange={(e) => handleEducation2("school", e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t("Startår", "Start year")}</Label>
                    <Input placeholder="YYYY" value={draft.education2.start} onChange={(e) => handleEducation2("start", e.target.value)} />
                  </div>
                  <div className="flex gap-3 items-end">
                    <div className="flex-1 space-y-1.5">
                      <Label className="text-xs">{t("Slutår", "End year")}</Label>
                      <Input
                        placeholder={draft.education2.current ? t("Pågående", "Current") : "YYYY"}
                        disabled={draft.education2.current}
                        value={draft.education2.end}
                        onChange={(e) => handleEducation2("end", e.target.value)}
                      />
                    </div>
                    <label className="text-xs text-slate-600 inline-flex items-center gap-1.5 cursor-pointer pb-2">
                      <input
                        type="checkbox"
                        checked={draft.education2.current}
                        onChange={(e) => handleEducation2("current", e.target.checked)}
                      />
                      {t("Pågående", "Current")}
                    </label>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* 5. Skills */}
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-slate-800">{t("5. Kompetenser", "5. Skills")}</h2>
            <div className="space-y-1.5">
              <Label className="text-xs">{t("Kompetenser & tekniker", "Skills & technologies")} *</Label>
              <Textarea
                rows={3}
                placeholder={t(
                  "T.ex.: Projektledning, Agile/Scrum, React, TypeScript, SQL, Excel, Kundservice",
                  "E.g.: Project management, Agile/Scrum, React, TypeScript, SQL, Excel, Customer service"
                )}
                value={draft.skills}
                onChange={(e) => handleField("skills", e.target.value)}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label className="text-xs">{t("Språk", "Languages")}</Label>
                <Input
                  placeholder={t("t.ex. Svenska, Engelska (flytande)", "e.g. Swedish, English (fluent)")}
                  value={draft.languages}
                  onChange={(e) => handleField("languages", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t("Certifikat", "Certificates")}</Label>
                <Input
                  placeholder={t("t.ex. AWS, PMP, Scrum", "e.g. AWS, PMP, Scrum")}
                  value={draft.certifications}
                  onChange={(e) => handleField("certifications", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t("Körkort", "Driver's license")}</Label>
                <Input
                  placeholder={t("t.ex. B", "e.g. B")}
                  value={draft.driverLicense}
                  onChange={(e) => handleField("driverLicense", e.target.value)}
                />
              </div>
            </div>
          </section>

          {/* 6. Cover letter (letter flow only) */}
          {config.includesLetter && (
            <section className="space-y-4 rounded-lg border border-blue-200 bg-blue-50/30 p-4">
              <h2 className="text-base font-semibold text-slate-800">{t("6. Underlag för personligt brev", "6. Cover letter details")}</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">{t("Vilket jobb söker du?", "Which role are you applying for?")} *</Label>
                  <Input
                    placeholder={t("t.ex. Projektledare", "e.g. Project Manager")}
                    value={draft.jobTitle}
                    onChange={(e) => handleField("jobTitle", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t("Företag", "Company")}</Label>
                  <Input
                    placeholder={t("t.ex. Spotify", "e.g. Spotify")}
                    value={draft.companyName}
                    onChange={(e) => handleField("companyName", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">{t("Varför söker du denna roll och detta företag?", "Why are you applying for this role and company?")} *</Label>
                  <Textarea
                    rows={4}
                    placeholder={t(
                      "T.ex.: Jag söker rollen för att jag brinner för produktutveckling och har 5 år av erfarenhet inom just det området. Spotify tilltalar mig för att de kombinerar teknik med kreativitet på ett sätt som passar min profil.",
                      "E.g.: I am applying because I am passionate about product development with 5 years of relevant experience. Spotify appeals to me because they combine technology and creativity in a way that matches my profile."
                    )}
                    value={draft.whyThisRole}
                    onChange={(e) => handleField("whyThisRole", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">{t("2–3 konkreta exempel att lyfta i brevet", "2–3 key examples to highlight in the letter")}</Label>
                  <Textarea
                    rows={3}
                    placeholder={t(
                      "T.ex.: Ledde lansering av mobilapp med 50k nedladdningar första månaden. Reducerade supportärenden med 30% genom ny onboarding-process.",
                      "E.g.: Led mobile app launch with 50k downloads in first month. Reduced support tickets by 30% with new onboarding process."
                    )}
                    value={draft.keyExamples}
                    onChange={(e) => handleField("keyExamples", e.target.value)}
                  />
                </div>
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
              </div>
            </section>
          )}

          {/* 7. Booking (consultation flow only) */}
          {config.includesConsultation && (
            <section className="space-y-4 rounded-lg border border-amber-200 bg-amber-50/40 p-4">
              <h2 className="text-base font-semibold text-slate-800">{t("7. Välj konsultationstid", "7. Select consultation time")}</h2>
              <p className="text-sm text-slate-600">{t("Välj en ledig tid innan du klickar Beställ.", "Select an available time before clicking Order.")}</p>
              {slotLabel && <p className="text-sm font-medium text-slate-800">{t("Vald tid:", "Selected time:")} {slotLabel}</p>}
              <BookingCalendar
                onSelectSlot={(date, time) => {
                  setSelectedDate(date)
                  setSelectedTime(time)
                }}
              />
            </section>
          )}

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end pt-2">
            {canBypassPayment && (
              <Button type="button" variant="secondary" onClick={() => submitOrder(true)} disabled={submitting}>
                {submitting ? t("Skapar testorder...", "Creating test order...") : t("Admin: Testorder utan betalning", "Admin: Test order without payment")}
              </Button>
            )}
            <Button type="button" className="bg-blue-600 hover:bg-blue-700" onClick={() => submitOrder(false)} disabled={submitting}>
              {submitting ? t("Startar betalning...", "Starting payment...") : t("Beställ", "Order")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export type { PackageConfig }
