"use client"

import React, { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { getBrowserSupabase } from "@/lib/supabaseBrowser" 
import type { User as SupabaseUser } from "@supabase/supabase-js"
import Image from "next/image"
import ContactForm from "@/components/ui/ContactForm"
import BookingCalendar from "@/components/ui/BokningsCalendar"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { Mail, Phone, FileText, Users, Award, Wand2, MapPin, Upload, X, Eye, Lock, Star, Check, LogIn, User, BrainCircuit, MessageSquareText } from "lucide-react"

import InteractiveJobMap from "@/components/ui/InteractiveJobMap"
import JobCategoriesSection from "@/components/ui/JobCategoriesSection"
import { format } from "date-fns"
import { useLanguage, type SiteLanguage } from "@/components/i18n/LanguageProvider"
import { isAdminOrModerator } from "@/lib/admin"

/* ============================================================
   Types
============================================================ */
type JobRow = {
  id: string
  headline: string
  location?: string
  location_lat?: number | null
  location_lon?: number | null
  company_size?: "small" | "medium" | "large" | string | null
  work_modality?: "onsite" | "hybrid" | "remote" | string | null
  s_profile?: number | null
  s_wish?: number | null
  final_score?: number | null
  job_url?: string | null
  webpage_url?: string | null
}

type PackageChoice = {
  name: string
  amount: number
  description: string
  flow: "booking" | "cv_intake"
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

type CvIntakeDraft = {
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
  // Personal letter fields (only used for CV + Personligt Brev)
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

export type Wish = {
  titles?: string[]
  use_skills?: string[]
  learn_skills?: string[]
  industries?: string[]
  company_size?: "small" | "medium" | "large" | null
  modality?: "remote" | "hybrid" | "onsite" | null
  pace?: "fast" | "steady" | null
  structure?: "flat" | "corporate" | null
  collaboration?: "collaborative" | "independent" | null
  includeNearbyMetro?: boolean
  location_city?: string
}

/* ============================================================
   Helpers
============================================================ */
function pct(n?: number | null) {
  if (n == null) return "—"
  const v = Math.max(0, Math.min(1, n))
  return `${Math.round(v * 100)}%`
}

function cityToGeo(cityRaw: string): { lat: number; lon: number; county_code: string } | undefined {
  const city = cityRaw.trim().toLowerCase()
  const table: Record<string, { lat: number; lon: number; county_code: string }> = {
    stockholm: { lat: 59.3293, lon: 18.0686, county_code: "AB" },
    uppsala: { lat: 59.8586, lon: 17.6389, county_code: "C" },
    bålsta: { lat: 59.567, lon: 17.527, county_code: "C" },
    goteborg: { lat: 57.7089, lon: 11.9746, county_code: "O" },
    göteborg: { lat: 57.7089, lon: 11.9746, county_code: "O" },
    malmo: { lat: 55.605, lon: 13.0038, county_code: "M" },
    malmö: { lat: 55.605, lon: 13.0038, county_code: "M" },
    sverige: { lat: 62.0, lon: 15.0, county_code: "" } 
  }
  return table[city]
}

/* ============================================================
   Small UI atoms
============================================================ */
function TagInput({ value, onChange, placeholder }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [draft, setDraft] = useState("")
  function commitDraft() {
    const t = draft.trim()
    if (t && !value.includes(t)) onChange([...value, t])
    setDraft("")
  }
  return (
    <div className="rounded-md border bg-white p-2">
      <div className="flex flex-wrap gap-2">
        {value.map((tag, i) => (
          <span key={`${tag}-${i}`} className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-3 py-1 text-sm text-blue-700">
            {tag}
            <button type="button" className="ml-1 text-blue-700/70 hover:text-blue-900" onClick={() => onChange(value.filter((t) => t !== tag))}>
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          className="flex-1 min-w-[160px] outline-none bg-transparent px-2 py-1 text-sm"
          value={draft}
          placeholder={placeholder ?? "Add and press Enter"}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault()
              commitDraft()
            }
          }}
          onBlur={commitDraft}
        />
      </div>
    </div>
  )
}

function ScoreLegend() {
  const { t } = useLanguage()
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-slate-600">
      <span className="rounded bg-slate-100 px-2 py-1">{t("Profilscore = hur väl ditt CV passar", "Profile score = how well your CV fits")}</span>
      <span className="rounded bg-slate-100 px-2 py-1">{t("Önskemål = hur väl dina preferenser passar", "Preferences = how well your preferences fit")}</span>
      <span className="rounded bg-slate-100 px-2 py-1">{t("Slutbetyg = 0.7*profil + 0.3*önskemål (+ ev. remote boost)", "Final score = 0.7*profile + 0.3*preferences (+ optional remote boost)")}</span>
    </div>
  )
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

function createInitialCvIntakeDraft(email = ""): CvIntakeDraft {
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

function validateCvIntakeForCheckout(
  draft: CvIntakeDraft,
  flow: PackageChoice["flow"],
  lang: SiteLanguage
): string | null {
  const t = (sv: string, en: string) => (lang === "sv" ? sv : en)
  if (!draft.fullName.trim()) return t("Fyll i fullständigt namn.", "Enter full name.")
  if (!draft.address.trim()) return t("Fyll i adress.", "Enter address.")
  if (!draft.phone.trim()) return t("Fyll i telefonnummer.", "Enter phone number.")
  if (!draft.email.trim()) return t("Fyll i e-post.", "Enter email.")
  if (draft.targetJobLink.trim()) {
    try {
      const url = new URL(draft.targetJobLink.trim())
      if (!["http:", "https:"].includes(url.protocol)) {
        return t("Jobblänken måste börja med http:// eller https://.", "Job link must start with http:// or https://.")
      }
    } catch {
      return t("Ange en giltig jobblänk.", "Enter a valid job link.")
    }
  }
  if (!draft.profileSummary.trim()) return t("Skriv en kort profiltext.", "Write a short profile summary.")

  const exp1 = draft.experiences[0]
  if (!exp1.title.trim() || !exp1.company.trim() || !exp1.tasks.trim()) {
    return t(
      "Fyll i minst Erfarenhet 1 (titel, företag och arbetsuppgifter).",
      "Fill in at least Experience 1 (title, company and tasks)."
    )
  }

  if (!draft.education.program.trim() || !draft.education.school.trim()) {
    return t("Fyll i utbildning (utbildning/examen och skola).", "Fill in education (program/degree and school).")
  }
  if (draft.includeAdditionalEducation) {
    if (!draft.education2.program.trim() || !draft.education2.school.trim()) {
      return t(
        "Fyll i den extra utbildningen (utbildning/examen och skola) eller avmarkera rutan.",
        "Fill in the extra education (program/degree and school) or uncheck the box."
      )
    }
  }

  if (!draft.skills.trim()) return t("Fyll i kompetenser / skills.", "Fill in skills.")

  return null
}

function CareerWishlistForm({ initial, onCancel, onSubmit, remoteBoost, setRemoteBoost }: { initial: Wish; onCancel: () => void; onSubmit: (wish: Wish) => void; remoteBoost: boolean; setRemoteBoost: (v: boolean) => void }) {
  const { t } = useLanguage()
  const [titles, setTitles] = useState<string[]>(initial.titles ?? [])
  const [industries, setIndustries] = useState<string[]>(initial.industries ?? [])
  const [useSkills, setUseSkills] = useState<string[]>(initial.use_skills ?? [])
  const [learnSkills, setLearnSkills] = useState<string[]>(initial.learn_skills ?? [])
  const [companySize, setCompanySize] = useState<Wish["company_size"]>(initial.company_size ?? null)
  const [modality, setModality] = useState<Wish["modality"]>(initial.modality ?? null)
  const [includeNearbyMetro, setIncludeNearbyMetro] = useState<boolean>(initial.includeNearbyMetro ?? true)
  const [locationCity, setLocationCity] = useState<string>(initial.location_city ?? "")

  function submit() {
    onSubmit({ titles, industries, use_skills: useSkills, learn_skills: learnSkills, company_size: companySize, modality, includeNearbyMetro, location_city: locationCity })
  }

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle>Career Wishlist</CardTitle>
        <CardDescription>Berätta om rollerna och preferenserna du vill prioritera</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>Titlar</Label>
          <TagInput value={titles} onChange={setTitles} placeholder="t.ex. Automationstekniker, Processpecialist" />
        </div>
        <div>
          <Label>Branscher</Label>
          <TagInput value={industries} onChange={setIndustries} placeholder="t.ex. Logistik, Tillverkning, Energi" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Kompetenser att använda</Label>
            <TagInput value={useSkills} onChange={setUseSkills} placeholder="t.ex. PLC, Python, SQL" />
          </div>
          <div>
            <Label>Kompetenser att lära</Label>
            <TagInput value={learnSkills} onChange={setLearnSkills} placeholder="t.ex. Kubernetes, Rust" />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <Label>Företagsstorlek</Label>
            <div className="mt-2 flex flex-wrap gap-2 text-sm">
              {(["small", "medium", "large"] as const).map((s) => (
                <button key={s} type="button" onClick={() => setCompanySize(companySize === s ? null : s)} className={`rounded border px-3 py-1 ${companySize === s ? "border-blue-600 text-blue-700" : "border-slate-300 text-slate-700"}`}>
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label>Arbetssätt</Label>
            <div className="mt-2 flex flex-wrap gap-2 text-sm">
              {(["onsite", "hybrid", "remote"] as const).map((m) => (
                <button key={m} type="button" onClick={() => setModality(modality === m ? null : m)} className={`rounded border px-3 py-1 ${modality === m ? "border-blue-600 text-blue-700" : "border-slate-300 text-slate-700"}`}>
                  {m}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label>Plats</Label>
            <Input className="mt-2" placeholder="t.ex. Stockholm" value={locationCity} onChange={(e) => setLocationCity(e.target.value)} />
          </div>
        </div>

        <div className="mt-2 flex items-center gap-2 text-xs text-slate-600">
          <input id="nearby" type="checkbox" className="accent-blue-600" checked={includeNearbyMetro} onChange={(e) => setIncludeNearbyMetro(e.target.checked)} />
          <Label htmlFor="nearby" className="text-xs">{t("Inkludera närliggande storstadsområde", "Include nearby metro area")}</Label>
        </div>

        <div className="mt-2 flex items-center gap-2 text-xs text-slate-600">
          <input id="remoteboost" type="checkbox" className="accent-blue-600" checked={remoteBoost} onChange={(e) => setRemoteBoost(e.target.checked)} />
          <Label htmlFor="remoteboost" className="text-xs">{t("Prioritera fjärr-/hybridjobb (+0.05)", "Prioritize remote/hybrid jobs (+0.05)")}</Label>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" onClick={onCancel}>Avbryt</Button>
          <Button onClick={submit}>Tillämpa önskemål</Button>
        </div>
      </CardContent>
    </Card>
  )
}

/* ============================================================
   Page Component (merged plan)
============================================================ */
export default function UnifiedLandingPage() {
  const router = useRouter()
  const { t, lang } = useLanguage()
  const displayPackageName = (name: string) => {
    if (lang === "sv") return name
    if (name === "CV + Personligt Brev + Konsultation") return "CV + Cover Letter + Consultation"
    if (name === "CV + Personligt Brev") return "CV + Cover Letter"
    return name
  }

  // Supabase session
  const [user, setUser] = useState<SupabaseUser | null>(null)
  const supabase = getBrowserSupabase()

  useEffect(() => {
    const init = async () => {
      try {
        const { data } = await supabase.auth.getSession()
        // @ts-ignore
        setUser(data?.session?.user ?? null)
      } catch (e) {
        console.warn("Session fetch failed", e)
      }
    }
    init()

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    return () => { sub.subscription?.unsubscribe() }
  }, [])

  // Job matching state
  const [city, setCity] = useState("")
  const [cvText, setCvText] = useState("")
  const [radiusKm, setRadiusKm] = useState(40)
  const [jobs, setJobs] = useState<JobRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'list' | 'map'>("list")
  const [remoteBoost, setRemoteBoost] = useState(false)
  const [showWishlist, setShowWishlist] = useState(false)
  const [lastInitPayload, setLastInitPayload] = useState<any>(null)
  const [lastRefinePayload, setLastRefinePayload] = useState<any>(null)

  // Booking State
  const [selectedPackage, setSelectedPackage] = useState<PackageChoice | null>(null)
  const [showCalendarModal, setShowCalendarModal] = useState(false)
  const [showIntakeModal, setShowIntakeModal] = useState(false)
  const [intakeSavedMessage, setIntakeSavedMessage] = useState("")
  const [intakeSubmitting, setIntakeSubmitting] = useState(false)
  const [cvIntakeDraft, setCvIntakeDraft] = useState<CvIntakeDraft>(() => createInitialCvIntakeDraft(""))
  const canBypassPayment = isAdminOrModerator(user)

  // Freemium
  const jobLimit = user ? 50 : 20
  const [freeJobsShown, setFreeJobsShown] = useState(0)

  // Disable radius input if city is "Sverige"
  const isCountryWide = city.trim().toLowerCase() === "sverige";

  // Network helpers
  async function safeParseResponse(res: Response) {
    const text = await res.text()
    try {
      return { data: text ? JSON.parse(text) : null, raw: text }
    } catch {
      return { data: { error: text }, raw: text }
    }
  }

  async function onFindMatches() {
    setError(null)
    if (!city.trim()) return setError("Ange en stad.")

    const geo = cityToGeo(city)
    
    if (!geo) return setError(t("Okänd stad. Prova t.ex. Stockholm, Uppsala eller Göteborg.", "Unknown city. Try e.g. Stockholm, Uppsala or Gothenburg."))

    // LOGGED IN FLOW
    if (user) {
      const payload = { 
        lat: geo.lat, 
        lon: geo.lon, 
        radius_km: isCountryWide ? 9999 : radiusKm 
      }
      try {
        setLoading(true)
        const res = await fetch("/api/match/for-user", { 
          method: "POST", 
          headers: { "Content-Type": "application/json" }, 
          body: JSON.stringify(payload) 
        })
        const { data, raw } = await safeParseResponse(res)
        
        if (!res.ok) {
          console.error("Match for user failed:", raw)
          if (res.status === 404 || res.status === 400) {
            setError(data?.error || t("Din profil verkar saknas eller vara ofullständig. Kontrollera 'Min profil'.", "Your profile seems missing or incomplete. Check 'My Profile'."))
          } else {
            setError(data?.error || t("Kunde inte hämta jobbförslag.", "Could not fetch job suggestions."))
          }
          setJobs([])
          return
        }

        const jobResults = data?.jobs || []
        setJobs(jobResults)
        setFreeJobsShown(Math.min(jobResults.length, jobLimit))
      } catch (e) {
        console.error(e)
        setError("Ett fel uppstod vid analysen.")
      } finally {
        setLoading(false)
      }

    } else {
      // ANONYMOUS FLOW
      if (!cvText.trim()) return setError("Klistra in lite CV‑text.")

      const payload = { 
        city, 
        lat: geo.lat ?? 0, 
        lon: geo.lon ?? 0, 
        county_code: geo.county_code ?? null, 
        radius_km: isCountryWide ? 9999 : radiusKm, 
        cv_text: cvText 
      }
      try {
        setLoading(true)
        setLastInitPayload(payload)
        const res = await fetch("/api/match/init", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
        const { data, raw } = await safeParseResponse(res)
        if (!res.ok) {
          console.error("Init failed:", raw)
          setError(data?.error || t("Kunde inte hämta jobbförslag.", "Could not fetch job suggestions."))
          setJobs([])
          return
        }
        const jobResults = data?.jobs || []
        setJobs(jobResults)
        setFreeJobsShown(Math.min(jobResults.length, jobLimit))
      } catch (e) {
        console.error(e)
        setError(t("Kunde inte hämta jobbförslag.", "Could not fetch job suggestions."))
      } finally {
        setLoading(false)
      }
    }
  }

  async function handleRefineSubmit(wish: Wish) {
    setShowWishlist(false)

    const payload = { candidate_id: user?.id || "demo-local", wish: { ...wish, remoteBoost } }
    try {
      setLoading(true)
      setLastRefinePayload(payload)
      const res = await fetch("/api/match/refine", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      const { data, raw } = await safeParseResponse(res)
      if (!res.ok) {
        console.error("Refine failed:", raw)
        setError(data?.error || t("Kunde inte förfina jobbförslagen.", "Could not refine job suggestions."))
        return
      }
      setJobs(data?.jobs || [])
    } catch (e) {
      console.error(e)
      setError(t("Kunde inte förfina jobbförslagen.", "Could not refine job suggestions."))
    } finally {
      setLoading(false)
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const target = e.currentTarget
    setError(null)
    setLoading(true)
    const file = e.target.files?.[0]
    if (!file) { setLoading(false); return }

    const fileName = file.name.toLowerCase()
    const isPdf = file.type === "application/pdf" || fileName.endsWith(".pdf")
    const isText = file.type === "text/plain" || fileName.endsWith(".txt")

    if (!isPdf && !isText) {
      setError(t("Endast .txt och .pdf filer stöds.", "Only .txt and .pdf files are supported."))
      setLoading(false)
      if (target) target.value = ""
      return
    }

    try {
      if (isText) {
        const text = await file.text()
        setCvText(text)
      } else if (isPdf) {
        const formData = new FormData()
        formData.append("file", file)
        const response = await fetch("/api/parse-pdf", { method: "POST", body: formData })
        if (!response.ok) throw new Error(t("Misslyckades att läsa PDF på servern.", "Failed to parse PDF on the server."))
        const data = await response.json()
        setCvText(data.text || "")
      }
    } catch (err) {
      console.error("file read error", err)
      setError(t("Kunde inte läsa filen.", "Could not read the file."))
    } finally {
      setLoading(false)
      if (target) target.value = ""
    }
  }

  function handleMapLocationChange(lat: number, lon: number, radius: number) {
    setRadiusKm(radius)
    if (user || cvText.trim()) onFindMatches()
  }

  // ===== BOOKING FLOW =====
  const initiateBooking = (pkg: PackageChoice) => {
    if (!user) {
      const proceed = confirm(t("Du behöver vara inloggad för att boka. Vill du logga in nu?", "You need to be logged in to continue. Do you want to log in now?"))
      if (proceed) router.push("/login")
      return
    }
    setSelectedPackage(pkg)
    setIntakeSavedMessage("")
    setCvIntakeDraft((prev) => ({
      ...prev,
      email: user.email || prev.email,
    }))

    if (pkg.flow === "booking") {
      setShowCalendarModal(true)
      setShowIntakeModal(false)
      return
    }

    setShowIntakeModal(true)
    setShowCalendarModal(false)
  }

  const handleSlotSelected = async (date: Date, time: string) => {
    if (!selectedPackage) return
    
    const dateStr = format(date, 'yyyy-MM-dd')
    
    await processPayment(selectedPackage, dateStr, time)
  }

  async function processPayment(pkg: { name: string, amount: number }, dateStr: string, timeStr: string) {
    try {
      const res = await fetch("/api/checkout", { 
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          packageName: pkg.name,
          amount: pkg.amount,
          bookingDate: dateStr,
          bookingTime: timeStr,
          email: user?.email
        })
      })

      const json = await res.json()
      
      if (json?.url) {
        window.location.href = json.url
      } else {
        console.error("Checkout error:", json)
        alert(t("Kunde inte starta betalning: ", "Could not start payment: ") + (json.error || t("Okänt fel", "Unknown error")))
      }
    } catch (e) {
      console.error(e)
      alert(t("Ett anslutningsfel uppstod.", "A connection error occurred."))
    }
  }

  const handleCvIntakeField = <K extends keyof CvIntakeDraft>(key: K, value: CvIntakeDraft[K]) => {
    setCvIntakeDraft((prev) => ({ ...prev, [key]: value }))
  }

  const handleExperienceField = (index: 0 | 1 | 2, key: keyof ExperienceEntry, value: ExperienceEntry[keyof ExperienceEntry]) => {
    setCvIntakeDraft((prev) => {
      const nextExperiences = [...prev.experiences] as [ExperienceEntry, ExperienceEntry, ExperienceEntry]
      nextExperiences[index] = { ...nextExperiences[index], [key]: value }
      return { ...prev, experiences: nextExperiences }
    })
  }

  const handleEducationField = (key: keyof EducationEntry, value: EducationEntry[keyof EducationEntry]) => {
    setCvIntakeDraft((prev) => ({ ...prev, education: { ...prev.education, [key]: value } }))
  }

  const handleEducation2Field = (key: keyof EducationEntry, value: EducationEntry[keyof EducationEntry]) => {
    setCvIntakeDraft((prev) => ({ ...prev, education2: { ...prev.education2, [key]: value } }))
  }

  const saveCvIntake = async (bypassPayment = false) => {
    if (!selectedPackage) return
    const validationError = validateCvIntakeForCheckout(cvIntakeDraft, selectedPackage.flow, lang)
    if (validationError) {
      setIntakeSavedMessage(validationError)
      return
    }

    const payload = {
      package: selectedPackage,
      submittedAt: new Date().toISOString(),
      data: cvIntakeDraft,
    }

    try {
      setIntakeSubmitting(true)
      localStorage.setItem("cv-intake-draft", JSON.stringify(payload))
      setIntakeSavedMessage("")
      console.log("CV intake draft saved", payload)

      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          packageName: selectedPackage.name,
          amount: selectedPackage.amount,
          email: user?.email,
          orderType: "document_intake",
          intakeType: selectedPackage.flow,
          targetJobLink: cvIntakeDraft.targetJobLink || null,
          intakePayload: payload,
          bypassPayment,
        })
      })

      const json = await res.json()
      if (json?.bypassed) {
        setIntakeSavedMessage(t("Testorder skapad utan betalning.", "Test order created without payment."))
        return
      }
      if (json?.url) {
        window.location.href = json.url
        return
      }

      console.error("Checkout error:", json)
      setIntakeSavedMessage(t("Dina uppgifter är sparade. Kunde inte starta betalning just nu.", "Your details are saved. Could not start payment right now."))
    } catch (e) {
      console.error(e)
      setIntakeSavedMessage(t("Dina uppgifter är sparade. Ett anslutningsfel uppstod vid betalning.", "Your details are saved. A connection error occurred during payment."))
    } finally {
      setIntakeSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-white">
      {/* === HERO === */}
      <section className="relative bg-gradient-to-br from-blue-50 via-white to-amber-50 py-14 lg:py-20">
        <div className="container mx-auto px-4">
          <div className="grid gap-8 lg:grid-cols-[0.85fr_1.9fr] items-center">
            <div className="space-y-6">
              <h1 className="text-4xl lg:text-5xl font-bold text-slate-900 text-balance">
                {t("Hitta det perfekta jobbet för dig med hjälp av en AI-manager", "Find the right job for you with the help of an AI manager")}
              </h1>
              
              <p className="text-xl text-slate-700">
                {t("Ange dina kvalifikationer och din erfarenhet så hittar vi det perfekta jobbet för dig", "Share your qualifications and experience, and we will find the right jobs for you")}
              </p>
              
              <blockquote className="border-l-4 border-blue-600 pl-4 italic text-slate-700">
                {t(
                  '"I takt med den snabba automatiseringen och digitaliseringen har nya yrkesområden uppstått som ännu inte är tydligt definierade. Vi hjälper dig – ange dina önskemål och kvalifikationer så hittar vi jobb som passar dig."',
                  '"As automation and digitalization accelerate, new job areas are emerging that are not yet clearly defined. We help you identify roles that fit your qualifications and goals."'
                )}
              </blockquote>

              <div className="flex flex-wrap gap-4">
                <Button size="lg" className="bg-blue-600 hover:bg-blue-700" asChild>
                  <a href="#packages">🎯 {t("Välj ditt paket", "Choose your package")}</a>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <Link href="/dashboard">📊 {t("Matcha jobb", "Find job")}</Link>
                </Button>
              </div>
              
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <div className="flex">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" />
                  ))}
                </div>
                <span className="font-semibold">{t("Högsta betyg", "Top rating")}</span>
                <span>{t("från verifierade kandidater", "from verified candidates")}</span>
              </div>
              <div className="rounded-2xl border border-blue-100 bg-white/80 px-4 py-3 text-sm text-slate-700 shadow-sm backdrop-blur-sm">
                <span className="font-semibold text-slate-900">
                  {t("Mitt mål med JobbNu:", "My goal with JobbNu:")}
                </span>{" "}
                {t(
                  "att hjälpa 10 000 personer hitta jobb genom smartare och mer träffsäker matchning.",
                  "to help 10,000 people find jobs through smarter and more accurate matching."
                )}
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                <Users className="h-3.5 w-3.5" />
                {t("Ny tjänst: Kandidatrepresentation 300 kr/mån", "New service: Candidate Representation 300 SEK/month")}
              </div>
            </div>
            <div className="flex justify-center lg:justify-end">
              <div className="relative w-full max-w-none">
                <div className="absolute inset-0 bg-blue-200 rounded-full blur-3xl opacity-20" />
                <Image
                  src="/star-business-award-2026-masked.png"
                  alt={t("Star Business Awards utmärkelse", "Star Business Awards certificate")}
                  width={2400}
                  height={3200}
                  quality={100}
                  sizes="(max-width: 640px) 42vw, (max-width: 1024px) 40vw, 34vw"
                  className="relative mx-auto w-[42vw] max-w-[420px] sm:w-[40vw] sm:max-w-[460px] lg:w-[34vw] lg:max-w-[560px] xl:max-w-[620px] drop-shadow-2xl object-contain"
                  priority
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* === PACKAGES === */}
      <section id="packages" className="py-20 bg-white">
        <div className="container mx-auto px-4">
          <div className="text-center space-y-3 mb-10">
            <h2 className="text-3xl lg:text-4xl font-bold text-slate-900">
              {t("Kom igång – det tar 5 minuter", "Get started – takes 5 minutes")}
            </h2>
            <p className="text-base text-slate-500 max-w-xl mx-auto">
              {t(
                "Köp CV:t en gång, hitta matchande jobb i dashboarden och beställ personliga brev för varje jobb du söker.",
                "Buy the CV once, find matching jobs in the dashboard, then order a cover letter for each job you apply to."
              )}
            </p>
          </div>

          {/* Step flow */}
          <div className="flex items-center justify-center gap-0 mb-12 max-w-md mx-auto text-xs">
            {(lang === "sv"
              ? [["1", "Skapa CV"], ["2", "Hitta jobb"], ["3", "Beställ brev"]]
              : [["1", "Create CV"], ["2", "Find jobs"], ["3", "Order letters"]]
            ).map(([num, label], i, arr) => (
              <React.Fragment key={num}>
                <div className="flex flex-col items-center gap-1.5">
                  <div className="w-7 h-7 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">{num}</div>
                  <span className="text-slate-600 font-medium whitespace-nowrap">{label}</span>
                </div>
                {i < arr.length - 1 && <div className="flex-1 h-px bg-slate-300 mx-3 mb-5" />}
              </React.Fragment>
            ))}
          </div>

          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto items-stretch">

            {/* Card 1 — CV */}
            <Card className="border-2 border-slate-200 flex flex-col">
              <CardHeader className="text-center pb-4">
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">{t("Steg 1", "Step 1")}</div>
                <CardTitle className="text-xl">CV</CardTitle>
                <div className="mt-3">
                  <span className="text-4xl font-bold text-slate-900">119 kr</span>
                  <span className="text-sm text-slate-400 ml-1">{t("engångs", "one-time")}</span>
                </div>
                <CardDescription className="mt-2 text-xs">
                  {t("AI skriver ditt CV på 60 sekunder – anpassat mot jobbet du söker.", "AI writes your CV in 60 seconds – tailored to the job you are applying for.")}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col flex-1">
                <ul className="space-y-2.5 mb-6 flex-1">
                  {(lang === "sv"
                    ? ["Genereras direkt – ladda ner som PDF","ATS-optimerat – passerar automatiska filter","Klistra in jobblänk → CV anpassas mot rollen","Action-verb och professionellt språk","Avancerad AI-teknik"]
                    : ["Generated instantly – download as PDF","ATS-optimised – passes automatic filters","Paste job link → CV tailored to the role","Action verbs and professional language","Advanced AI technology"]
                  ).map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <Check className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                      <span className="text-sm text-slate-600">{item}</span>
                    </li>
                  ))}
                </ul>
                <Button className="w-full" variant="outline" size="lg" asChild>
                  <Link href="/cv">{t("Beställ CV →", "Order CV →")}</Link>
                </Button>
              </CardContent>
            </Card>

            {/* Card 2 — Dashboard Premium (featured) */}
            <Card className="relative border-2 border-blue-600 shadow-xl flex flex-col">
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-10">
                <Badge className="bg-blue-600 text-white px-4 py-1 text-xs">
                  <Star className="h-3 w-3 mr-1 inline" /> {t("Rekommenderas", "Recommended")}
                </Badge>
              </div>
              <CardHeader className="text-center pt-8 pb-4">
                <div className="text-xs font-semibold text-blue-500 uppercase tracking-widest mb-2">{t("Steg 2", "Step 2")}</div>
                <CardTitle className="text-xl">{t("Dashboard Premium", "Dashboard Premium")}</CardTitle>
                <div className="mt-3">
                  <span className="text-4xl font-bold text-slate-900">100 kr</span>
                  <span className="text-sm text-slate-400 ml-1">{t("/mån", "/mo")}</span>
                </div>
                <CardDescription className="mt-2 text-xs">
                  {t(
                    "AI jämför ditt CV mot tusentals riktiga platsannonser och rankar de jobb som passar dig bäst – varje dag.",
                    "AI compares your CV against thousands of real job listings and ranks the jobs that fit you best – every day."
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col flex-1">
                <ul className="space-y-2.5 mb-6 flex-1">
                  {(lang === "sv"
                    ? ["Tusentals jobb matchade mot ditt CV","AI rankar efter erfarenhet, titel, kompetens & ort","Se vilka skills du saknar per jobb","Gratis = 4 jobb · Premium = alla resultat","Nya annonser matchas automatiskt varje dag","Avsluta prenumerationen när som helst"]
                    : ["Thousands of jobs matched to your CV","AI ranks by experience, title, skills & location","See which skills you are missing per job","Free = 4 jobs · Premium = all results","New listings matched automatically every day","Cancel subscription at any time"]
                  ).map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <Check className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                      <span className="text-sm text-slate-600">{item}</span>
                    </li>
                  ))}
                </ul>
                <Button className="w-full bg-blue-600 hover:bg-blue-700" size="lg" asChild>
                  <Link href="/dashboard">{t("Prova gratis →", "Try for free →")}</Link>
                </Button>
                <p className="text-center text-xs text-slate-400 mt-2">
                  {t("4 matcher gratis. Uppgradera när du vill.", "4 free matches. Upgrade whenever.")}
                </p>
              </CardContent>
            </Card>

            {/* Card 3 — Personligt Brev */}
            <Card className="border-2 border-slate-200 flex flex-col">
              <CardHeader className="text-center pb-4">
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">{t("Steg 3", "Step 3")}</div>
                <CardTitle className="text-xl">{t("Personligt Brev", "Cover Letter")}</CardTitle>
                <div className="mt-3">
                  <span className="text-4xl font-bold text-slate-900">{t("fr. 99 kr", "from 99 SEK")}</span>
                </div>
                <CardDescription className="mt-2 text-xs">
                  {t(
                    "Hämta jobblänken från din Dashboard. AI läser hela annonsen och skriver ett unikt brev mot just den tjänsten.",
                    "Grab the job link from your Dashboard. AI reads the full posting and writes a unique letter for that exact role."
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col flex-1">
                <ul className="space-y-2.5 mb-4 flex-1">
                  {(lang === "sv"
                    ? ["1 brev = 99 kr · varje extra jobb +30 kr","AI läser jobbannonsen automatiskt","Unikt brev per tjänst – aldrig generiskt","Klart på under 30 sekunder","Svenska eller engelska"]
                    : ["1 letter = 99 SEK · each extra job +30 SEK","AI reads the job posting automatically","Unique letter per role – never generic","Ready in under 30 seconds","Swedish or English"]
                  ).map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <Check className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                      <span className="text-sm text-slate-600">{item}</span>
                    </li>
                  ))}
                </ul>
                <div className="rounded-lg bg-blue-50 border border-blue-100 px-3 py-2 text-xs text-blue-700 mb-4">
                  {t("Tips: Hämta jobblänkarna från din", "Tip: Get your job links from your")}{" "}
                  <Link href="/dashboard" className="font-semibold underline hover:text-blue-900">{t("Matchningsdashboard →", "Matching Dashboard →")}</Link>
                </div>
                <Button className="w-full" variant="outline" size="lg" asChild>
                  <Link href="/pb">{t("Beställ brev →", "Order letter →")}</Link>
                </Button>
              </CardContent>
            </Card>
          </div>

          {!user && (
            <p className="mt-8 text-center text-sm text-slate-500">
              {t("Inte registrerad än?", "Not registered yet?")}{" "}
              <Link href="/login" className="text-blue-700 hover:underline inline-flex items-center gap-1">
                <LogIn className="h-4 w-4" /> {t("Skapa konto eller logga in", "Create an account or log in")}
              </Link>{" "}
              {t("för att slutföra köp.", "to complete your purchase.")}
            </p>
          )}
        </div>
      </section>

      <section id="representation" className="py-16 bg-emerald-50 border-y border-emerald-100">
        <div className="container mx-auto px-4">
          <div className="max-w-5xl mx-auto">
            <Card className="border-2 border-emerald-200 shadow-sm bg-white">
              <CardHeader>
                <div className="inline-flex w-fit items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                  <Badge className="bg-emerald-600 text-white">{t("Nytt", "New")}</Badge>
                  <span>{t("Representationsprogram", "Representation Program")}</span>
                </div>
                <CardTitle className="mt-3 text-2xl lg:text-3xl text-slate-900">
                  {t("Kandidatrepresentation – jag representerar dig mot arbetsgivare", "Candidate Representation - I represent you toward employers")}
                </CardTitle>
                <CardDescription className="text-slate-700">
                  {t(
                    "För dig som vill ha aktiv hjälp i jobbsökandet. Med mitt diplom i grunden arbetar jag som din partner och kontaktar arbetsgivare för att öppna dörrar till relevanta roller.",
                    "For you who want active support in your job search. With my diploma as a foundation, I act as your partner and contact employers to open doors to relevant roles."
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-6 lg:grid-cols-[1.2fr_auto] lg:items-center">
                <div>
                  <ul className="space-y-2.5">
                    {(lang === "sv"
                      ? [
                          "Pris: 300 kr per månad",
                          "Personlig representation av din profil mot arbetsgivare",
                          "Aktiv kontakt med relevanta företag och rekryterare",
                          "Löpande återkoppling om dialoger, möjligheter och nästa steg",
                          "Målet är intervjuer och faktisk rörelse mot nytt jobb"
                        ]
                      : [
                          "Price: 300 SEK per month",
                          "Personal representation of your profile toward employers",
                          "Active outreach to relevant companies and recruiters",
                          "Continuous feedback on conversations, opportunities, and next steps",
                          "The goal is interviews and real movement toward a new job"
                        ]).map((item) => (
                      <li key={item} className="flex items-start gap-2">
                        <Check className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                        <span className="text-sm text-slate-700">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="flex flex-col gap-3 lg:min-w-[220px]">
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-center">
                    <div className="text-xs uppercase tracking-wide text-emerald-700 font-semibold">{t("Månadspris", "Monthly price")}</div>
                    <div className="text-3xl font-bold text-slate-900">300 kr</div>
                  </div>
                  <Button className="bg-emerald-600 hover:bg-emerald-700" asChild>
                    <a href="mailto:info@jobbnu.se?subject=Intresse%20f%C3%B6r%20kandidatrepresentation%20300%20kr/m%C3%A5n">
                      {t("Ansök om representation", "Apply for representation")}
                    </a>
                  </Button>
                  <Button variant="outline" asChild>
                    <a href="#contact">{t("Ställ en fråga först", "Ask a question first")}</a>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* === JOB CATEGORIES === */}
      <JobCategoriesSection />

      <section className="py-16 bg-slate-50 border-y border-slate-200">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <Card className="border-blue-100 shadow-sm">
              <CardHeader className="bg-gradient-to-r from-blue-50 to-cyan-50">
                <CardTitle className="flex items-center gap-2">
                  <Wand2 className="h-5 w-5 text-blue-600" />
                  {t("Jobbdashboard", "Job dashboard")}
                </CardTitle>
                <CardDescription>
                  {t("Alla jobbförslag och analyser finns nu i din dashboard.", "All job suggestions and analyses are now in your dashboard.")}
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-slate-600">
                    {t("Öppna dashboarden för att se dina jobbkort, ATS-score, grade-skala och detaljerad analys.", "Open the dashboard to see your job cards, ATS score, grade scale and detailed analysis.")}
                  </p>
                  <Button asChild className="bg-blue-600 hover:bg-blue-700">
                    <Link href="/dashboard">📊 {t("Matcha Jobb", "Find Job")}</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section className="bg-white py-10">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-4xl rounded-3xl border border-slate-200 bg-gradient-to-r from-slate-50 to-blue-50 px-6 py-8 text-center shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-700">
              {t("Målet är enkelt", "The goal is simple")}
            </p>
            <p className="mt-3 text-2xl font-bold text-slate-900 lg:text-3xl">
              {t(
                "Hjälpa 10 000 personer hitta jobb.",
                "Help 10,000 people find jobs."
              )}
            </p>
            <p className="mx-auto mt-3 max-w-2xl text-sm text-slate-600">
              {t(
                "JobbNu byggs med en tydlig ambition: att göra jobbsökandet snabbare, skarpare och mer träffsäkert för fler människor.",
                "JobbNu is being built with a clear ambition: to make job searching faster, sharper, and more accurate for more people."
              )}
            </p>
          </div>
        </div>
      </section>

      <section id="about" className="py-20 bg-slate-50">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center space-y-8">
            <h2 className="text-3xl lg:text-4xl font-bold text-slate-900">{t("Varför välja mig?", "Why choose me?")}</h2>
            <p className="mx-auto max-w-2xl text-base text-slate-600">
              {t(
                "Jag satte ett tydligt mål när jag byggde JobbNu: att hjälpa 10 000 personer hitta jobb.",
                "I set a clear goal when I built JobbNu: to help 10,000 people find jobs."
              )}
            </p>
            <div className="grid md:grid-cols-3 gap-8 mt-12">
              <div className="text-center space-y-4">
                <div className="bg-blue-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto">
                  <BrainCircuit className="h-8 w-8 text-blue-600" />
                </div>
                <h3 className="text-xl font-semibold">{t("Smart AI-analys", "Smart AI analysis")}</h3>
                <p className="text-slate-600">
                  {t("Systemet förstår innebörden i ditt CV – inte bara nyckelord. Vi analyserar din unika profil semantiskt mot tusentals annonser för att hitta dolda möjligheter.", "The system understands the meaning of your CV, not just keywords. We analyze your profile semantically against thousands of ads to find hidden opportunities.")}
                </p>
              </div>
              <div className="text-center space-y-4">
                <div className="bg-blue-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto"><FileText className="h-8 w-8 text-blue-600" /></div>
                <h3 className="text-xl font-semibold">{t("Svenska & Engelska", "Swedish & English")}</h3>
                <p className="text-slate-600">{t("Alla tjänster levereras på svenska som standard, med möjlighet till engelska vid behov.", "All services are delivered in Swedish by default, with English available when needed.")}</p>
              </div>
              <div className="text-center space-y-4">
                <div className="bg-blue-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto"><Award className="h-8 w-8 text-blue-600" /></div>
                <h3 className="text-xl font-semibold">{t("Personlig Coaching", "Personal Coaching")}</h3>
                <p className="text-slate-600">{t("Fokus på verktyg och strategier som fungerar långsiktigt – inte bara en engångstext.", "Focus on tools and strategies that work long term, not just a one-off document.")}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 bg-white">
        <div className="container mx-auto px-4">
          <div className="text-center space-y-4 mb-16">
            <h2 className="text-3xl lg:text-4xl font-bold text-slate-900">{t("Vanliga frågor", "Frequently asked questions")}</h2>
          </div>
          <div className="max-w-3xl mx-auto">
            <Accordion type="single" collapsible>
              <AccordionItem value="item-1">
                <AccordionTrigger>{t("Vad ingår i konsultationen?", "What is included in the consultation?")}</AccordionTrigger>
                <AccordionContent>{t("Konsultationen är ett 45‑minuters personligt möte (video eller telefon) där vi går igenom din karriär, diskuterar dina mål, och skapar en konkret jobbsökningsstrategi.", "The consultation is a 45-minute personal meeting (video or phone) where we review your career, discuss your goals, and create a concrete job search strategy.")}</AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-2">
                <AccordionTrigger>{t("Hur lång tid tar leverans?", "How long is the delivery time?")}</AccordionTrigger>
                <AccordionContent>{t("CV inom 3‑5 dagar, CV + Brev 5‑7 dagar, paket med konsultation 7‑10 dagar.", "CV within 3-5 days, CV + letter in 5-7 days, consultation package in 7-10 days.")}</AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-3">
                <AccordionTrigger>{t("Kan jag få dokument på engelska?", "Can I get the documents in English?")}</AccordionTrigger>
                <AccordionContent>{t("Ja, alla tjänster kan levereras på svenska eller engelska.", "Yes, all services can be delivered in Swedish or English.")}</AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-4">
                <AccordionTrigger>{t("Vad är kandidatrepresentation (300 kr/mån)?", "What is candidate representation (300 SEK/month)?")}</AccordionTrigger>
                <AccordionContent>
                  {t(
                    "Det är en aktiv tjänst där jag representerar dig mot arbetsgivare, kontaktar relevanta företag och hjälper dig driva processen framåt. Målet är konkreta intervjuer och bättre möjligheter till anställning.",
                    "It is an active service where I represent you toward employers, contact relevant companies, and help move your process forward. The goal is concrete interviews and better hiring opportunities."
                  )}
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        </div>
      </section>

      <footer id="contact" className="bg-slate-900 text-white py-16">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-3 gap-8">
            <div>
              <h3 className="text-xl font-bold mb-4">{t("Kontakta Nikola", "Contact Nikola")}</h3>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Mail className="h-5 w-5" />
                  <span>info@jobbnu.se</span>
                </div>
                <div className="flex items-center gap-3">
                  <MessageSquareText className="h-5 w-5" />
                  <span>{t("076-173 34 73 (Endast SMS)", "076-173 34 73 (SMS only)")}</span>
                </div>
              </div>
            </div>
            <div>
              <h3 className="text-xl font-bold mb-4">{t("Snabbkontakt", "Quick contact")}</h3>
              <ContactForm />
            </div>
            <div>
              <h3 className="text-xl font-bold mb-4">{t("Tjänster", "Services")}</h3>
              <div className="space-y-2 text-slate-300">
                {(lang === "sv"
                  ? ["Professionell CV‑skrivning","Personliga brev","Kandidatrepresentation (300 kr/mån)","Jobbkonsultation & coaching","Intervjuförberedelse","Jobbsökningsstrategier","AI‑drivna jobbförslag"]
                  : ["Professional CV writing","Cover letters","Candidate representation (300 SEK/month)","Career consultation & coaching","Interview preparation","Job search strategies","AI-driven job suggestions"]).map((item) => <p key={item}>{item}</p>)}
              </div>
              <p className="mt-4 text-sm text-slate-400">
                {t("Målet: hjälpa 10 000 personer hitta jobb.", "Goal: help 10,000 people find jobs.")}
              </p>
            </div>
          </div>
          <div className="border-t border-slate-700 mt-12 pt-8 text-center text-slate-400">
            <p>{t("© 2025 Nikola - CV & Jobbkonsultation. Alla rättigheter förbehållna.", "© 2025 Nikola - CV & Career Consulting. All rights reserved.")}</p>
          </div>
        </div>
      </footer>

      {/* === MODAL: BOOKING CALENDAR === */}
      {showCalendarModal && selectedPackage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm overflow-y-auto">
          <div className="relative w-full max-w-4xl bg-white rounded-xl shadow-2xl p-6 max-h-[90vh] overflow-y-auto my-8">
            <button 
              onClick={() => setShowCalendarModal(false)}
              className="absolute top-4 right-4 text-gray-500 hover:text-gray-800 z-10"
            >
              <X className="h-6 w-6" />
            </button>
            
            <div className="mb-6 pr-8">
              <h2 className="text-2xl font-bold text-slate-900">{t("Boka tid för", "Book time for")} {displayPackageName(selectedPackage.name)}</h2>
              <p className="text-slate-600">{t("Välj en tid som passar dig. Betalning sker i nästa steg.", "Choose a time that suits you. Payment happens in the next step.")}</p>
            </div>

            <BookingCalendar onSelectSlot={handleSlotSelected} />
          </div>
        </div>
      )}

      {/* === MODAL: CV / LETTER INTAKE === */}
      {showIntakeModal && selectedPackage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm overflow-y-auto">
          <div className="relative w-full max-w-5xl bg-white rounded-xl shadow-2xl p-6 max-h-[92vh] overflow-y-auto my-8">
            <button
              onClick={() => setShowIntakeModal(false)}
              className="absolute top-4 right-4 text-gray-500 hover:text-gray-800 z-10"
              type="button"
            >
              <X className="h-6 w-6" />
            </button>

            <div className="mb-6 pr-8">
              <h2 className="text-2xl font-bold text-slate-900">{displayPackageName(selectedPackage.name)} • {t("Underlag", "Details")}</h2>
              <p className="text-slate-600 mt-1">
                {t("Fyll i informationen nedan så vi kan ta fram ett starkt CV", "Fill in the information below so we can prepare a strong CV")}
                {t("utifrån dina uppgifter.", "based on your information.")}
              </p>
            </div>

            {intakeSavedMessage && (
              <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
                {intakeSavedMessage}
              </div>
            )}

            <div className="space-y-8">
              <section className="rounded-xl border border-slate-200 p-5">
                <h3 className="text-lg font-semibold text-slate-900">{t("1. Kontaktuppgifter", "1. Contact details")}</h3>
                <p className="mt-1 text-sm text-slate-600">{t("Detta används i CV:t. Skriv korrekt och komplett information.", "This is used in the CV. Enter correct and complete information.")}</p>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>{t("Fullständigt namn", "Full name")}</Label>
                    <Input value={cvIntakeDraft.fullName} onChange={(e) => handleCvIntakeField("fullName", e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("E-post", "Email")}</Label>
                    <Input value={cvIntakeDraft.email} onChange={(e) => handleCvIntakeField("email", e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("Telefonnummer", "Phone number")}</Label>
                    <Input value={cvIntakeDraft.phone} onChange={(e) => handleCvIntakeField("phone", e.target.value)} />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>{t("Har du redan ett jobb du är intresserad av? Skicka länken (valfritt)", "Already have a job you're interested in? Share the link (optional)")}</Label>
                    <Input
                      type="url"
                      inputMode="url"
                      placeholder="https://..."
                      value={cvIntakeDraft.targetJobLink}
                      onChange={(e) => handleCvIntakeField("targetJobLink", e.target.value)}
                    />
                    <p className="text-xs text-slate-500">
                      {t(
                        "Vi använder länken för att anpassa CV (och personligt brev om du beställer det) mot annonsen. Den används som underlag, inte som din nuvarande jobbtitel.",
                        "We use the link to tailor the CV (and cover letter if ordered) to the job ad. It is used as input, not as your current job title."
                      )}
                    </p>
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>{t("Adress", "Address")}</Label>
                    <Input
                      placeholder={t("Gatuadress, postnummer, ort", "Street address, postal code, city")}
                      value={cvIntakeDraft.address}
                      onChange={(e) => handleCvIntakeField("address", e.target.value)}
                    />
                    <p className="text-xs text-slate-500">{t("Tips: Full adress behövs i underlaget. CV kan senare visas med endast ort om du vill.", "Tip: Full address is needed in the details. The CV can later show only the city if you prefer.")}</p>
                  </div>
                </div>
              </section>

              <section className="rounded-xl border border-slate-200 p-5">
                <h3 className="text-lg font-semibold text-slate-900">{t("2. Kort profiltext (viktig)", "2. Short profile summary (important)")}</h3>
                <p className="mt-1 text-sm text-slate-600">
                  {t("Skriv fritt: vad du har arbetat med, vad du är bra på, vilken typ av jobb du söker, och gärna konkreta resultat.", "Write freely: what you have worked with, what you are good at, what kind of job you want, and ideally concrete results.")}
                </p>
                <Textarea
                  className="mt-4 min-h-[130px]"
                  placeholder={t("Exempel: Jag har arbetat 4 år inom kundservice och administration... Jag är särskilt stark på...", "Example: I have worked 4 years in customer service and administration... I am especially strong in...")}
                  value={cvIntakeDraft.profileSummary}
                  onChange={(e) => handleCvIntakeField("profileSummary", e.target.value)}
                />
              </section>

              <section className="rounded-xl border border-slate-200 p-5">
                <h3 className="text-lg font-semibold text-slate-900">{t("3. Arbetslivserfarenhet (3 fält)", "3. Work experience (3 fields)")}</h3>
                <p className="mt-1 text-sm text-slate-600">{t("Erfarenhet 1 är obligatorisk. Erfarenhet 2 och 3 är valfria.", "Experience 1 is required. Experience 2 and 3 are optional.")}</p>
                <label className="mt-3 inline-flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={cvIntakeDraft.includeExperience3}
                    onChange={(e) => handleCvIntakeField("includeExperience3", e.target.checked)}
                  />
                  {t("Jag vill lägga till Erfarenhet 3 (extra erfarenhet)", "I want to add Experience 3 (additional experience)")}
                </label>

                <div className="mt-4 space-y-5">
                  {[0, 1, 2].map((idx) => {
                    if (idx === 2 && !cvIntakeDraft.includeExperience3) return null
                    const exp = cvIntakeDraft.experiences[idx as 0 | 1 | 2]
                    const isRequired = idx === 0
                    return (
                      <div key={idx} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                        <div className="mb-3 flex items-center justify-between">
                          <h4 className="font-semibold text-slate-900">
                            {t("Erfarenhet", "Experience")} {idx + 1} {isRequired ? t("(obligatorisk)", "(required)") : t("(valfri)", "(optional)")}
                          </h4>
                          <label className="flex items-center gap-2 text-sm text-slate-600">
                            <input
                              type="checkbox"
                              checked={exp.current}
                              onChange={(e) => handleExperienceField(idx as 0 | 1 | 2, "current", e.target.checked)}
                            />
                            {t("Pågående", "Current")}
                          </label>
                        </div>
                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="space-y-2">
                            <Label>{t("Titel", "Title")}</Label>
                            <Input value={exp.title} onChange={(e) => handleExperienceField(idx as 0 | 1 | 2, "title", e.target.value)} />
                          </div>
                          <div className="space-y-2">
                            <Label>{t("Företag", "Company")}</Label>
                            <Input value={exp.company} onChange={(e) => handleExperienceField(idx as 0 | 1 | 2, "company", e.target.value)} />
                          </div>
                          <div className="space-y-2">
                            <Label>{t("Ort", "City")}</Label>
                            <Input value={exp.city} onChange={(e) => handleExperienceField(idx as 0 | 1 | 2, "city", e.target.value)} />
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                              <Label>{t("Startdatum", "Start date")}</Label>
                              <Input placeholder="YYYY-MM" value={exp.start} onChange={(e) => handleExperienceField(idx as 0 | 1 | 2, "start", e.target.value)} />
                            </div>
                            <div className="space-y-2">
                              <Label>{t("Slutdatum", "End date")}</Label>
                              <Input placeholder={exp.current ? t("Pågående", "Current") : "YYYY-MM"} value={exp.end} onChange={(e) => handleExperienceField(idx as 0 | 1 | 2, "end", e.target.value)} disabled={exp.current} />
                            </div>
                          </div>
                          <div className="space-y-2 md:col-span-2">
                            <Label>{t("Arbetsuppgifter (fri text)", "Tasks (free text)")}</Label>
                            <Textarea
                              rows={4}
                              placeholder={t("Vad gjorde du? Ansvar, arbetsuppgifter, team, kundkontakt, system...", "What did you do? Responsibilities, tasks, teams, customer contact, systems...")}
                              value={exp.tasks}
                              onChange={(e) => handleExperienceField(idx as 0 | 1 | 2, "tasks", e.target.value)}
                            />
                          </div>
                          <div className="space-y-2 md:col-span-2">
                            <Label>{t("Resultat / prestationer (fri text)", "Results / achievements (free text)")}</Label>
                            <Textarea
                              rows={3}
                              placeholder={t("Skriv konkreta resultat: förbättringar, försäljning, effektivisering, kundnöjdhet, projektleveranser...", "Write concrete results: improvements, sales, efficiency gains, customer satisfaction, project deliveries...")}
                              value={exp.achievements}
                              onChange={(e) => handleExperienceField(idx as 0 | 1 | 2, "achievements", e.target.value)}
                            />
                          </div>
                          <div className="space-y-2 md:col-span-2">
                            <Label>{t("Verktyg / teknik (valfritt)", "Tools / technology (optional)")}</Label>
                            <Input
                              placeholder={t("t.ex. Excel, SAP, React, Jira, truckkort", "e.g. Excel, SAP, React, Jira, forklift license")}
                              value={exp.tools}
                              onChange={(e) => handleExperienceField(idx as 0 | 1 | 2, "tools", e.target.value)}
                            />
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>

              <section className="rounded-xl border border-slate-200 p-5">
                <h3 className="text-lg font-semibold text-slate-900">{t("4. Utbildning (viktig)", "4. Education (important)")}</h3>
                <p className="mt-1 text-sm text-slate-600">{t("Minst en utbildning. Lägg till det viktigaste och relevanta kurser/inriktningar.", "At least one education entry. Add the most important details and relevant courses/specialization.")}</p>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>{t("Utbildning / Examen", "Education / Degree")}</Label>
                    <Input value={cvIntakeDraft.education.program} onChange={(e) => handleEducationField("program", e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("Skola / Lärosäte", "School / Institution")}</Label>
                    <Input value={cvIntakeDraft.education.school} onChange={(e) => handleEducationField("school", e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("Ort", "City")}</Label>
                    <Input value={cvIntakeDraft.education.city} onChange={(e) => handleEducationField("city", e.target.value)} />
                  </div>
                  <div className="flex items-end">
                    <label className="flex items-center gap-2 text-sm text-slate-600">
                      <input type="checkbox" checked={cvIntakeDraft.education.current} onChange={(e) => handleEducationField("current", e.target.checked)} />
                      {t("Pågående utbildning", "Ongoing education")}
                    </label>
                  </div>
                  <div className="space-y-2">
                    <Label>{t("Startdatum", "Start date")}</Label>
                    <Input placeholder="YYYY-MM" value={cvIntakeDraft.education.start} onChange={(e) => handleEducationField("start", e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("Slutdatum", "End date")}</Label>
                    <Input placeholder={cvIntakeDraft.education.current ? t("Pågående", "Current") : "YYYY-MM"} value={cvIntakeDraft.education.end} onChange={(e) => handleEducationField("end", e.target.value)} disabled={cvIntakeDraft.education.current} />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>{t("Relevant inriktning / kurser / examensarbete (fri text)", "Relevant specialization / courses / thesis (free text)")}</Label>
                    <Textarea
                      rows={3}
                      placeholder={t("Vad är viktigt att lyfta? Kurser, inriktning, projekt, examensarbete...", "What is important to highlight? Courses, specialization, projects, thesis...")}
                      value={cvIntakeDraft.education.details}
                      onChange={(e) => handleEducationField("details", e.target.value)}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={cvIntakeDraft.includeAdditionalEducation}
                        onChange={(e) => handleCvIntakeField("includeAdditionalEducation", e.target.checked)}
                      />
                      {t("Jag har fler utbildningar och vill lägga till en till", "I have multiple educations and want to add one more")}
                    </label>
                  </div>
                </div>

                {cvIntakeDraft.includeAdditionalEducation && (
                  <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <h4 className="font-semibold text-slate-900">{t("Extra utbildning", "Additional education")}</h4>
                    <div className="mt-3 grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>{t("Utbildning / Examen", "Education / Degree")}</Label>
                        <Input value={cvIntakeDraft.education2.program} onChange={(e) => handleEducation2Field("program", e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>{t("Skola / Lärosäte", "School / Institution")}</Label>
                        <Input value={cvIntakeDraft.education2.school} onChange={(e) => handleEducation2Field("school", e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>{t("Ort", "City")}</Label>
                        <Input value={cvIntakeDraft.education2.city} onChange={(e) => handleEducation2Field("city", e.target.value)} />
                      </div>
                      <div className="flex items-end">
                        <label className="flex items-center gap-2 text-sm text-slate-600">
                          <input type="checkbox" checked={cvIntakeDraft.education2.current} onChange={(e) => handleEducation2Field("current", e.target.checked)} />
                          {t("Pågående utbildning", "Ongoing education")}
                        </label>
                      </div>
                      <div className="space-y-2">
                        <Label>{t("Startdatum", "Start date")}</Label>
                        <Input placeholder="YYYY-MM" value={cvIntakeDraft.education2.start} onChange={(e) => handleEducation2Field("start", e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>{t("Slutdatum", "End date")}</Label>
                        <Input
                          placeholder={cvIntakeDraft.education2.current ? t("Pågående", "Current") : "YYYY-MM"}
                          value={cvIntakeDraft.education2.end}
                          onChange={(e) => handleEducation2Field("end", e.target.value)}
                          disabled={cvIntakeDraft.education2.current}
                        />
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <Label>{t("Relevant inriktning / kurser / examensarbete (fri text)", "Relevant specialization / courses / thesis (free text)")}</Label>
                        <Textarea
                          rows={3}
                          value={cvIntakeDraft.education2.details}
                          onChange={(e) => handleEducation2Field("details", e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </section>

              <section className="rounded-xl border border-slate-200 p-5">
                <h3 className="text-lg font-semibold text-slate-900">{t("5. Kompetenser / Skills", "5. Skills")}</h3>
                <p className="mt-1 text-sm text-slate-600">{t("Skriv både tekniska skills, verktyg, arbetssätt och det du är extra bra på.", "Include technical skills, tools, ways of working, and what you are especially good at.")}</p>
                <div className="mt-4 grid gap-4">
                  <div className="space-y-2">
                    <Label>{t("Skills (fri text)", "Skills (free text)")}</Label>
                    <Textarea
                      rows={4}
                      placeholder={t("Exempel: Kundservice, administration, Excel, CRM, projektledning, truckkort, PLC, JavaScript...", "Example: Customer service, administration, Excel, CRM, project management, forklift license, PLC, JavaScript...")}
                      value={cvIntakeDraft.skills}
                      onChange={(e) => handleCvIntakeField("skills", e.target.value)}
                    />
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>{t("Certifikat (valfritt)", "Certificates (optional)")}</Label>
                      <Textarea rows={3} value={cvIntakeDraft.certifications} onChange={(e) => handleCvIntakeField("certifications", e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>{t("Språk (valfritt)", "Languages (optional)")}</Label>
                      <Textarea rows={3} value={cvIntakeDraft.languages} onChange={(e) => handleCvIntakeField("languages", e.target.value)} />
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>{t("Körkort (valfritt)", "Driver's license (optional)")}</Label>
                      <Input placeholder={t("t.ex. B-körkort", "e.g. Category B driver's license")} value={cvIntakeDraft.driverLicense} onChange={(e) => handleCvIntakeField("driverLicense", e.target.value)} />
                    </div>
                    <div className="flex items-end">
                      <label className="flex items-center gap-2 text-sm text-slate-600">
                        <input
                          type="checkbox"
                          checked={cvIntakeDraft.includeFullAddressInCv}
                          onChange={(e) => handleCvIntakeField("includeFullAddressInCv", e.target.checked)}
                        />
                        {t("Visa full adress i CV (annars endast ort)", "Show full address in CV (otherwise city only)")}
                      </label>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>{t("Övrigt (valfritt)", "Additional info (optional)")}</Label>
                    <Textarea rows={3} value={cvIntakeDraft.additionalInfo} onChange={(e) => handleCvIntakeField("additionalInfo", e.target.value)} />
                  </div>
                </div>
              </section>

            </div>

            <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => setShowIntakeModal(false)}>
                {t("Stäng", "Close")}
              </Button>
              {canBypassPayment && (
                <Button type="button" variant="secondary" onClick={() => saveCvIntake(true)} disabled={intakeSubmitting}>
                  {intakeSubmitting ? t("Skapar testorder...", "Creating test order...") : t("Admin: Skapa testorder utan betalning", "Admin: Create test order without payment")}
                </Button>
              )}
              <Button type="button" className="bg-blue-600 hover:bg-blue-700" onClick={() => saveCvIntake(false)} disabled={intakeSubmitting}>
                {intakeSubmitting ? t("Startar betalning...", "Starting payment...") : t("Fortsätt till betalning", "Continue to payment")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* === MODAL: WISHLIST === */}
      {showWishlist && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 overflow-y-auto">
          <CareerWishlistForm
            initial={{ titles: [], use_skills: [], learn_skills: [], industries: [], company_size: null, modality: null, pace: null, structure: null, collaboration: null, includeNearbyMetro: true, location_city: city }}
            remoteBoost={remoteBoost}
            setRemoteBoost={setRemoteBoost}
            onCancel={() => setShowWishlist(false)}
            onSubmit={handleRefineSubmit}
          />
        </div>
      )}
    </div>
  )
}
