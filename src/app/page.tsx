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
          placeholder={placeholder ?? "Lägg till och tryck Enter"}
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
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-slate-600">
      <span className="rounded bg-slate-100 px-2 py-1">Profilmatch = hur väl ditt CV passar</span>
      <span className="rounded bg-slate-100 px-2 py-1">Önskemål = hur väl dina preferenser passar</span>
      <span className="rounded bg-slate-100 px-2 py-1">Slutbetyg = 0.7*profil + 0.3*önskemål (+ ev. remote boost)</span>
    </div>
  )
}

function CareerWishlistForm({ initial, onCancel, onSubmit, remoteBoost, setRemoteBoost }: { initial: Wish; onCancel: () => void; onSubmit: (wish: Wish) => void; remoteBoost: boolean; setRemoteBoost: (v: boolean) => void }) {
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
          <Label htmlFor="nearby" className="text-xs">Inkludera närliggande storstadsområde</Label>
        </div>

        <div className="mt-2 flex items-center gap-2 text-xs text-slate-600">
          <input id="remoteboost" type="checkbox" className="accent-blue-600" checked={remoteBoost} onChange={(e) => setRemoteBoost(e.target.checked)} />
          <Label htmlFor="remoteboost" className="text-xs">Prioritera fjärr-/hybridjobb (+0.05)</Label>
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
  const [selectedPackage, setSelectedPackage] = useState<{name: string, amount: number, description: string} | null>(null)
  const [showCalendarModal, setShowCalendarModal] = useState(false)

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
    
    if (!geo) return setError("Okänd stad. Prova t.ex. Stockholm, Uppsala eller Göteborg.")

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
            setError(data?.error || "Din profil verkar saknas eller vara ofullständig. Kontrollera 'Min profil'.")
          } else {
            setError(data?.error || "Kunde inte hämta matchningar.")
          }
          setJobs([])
          return
        }

        const jobResults = data?.jobs || []
        setJobs(jobResults)
        setFreeJobsShown(Math.min(jobResults.length, jobLimit))
      } catch (e) {
        console.error(e)
        setError("Ett fel uppstod vid matchning.")
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
          setError(data?.error || "Kunde inte hämta matchningar.")
          setJobs([])
          return
        }
        const jobResults = data?.jobs || []
        setJobs(jobResults)
        setFreeJobsShown(Math.min(jobResults.length, jobLimit))
      } catch (e) {
        console.error(e)
        setError("Kunde inte hämta matchningar.")
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
        setError(data?.error || "Kunde inte förfina matchningarna.")
        return
      }
      setJobs(data?.jobs || [])
    } catch (e) {
      console.error(e)
      setError("Kunde inte förfina matchningarna.")
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
      setError("Endast .txt och .pdf filer stöds.")
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
        if (!response.ok) throw new Error("Misslyckades att läsa PDF på servern.")
        const data = await response.json()
        setCvText(data.text || "")
      }
    } catch (err) {
      console.error("file read error", err)
      setError("Kunde inte läsa filen.")
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
  const initiateBooking = (pkg: { name: string, amount: number, description: string }) => {
    if (!user) {
      const proceed = confirm("Du behöver vara inloggad för att boka. Vill du logga in nu?")
      if (proceed) router.push("/login")
      return
    }
    setSelectedPackage(pkg)
    setShowCalendarModal(true)
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
        alert("Kunde inte starta betalning: " + (json.error || "Okänt fel"))
      }
    } catch (e) {
      console.error(e)
      alert("Ett anslutningsfel uppstod.")
    }
  }

  return (
    <div className="min-h-screen bg-white">
      {/* === HERO === */}
      <section className="relative bg-gradient-to-br from-blue-50 via-white to-amber-50 py-20 lg:py-32">
        <div className="container mx-auto px-4">
          <div className="grid gap-12 lg:grid-cols-2 items-center">
            <div className="space-y-6">
              <h1 className="text-4xl lg:text-5xl font-bold text-slate-900 text-balance">
                Hitta jobben som andra missar.
              </h1>
              
              <p className="text-xl text-slate-700">
                Vår AI matchar inte bara nyckelord – den förstår din kompetens.
              </p>
              
              <p className="text-lg text-slate-600">
                Ladda upp ditt CV gratis, se din marknadsvärdering, och bli synlig för handplockade arbetsgivare.
              </p>
              
              <blockquote className="border-l-4 border-blue-600 pl-4 italic text-slate-700">
                "Inga falska löften. Bara ren data och smartare matchning."
              </blockquote>

              <div className="flex flex-wrap gap-4">
                <Button size="lg" className="bg-blue-600 hover:bg-blue-700" asChild>
                  <a href="#packages">🎯 Välj ditt paket</a>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <a href="#matcher">🔎 Matcha jobb nu</a>
                </Button>
              </div>
              
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <div className="flex">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" />
                  ))}
                </div>
                <span className="font-semibold">Högsta betyg</span>
                <span>från verifierade kandidater</span>
              </div>
            </div>
            <div className="flex justify-center lg:justify-end">
              <div className="relative">
                <div className="absolute inset-0 bg-blue-200 rounded-full blur-3xl opacity-20" />
                <Image src="/portrait.jpeg" alt="Nikola - CV Konsult" width={400} height={400} className="relative rounded-full shadow-2xl border-4 border-white object-cover aspect-square" priority />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* === JOB CATEGORIES === */}
      <JobCategoriesSection />

      {/* === PACKAGES === */}
      <section id="packages" className="py-20 bg-white">
        <div className="container mx-auto px-4">
          <div className="text-center space-y-4 mb-16">
            <h2 className="text-3xl lg:text-4xl font-bold text-slate-900">Välj ditt paket</h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">Välj paket och boka din tid direkt i kalendern.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {/* Premium */}
            <Card className="relative border-2 border-blue-600 shadow-xl">
              <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                <Badge className="bg-blue-600 text-white px-4 py-1"><Star className="h-3 w-3 mr-1 inline" /> Rekommenderas</Badge>
              </div>
              <CardHeader className="text-center pt-8">
                <CardTitle className="text-2xl">CV + Personligt Brev + Konsultation</CardTitle>
                <div className="mt-4"><span className="text-4xl font-bold">1300 kr</span></div>
                <CardDescription className="mt-2">Fullständigt paket med personlig coaching</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3 mb-6">
                  {["Professionellt CV","Personligt brev","45 min personlig konsultation","Jobbsökningsstrategier","Intervjuförberedelse","Personlig coaching","Leverans inom 7-10 dagar"].map((item) => (
                    <li key={item} className="flex items-start gap-2"><Check className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" /><span className="text-sm">{item}</span></li>
                  ))}
                </ul>
                <Button className="w-full bg-blue-600 hover:bg-blue-700" size="lg" 
                  onClick={() => initiateBooking({ name: "CV + Personligt Brev + Konsultation", amount: 1300, description: "Fullständigt paket med coaching" })}>
                  Välj & Boka
                </Button>
              </CardContent>
            </Card>

            {/* Standard */}
            <Card className="border-2">
              <CardHeader className="text-center">
                <CardTitle className="text-2xl">CV + Personligt Brev</CardTitle>
                <div className="mt-4"><span className="text-4xl font-bold">1000 kr</span></div>
                <CardDescription className="mt-2">Ett paket med CV och skräddarsytt personligt brev</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3 mb-6">
                  {["Professionellt CV","Skräddarsytt personligt brev","Matchat till specifik tjänst","Leverans inom 5-7 dagar"].map((item) => (
                    <li key={item} className="flex items-start gap-2"><Check className="h-5 w-5 text-slate-600 shrink-0 mt-0.5" /><span className="text-sm">{item}</span></li>
                  ))}
                </ul>
                <Button className="w-full" variant="outline" size="lg" 
                  onClick={() => initiateBooking({ name: "CV + Personligt Brev", amount: 1000, description: "CV och brev matchat mot tjänst" })}>
                  Välj & Boka
                </Button>
              </CardContent>
            </Card>

            {/* Basic */}
            <Card className="border-2">
              <CardHeader className="text-center">
                <CardTitle className="text-2xl">CV</CardTitle>
                <div className="mt-4"><span className="text-4xl font-bold">750 kr</span></div>
                <CardDescription className="mt-2">Professionellt skrivet CV</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3 mb-6">
                  {["Skräddarsytt CV","Professionell layout","ATS-optimerat","Leverans inom 3-5 dagar"].map((item) => (
                    <li key={item} className="flex items-start gap-2"><Check className="h-5 w-5 text-slate-600 shrink-0 mt-0.5" /><span className="text-sm">{item}</span></li>
                  ))}
                </ul>
                <Button className="w-full" variant="outline" size="lg" 
                  onClick={() => initiateBooking({ name: "CV", amount: 750, description: "Professionellt CV" })}>
                  Välj & Boka
                </Button>
              </CardContent>
            </Card>
          </div>

          {!user && (
            <p className="mt-6 text-center text-sm text-slate-600">Inte registrerad än? <Link href="/login" className="text-blue-700 hover:underline inline-flex items-center gap-1"><LogIn className="h-4 w-4" /> Skapa konto eller logga in</Link> för att slutföra köp.</p>
          )}
        </div>
      </section>

      {/* === MATCHER === */}
      <section id="matcher" className="py-20 bg-slate-50">
        <div className="container mx-auto px-4">
          <div className="text-center space-y-4 mb-12">
            <h2 className="text-3xl lg:text-4xl font-bold text-slate-900">Hitta jobb som matchar dig</h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">AI‑driven matchning mot ditt CV och dina önskemål.</p>
          </div>

          <div className="max-w-5xl mx-auto">
            <Card className="border-2 border-blue-100">
              <CardHeader className="bg-gradient-to-r from-blue-50 to-amber-50">
                <CardTitle className="flex items-center gap-2"><Wand2 className="h-6 w-6 text-blue-600" /> Steg 1: Lägg in ditt CV och plats</CardTitle>
                <CardDescription>Vi analyserar ditt CV och visar direkt roller du är kvalificerad för</CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                {user ? (
                  <div className="space-y-6">
                    <p className="text-slate-600">Välkommen tillbaka! Ditt CV och dina preferenser kan sparas på ditt konto.</p>
                    <div className="grid gap-6 md:grid-cols-2">
                      <div>
                        <Label htmlFor="city">Stad / Postort</Label>
                        <div className="mt-2 flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-blue-600" />
                          <Input id="city" placeholder="t.ex. Uppsala" value={city} onChange={(e) => setCity(e.target.value)} />
                        </div>
                        <p className="mt-1 text-xs text-slate-500">Uppsala/Bålsta räknas mot Stockholmsområdet om du vill.</p>
                      </div>
                      <div>
                        <Label htmlFor="radius">Pendlingsradie (km)</Label>
                        <Input 
                          id="radius" 
                          type="number" 
                          min={5} 
                          max={100} 
                          value={radiusKm} 
                          onChange={(e) => setRadiusKm(Number(e.target.value || 0))} 
                          className="mt-2" 
                          disabled={isCountryWide}
                        />
                      </div>
                    </div>
                    
                    <div className="rounded-md bg-blue-50 p-4 mt-4 border border-blue-100">
                      <div className="flex items-center gap-3">
                         <FileText className="h-5 w-5 text-blue-600" />
                         <div>
                            <p className="text-sm font-medium text-blue-900">Ditt profil-CV används för matchning</p>
                            <p className="text-xs text-blue-700">Vill du ändra ditt CV? Gå till <Link href="/profile" className="underline font-semibold hover:text-blue-900">Min Profil</Link>.</p>
                         </div>
                      </div>
                    </div>
                    
                    <div className="flex flex-col sm:flex-row gap-3 mt-4">
                      <Button className="flex-1 bg-blue-600 hover:bg-blue-700" onClick={onFindMatches} disabled={loading}>{loading ? "Söker…" : "🔎 Hitta matchningar"}</Button>
                      <Button variant="outline" className="flex-1 bg-transparent" onClick={() => setShowWishlist(true)}><Wand2 className="h-4 w-4 mr-2" /> Förfina med önskemål</Button>
                      <Button variant="outline" className="flex-1" asChild>
                        <Link href="/profile"><User className="h-4 w-4 mr-2" /> Till min profil</Link>
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="grid gap-6 md:grid-cols-2">
                      <div>
                        <Label htmlFor="city">Stad / Postort</Label>
                        <div className="mt-2 flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-blue-600" />
                          <Input id="city" placeholder="t.ex. Uppsala" value={city} onChange={(e) => setCity(e.target.value)} />
                        </div>
                        <p className="mt-1 text-xs text-slate-500">Uppsala/Bålsta räknas mot Stockholmsområdet om du vill.</p>
                      </div>
                      <div>
                        <Label htmlFor="radius">Pendlingsradie (km)</Label>
                        <Input 
                          id="radius" 
                          type="number" 
                          min={5} 
                          max={100} 
                          value={radiusKm} 
                          onChange={(e) => setRadiusKm(Number(e.target.value || 0))} 
                          className="mt-2" 
                          disabled={isCountryWide}
                        />
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="cvtext">Ditt CV</Label>
                      <Textarea id="cvtext" rows={6} className="mt-2 resize-none" placeholder="Klistra in ditt CV här (text) eller ladda upp en fil nedan..." value={cvText} onChange={(e) => setCvText(e.target.value)} />
                      <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                        <Upload className="h-3.5 w-3.5" /> Du kan även ladda upp PDF eller .txt:
                        <Input type="file" accept=".txt,.pdf" onChange={handleFileUpload} className="max-w-[240px]" />
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3">
                      <Button className="flex-1 bg-blue-600 hover:bg-blue-700" onClick={onFindMatches} disabled={loading}>{loading ? "Söker…" : "🔎 Hitta matchningar"}</Button>
                      <Button variant="outline" className="flex-1 bg-transparent" onClick={() => setShowWishlist(true)}><Wand2 className="h-4 w-4 mr-2" /> Förfina med önskemål</Button>
                      <Button variant="outline" asChild className="flex-1">
                        <Link href="/login"><LogIn className="h-4 w-4 mr-2" /> Registrera dig för att spara</Link>
                      </Button>
                    </div>
                  </div>
                )}

                {error && <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">{error}</div>}
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* === RESULTS === */}
      <section className="container mx-auto px-4 pb-10">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-2xl font-semibold">Dina matchningar</h3>
          <div className="flex items-center gap-4">
            {jobs.length > 0 && (
              <div className="flex items-center gap-2 rounded-lg border bg-white p-1">
                <button onClick={() => setViewMode('list')} className={`flex items-center gap-2 px-3 py-2 rounded text-sm transition-colors ${viewMode === 'list' ? 'bg-blue-100 text-blue-700 font-medium' : 'text-gray-600 hover:text-gray-900'}`}>
                  <Eye className="h-4 w-4" /> Lista
                </button>
                <button onClick={() => setViewMode('map')} className={`flex items-center gap-2 px-3 py-2 rounded text-sm transition-colors ${viewMode === 'map' ? 'bg-blue-100 text-blue-700 font-medium' : 'text-gray-600 hover:text-gray-900'}`}>
                  <MapPin className="h-4 w-4" /> Karta
                </button>
              </div>
            )}
            {jobs.length > 0 && <span className="text-sm text-slate-500">{jobs.length} jobb</span>}
          </div>
        </div>

        <ScoreLegend />

        {jobs.length === 0 ? (
          <p className="text-slate-600">Inga resultat ännu. Sök först, eller justera plats/CV.</p>
        ) : viewMode === 'map' ? (
          <InteractiveJobMap onLocationChange={handleMapLocationChange} initialCenter={cityToGeo(city) ? { lat: cityToGeo(city)!.lat, lon: cityToGeo(city)!.lon } : undefined} initialRadius={radiusKm} />
        ) : (
          <>
            {jobs.length > jobLimit && (
              <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
                <div className="flex items-start gap-3">
                  <Lock className="h-5 w-5 text-amber-600 mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-amber-800">Visar {jobLimit} av {jobs.length} jobb gratis</h4>
                  </div>
                </div>
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              {jobs.slice(0, freeJobsShown).map((j) => (
                <Card key={j.id} className="hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <CardTitle className="text-lg">{j.headline}</CardTitle>
                        <CardDescription className="mt-1 flex items-center gap-2"><MapPin className="h-4 w-4 text-slate-500" /> {j.location ?? "—"}</CardDescription>
                      </div>
                      <Badge variant="outline">{j.work_modality ?? "—"}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between"><span className="text-slate-600">Profilmatch:</span><span className="font-medium">{pct(j.s_profile)}</span></div>
                      {j.s_wish != null && (
                        <div className="flex justify-between"><span className="text-slate-600">Önskemål:</span><span className="font-medium">{pct(j.s_wish)}</span></div>
                      )}
                      <div className="flex justify-between pt-2 border-t"><span className="text-slate-600 font-semibold">Slutbetyg:</span><span className="text-xl font-bold text-blue-700">{pct(j.final_score ?? j.s_profile)}</span></div>
                    </div>
                    <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
                      <span>
                        {j.company_size === "small" ? "Litet företag" : j.company_size === "medium" ? "Medelstort företag" : j.company_size === "large" ? "Stort företag" : "—"}
                      </span>
                      {j.job_url || j.webpage_url ? (
                        <a href={j.job_url || j.webpage_url || "#"} target="_blank" rel="noopener noreferrer" className="text-blue-700 hover:underline font-medium">Öppna annons →</a>
                      ) : (
                        <span className="text-slate-400">Ingen länk</span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
             
             {freeJobsShown > 0 && (
              <div className="mt-8 rounded-lg border border-blue-200 bg-blue-50 p-6">
                <h4 className="text-lg font-semibold text-blue-900 mb-2">Vill du ha hjälp att sticka ut?</h4>
                <p className="text-sm text-blue-800 mb-4">Jag hjälper dig att skapa ett CV och personligt brev som får dig till intervju. Boka en konsultation eller välj ett paket.</p>
                <div className="flex flex-wrap gap-3">
                  <Button className="bg-blue-600 hover:bg-blue-700" asChild>
                    <a href="#packages">📋 Se paket & priser</a>
                  </Button>
                  <Button variant="outline" asChild>
                    <a href="#contact">📞 Boka gratis konsultation</a>
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      <section id="about" className="py-20 bg-slate-50">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center space-y-8">
            <h2 className="text-3xl lg:text-4xl font-bold text-slate-900">Varför välja mig?</h2>
            <div className="grid md:grid-cols-3 gap-8 mt-12">
              <div className="text-center space-y-4">
                <div className="bg-blue-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto">
                  <BrainCircuit className="h-8 w-8 text-blue-600" />
                </div>
                <h3 className="text-xl font-semibold">Smart AI-Matchning</h3>
                <p className="text-slate-600">
                  Systemet förstår innebörden i ditt CV – inte bara nyckelord. Vi matchar din unika profil semantiskt mot tusentals annonser för att hitta dolda möjligheter.
                </p>
              </div>
              <div className="text-center space-y-4">
                <div className="bg-blue-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto"><FileText className="h-8 w-8 text-blue-600" /></div>
                <h3 className="text-xl font-semibold">Svenska & Engelska</h3>
                <p className="text-slate-600">Alla tjänster levereras på svenska som standard, med möjlighet till engelska vid behov.</p>
              </div>
              <div className="text-center space-y-4">
                <div className="bg-blue-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto"><Award className="h-8 w-8 text-blue-600" /></div>
                <h3 className="text-xl font-semibold">Personlig Coaching</h3>
                <p className="text-slate-600">Fokus på verktyg och strategier som fungerar långsiktigt – inte bara en engångstext.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 bg-white">
        <div className="container mx-auto px-4">
          <div className="text-center space-y-4 mb-16">
            <h2 className="text-3xl lg:text-4xl font-bold text-slate-900">Vanliga frågor</h2>
          </div>
          <div className="max-w-3xl mx-auto">
            <Accordion type="single" collapsible>
              <AccordionItem value="item-1">
                <AccordionTrigger>Vad ingår i konsultationen?</AccordionTrigger>
                <AccordionContent>Konsultationen är ett 45‑minuters personligt möte (video eller telefon) där vi går igenom din karriär, diskuterar dina mål, och skapar en konkret jobbsökningsstrategi.</AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-2">
                <AccordionTrigger>Hur lång tid tar leverans?</AccordionTrigger>
                <AccordionContent>CV inom 3‑5 dagar, CV + Brev 5‑7 dagar, paket med konsultation 7‑10 dagar.</AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-3">
                <AccordionTrigger>Kan jag få dokument på engelska?</AccordionTrigger>
                <AccordionContent>Ja, alla tjänster kan levereras på svenska eller engelska.</AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        </div>
      </section>

      <footer id="contact" className="bg-slate-900 text-white py-16">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-3 gap-8">
            <div>
              <h3 className="text-xl font-bold mb-4">Kontakta Nikola</h3>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Mail className="h-5 w-5" />
                  <span>info@jobbnu.se</span>
                </div>
                <div className="flex items-center gap-3">
                  <MessageSquareText className="h-5 w-5" />
                  <span>076-173 34 73 (Endast SMS)</span>
                </div>
              </div>
            </div>
            <div>
              <h3 className="text-xl font-bold mb-4">Snabbkontakt</h3>
              <ContactForm />
            </div>
            <div>
              <h3 className="text-xl font-bold mb-4">Tjänster</h3>
              <div className="space-y-2 text-slate-300">
                <p>Professionell CV‑skrivning</p>
                <p>Personliga brev</p>
                <p>Jobbkonsultation & coaching</p>
                <p>Intervjuförberedelse</p>
                <p>Jobbsökningsstrategier</p>
                <p>AI‑driven jobbmatchning</p>
              </div>
            </div>
          </div>
          <div className="border-t border-slate-700 mt-12 pt-8 text-center text-slate-400">
            <p>&copy; 2025 Nikola - CV & Jobbkonsultation. Alla rättigheter förbehållna.</p>
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
              <h2 className="text-2xl font-bold text-slate-900">Boka tid för {selectedPackage.name}</h2>
              <p className="text-slate-600">Välj en tid som passar dig. Betalning sker i nästa steg.</p>
            </div>

            <BookingCalendar onSelectSlot={handleSlotSelected} />
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
