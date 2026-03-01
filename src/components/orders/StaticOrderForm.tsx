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

type PackageFlow = "booking" | "cv_intake" | "cv_letter_intake"

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
  city: string
  start: string
  end: string
  current: boolean
  tasks: string
  achievements: string
  tools: string
}

type EducationEntry = {
  program: string
  school: string
  city: string
  start: string
  end: string
  current: boolean
  details: string
}

type IntakeDraft = {
  fullName: string
  address: string
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
  additionalInfo: string
  includeFullAddressInCv: boolean
  jobTitle: string
  companyName: string
  jobAdText: string
  whyThisRole: string
  whyThisCompany: string
  keyExamples: string
  explainInLetter: string
  tone: string
  letterLanguage: string
}

function emptyExperience(): ExperienceEntry {
  return {
    title: "",
    company: "",
    city: "",
    start: "",
    end: "",
    current: false,
    tasks: "",
    achievements: "",
    tools: "",
  }
}

function emptyEducation(): EducationEntry {
  return {
    program: "",
    school: "",
    city: "",
    start: "",
    end: "",
    current: false,
    details: "",
  }
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
    additionalInfo: "",
    includeFullAddressInCv: false,
    jobTitle: "",
    companyName: "",
    jobAdText: "",
    whyThisRole: "",
    whyThisCompany: "",
    keyExamples: "",
    explainInLetter: "",
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
  if (!draft.address.trim()) return t("Fyll i adress.", "Enter address.")
  if (!draft.phone.trim()) return t("Fyll i telefonnummer.", "Enter phone number.")
  if (!draft.email.trim()) return t("Fyll i e-post.", "Enter email.")
  if (!draft.profileSummary.trim()) return t("Skriv en kort profiltext.", "Write a short profile summary.")
  if (!draft.experiences[0].title.trim()) return t("Ange titel för Erfarenhet 1.", "Enter title for Experience 1.")
  if (!draft.experiences[0].company.trim()) return t("Ange företag för Erfarenhet 1.", "Enter company for Experience 1.")
  if (!draft.education.program.trim()) return t("Fyll i utbildning/examen.", "Enter education/degree.")
  if (!draft.skills.trim()) return t("Fyll i skills.", "Enter skills.")

  if (draft.targetJobLink.trim()) {
    try {
      const url = new URL(draft.targetJobLink.trim())
      if (!["http:", "https:"].includes(url.protocol)) {
        return t("Länken måste börja med http eller https.", "The link must start with http or https.")
      }
    } catch {
      return t("Ogiltig jobblänk.", "Invalid job link.")
    }
  }

  if (config.includesLetter) {
    if (!draft.jobTitle.trim()) return t("Fyll i vilket jobb du söker.", "Enter which role you are applying for.")
    if (!draft.whyThisRole.trim()) return t("Fyll i varför du vill ha rollen.", "Enter why you want the role.")
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
    <div className="container mx-auto max-w-5xl px-4 py-8">
      <Card>
        <CardHeader>
          <CardTitle>{config.name}</CardTitle>
          <CardDescription>
            {t("Fyll i formuläret och klicka på Beställ längst ner för att gå vidare till Stripe-betalning.", "Fill the form and click Order at the end to continue to Stripe checkout.")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          {message && <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">{message}</div>}

          <section className="space-y-4">
            <h2 className="text-lg font-semibold">{t("1. Kontaktuppgifter", "1. Contact details")}</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>{t("Fullständigt namn", "Full name")}</Label>
                <Input value={draft.fullName} onChange={(e) => handleField("fullName", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{t("E-post", "Email")}</Label>
                <Input value={draft.email} onChange={(e) => handleField("email", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{t("Telefonnummer", "Phone number")}</Label>
                <Input value={draft.phone} onChange={(e) => handleField("phone", e.target.value)} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>{t("Adress", "Address")}</Label>
                <Input value={draft.address} onChange={(e) => handleField("address", e.target.value)} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>{t("Jobblänk (valfritt)", "Job link (optional)")}</Label>
                <Input placeholder="https://..." value={draft.targetJobLink} onChange={(e) => handleField("targetJobLink", e.target.value)} />
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-semibold">{t("2. Kort profiltext", "2. Short profile summary")}</h2>
            <Textarea rows={5} value={draft.profileSummary} onChange={(e) => handleField("profileSummary", e.target.value)} />
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-semibold">{t("3. Arbetslivserfarenhet", "3. Work experience")}</h2>
            {[0, 1, 2].map((idx) => {
              if (idx === 2 && !draft.includeExperience3) return null
              const exp = draft.experiences[idx as 0 | 1 | 2]
              return (
                <div key={idx} className="rounded-lg border border-slate-200 p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium">{t("Erfarenhet", "Experience")} {idx + 1}</h3>
                    <label className="text-sm text-slate-600 inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={exp.current}
                        onChange={(e) => handleExperience(idx as 0 | 1 | 2, "current", e.target.checked)}
                      />
                      {t("Pågående", "Current")}
                    </label>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>{t("Titel", "Title")}</Label>
                      <Input value={exp.title} onChange={(e) => handleExperience(idx as 0 | 1 | 2, "title", e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>{t("Företag", "Company")}</Label>
                      <Input value={exp.company} onChange={(e) => handleExperience(idx as 0 | 1 | 2, "company", e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>{t("Ort", "City")}</Label>
                      <Input value={exp.city} onChange={(e) => handleExperience(idx as 0 | 1 | 2, "city", e.target.value)} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label>{t("Startdatum", "Start date")}</Label>
                        <Input placeholder="YYYY-MM" value={exp.start} onChange={(e) => handleExperience(idx as 0 | 1 | 2, "start", e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>{t("Slutdatum", "End date")}</Label>
                        <Input placeholder={exp.current ? t("Pågående", "Current") : "YYYY-MM"} disabled={exp.current} value={exp.end} onChange={(e) => handleExperience(idx as 0 | 1 | 2, "end", e.target.value)} />
                      </div>
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label>{t("Arbetsuppgifter", "Tasks")}</Label>
                      <Textarea rows={4} value={exp.tasks} onChange={(e) => handleExperience(idx as 0 | 1 | 2, "tasks", e.target.value)} />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label>{t("Resultat / prestationer", "Achievements")}</Label>
                      <Textarea rows={3} value={exp.achievements} onChange={(e) => handleExperience(idx as 0 | 1 | 2, "achievements", e.target.value)} />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label>{t("Verktyg / teknik", "Tools / tech")}</Label>
                      <Input value={exp.tools} onChange={(e) => handleExperience(idx as 0 | 1 | 2, "tools", e.target.value)} />
                    </div>
                  </div>
                </div>
              )
            })}
            <label className="text-sm text-slate-700 inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={draft.includeExperience3}
                onChange={(e) => handleField("includeExperience3", e.target.checked)}
              />
              {t("Lägg till Erfarenhet 3", "Add Experience 3")}
            </label>
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-semibold">{t("4. Utbildning", "4. Education")}</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>{t("Utbildning / Examen", "Education / Degree")}</Label>
                <Input value={draft.education.program} onChange={(e) => handleEducation("program", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{t("Skola", "School")}</Label>
                <Input value={draft.education.school} onChange={(e) => handleEducation("school", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{t("Ort", "City")}</Label>
                <Input value={draft.education.city} onChange={(e) => handleEducation("city", e.target.value)} />
              </div>
              <div className="flex items-end">
                <label className="text-sm text-slate-700 inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={draft.education.current}
                    onChange={(e) => handleEducation("current", e.target.checked)}
                  />
                  {t("Pågående", "Current")}
                </label>
              </div>
              <div className="space-y-2">
                <Label>{t("Startdatum", "Start date")}</Label>
                <Input placeholder="YYYY-MM" value={draft.education.start} onChange={(e) => handleEducation("start", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{t("Slutdatum", "End date")}</Label>
                <Input placeholder={draft.education.current ? t("Pågående", "Current") : "YYYY-MM"} disabled={draft.education.current} value={draft.education.end} onChange={(e) => handleEducation("end", e.target.value)} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>{t("Detaljer", "Details")}</Label>
                <Textarea rows={3} value={draft.education.details} onChange={(e) => handleEducation("details", e.target.value)} />
              </div>
            </div>
            <label className="text-sm text-slate-700 inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={draft.includeAdditionalEducation}
                onChange={(e) => handleField("includeAdditionalEducation", e.target.checked)}
              />
              {t("Lägg till extra utbildning", "Add additional education")}
            </label>
            {draft.includeAdditionalEducation && (
              <div className="grid gap-4 md:grid-cols-2 rounded-lg border border-slate-200 p-4">
                <div className="space-y-2">
                  <Label>{t("Utbildning / Examen", "Education / Degree")}</Label>
                  <Input value={draft.education2.program} onChange={(e) => handleEducation2("program", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>{t("Skola", "School")}</Label>
                  <Input value={draft.education2.school} onChange={(e) => handleEducation2("school", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>{t("Ort", "City")}</Label>
                  <Input value={draft.education2.city} onChange={(e) => handleEducation2("city", e.target.value)} />
                </div>
                <div className="flex items-end">
                  <label className="text-sm text-slate-700 inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={draft.education2.current}
                      onChange={(e) => handleEducation2("current", e.target.checked)}
                    />
                    {t("Pågående", "Current")}
                  </label>
                </div>
                <div className="space-y-2">
                  <Label>{t("Startdatum", "Start date")}</Label>
                  <Input placeholder="YYYY-MM" value={draft.education2.start} onChange={(e) => handleEducation2("start", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>{t("Slutdatum", "End date")}</Label>
                  <Input placeholder={draft.education2.current ? t("Pågående", "Current") : "YYYY-MM"} disabled={draft.education2.current} value={draft.education2.end} onChange={(e) => handleEducation2("end", e.target.value)} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>{t("Detaljer", "Details")}</Label>
                  <Textarea rows={3} value={draft.education2.details} onChange={(e) => handleEducation2("details", e.target.value)} />
                </div>
              </div>
            )}
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-semibold">{t("5. Skills", "5. Skills")}</h2>
            <div className="space-y-2">
              <Label>{t("Kompetenser", "Skills")}</Label>
              <Textarea rows={4} value={draft.skills} onChange={(e) => handleField("skills", e.target.value)} />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>{t("Certifikat", "Certificates")}</Label>
                <Textarea rows={3} value={draft.certifications} onChange={(e) => handleField("certifications", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{t("Språk", "Languages")}</Label>
                <Textarea rows={3} value={draft.languages} onChange={(e) => handleField("languages", e.target.value)} />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>{t("Körkort", "Driver's license")}</Label>
                <Input value={draft.driverLicense} onChange={(e) => handleField("driverLicense", e.target.value)} />
              </div>
              <div className="flex items-end">
                <label className="text-sm text-slate-700 inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={draft.includeFullAddressInCv}
                    onChange={(e) => handleField("includeFullAddressInCv", e.target.checked)}
                  />
                  {t("Visa full adress i CV", "Show full address in CV")}
                </label>
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t("Övrigt", "Additional info")}</Label>
              <Textarea rows={3} value={draft.additionalInfo} onChange={(e) => handleField("additionalInfo", e.target.value)} />
            </div>
          </section>

          {config.includesLetter && (
            <section className="space-y-4 rounded-lg border border-blue-200 bg-blue-50/30 p-4">
              <h2 className="text-lg font-semibold">{t("6. Underlag för personligt brev", "6. Cover letter details")}</h2>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>{t("Vilket jobb söker du?", "Which role are you applying for?")}</Label>
                  <Input value={draft.jobTitle} onChange={(e) => handleField("jobTitle", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>{t("Företag", "Company")}</Label>
                  <Input value={draft.companyName} onChange={(e) => handleField("companyName", e.target.value)} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>{t("Jobbannons", "Job ad")}</Label>
                  <Textarea rows={6} value={draft.jobAdText} onChange={(e) => handleField("jobAdText", e.target.value)} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>{t("Varför vill du ha just detta jobb?", "Why do you want this role?")}</Label>
                  <Textarea rows={4} value={draft.whyThisRole} onChange={(e) => handleField("whyThisRole", e.target.value)} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>{t("Varför just detta företag?", "Why this company?")}</Label>
                  <Textarea rows={4} value={draft.whyThisCompany} onChange={(e) => handleField("whyThisCompany", e.target.value)} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>{t("2-3 exempel att lyfta", "2-3 key examples")}</Label>
                  <Textarea rows={4} value={draft.keyExamples} onChange={(e) => handleField("keyExamples", e.target.value)} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>{t("Något brevet ska förklara", "Anything to explain in letter")}</Label>
                  <Textarea rows={3} value={draft.explainInLetter} onChange={(e) => handleField("explainInLetter", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>{t("Ton", "Tone")}</Label>
                  <Input value={draft.tone} onChange={(e) => handleField("tone", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>{t("Språk", "Language")}</Label>
                  <Input value={draft.letterLanguage} onChange={(e) => handleField("letterLanguage", e.target.value)} />
                </div>
              </div>
            </section>
          )}

          {config.includesConsultation && (
            <section className="space-y-4 rounded-lg border border-amber-200 bg-amber-50/40 p-4">
              <h2 className="text-lg font-semibold">{t("7. Välj konsultationstid", "7. Select consultation time")}</h2>
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

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            {canBypassPayment && (
              <Button type="button" variant="secondary" onClick={() => submitOrder(true)} disabled={submitting}>
                {submitting ? t("Skapar testorder...", "Creating test order...") : t("Admin: Skapa testorder utan betalning", "Admin: Create test order without payment")}
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
