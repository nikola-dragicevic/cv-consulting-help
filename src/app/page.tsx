"use client"

import React, { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { Mail, Phone, FileText, Users, Award, Wand2, MapPin, Upload, X, Eye, Lock, User, LogIn } from "lucide-react"
import InteractiveJobMap from "@/components/ui/InteractiveJobMap"
import Image from "next/image"
import type { User as SupabaseUser } from '@supabase/supabase-js'
import { createClient } from "@supabase/supabase-js"

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

type InitMatchResponse = {
  jobs: JobRow[]
  explanation?: string
}

type RefineMatchResponse = {
  jobs: JobRow[]
  explanation?: string
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
   Tiny helpers
============================================================ */
function pct(n?: number | null) {
  if (n == null) return "—"
  const v = Math.max(0, Math.min(1, n))
  return `${Math.round(v * 100)}%`
}

// Simple local geocoder so we don’t depend on "@/lib/city-geo"
function cityToGeo(cityRaw: string):
  | { lat: number; lon: number; county_code: string }
  | undefined {
  const city = cityRaw.trim().toLowerCase()
  const table: Record<string, { lat: number; lon: number; county_code: string }> = {
    "stockholm": { lat: 59.3293, lon: 18.0686, county_code: "AB" },
    "uppsala": { lat: 59.8586, lon: 17.6389, county_code: "C" },
    "bålsta": { lat: 59.567, lon: 17.527, county_code: "C" },
    "goteborg": { lat: 57.7089, lon: 11.9746, county_code: "O" },
    "göteborg": { lat: 57.7089, lon: 11.9746, county_code: "O" },
    "malmo": { lat: 55.605, lon: 13.0038, county_code: "M" },
    "malmö": { lat: 55.605, lon: 13.0038, county_code: "M" },
  }
  return table[city]
}

/* ============================================================
   Small inline UI atoms used by the wishlist (chips input)
============================================================ */
function TagInput({
  value,
  onChange,
  placeholder,
}: {
  value: string[]
  onChange: (v: string[]) => void
  placeholder?: string
}) {
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
          <span
            key={`${tag}-${i}`}
            className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-3 py-1 text-sm text-blue-700"
          >
            {tag}
            <button
              type="button"
              className="ml-1 text-blue-700/70 hover:text-blue-900"
              onClick={() => onChange(value.filter((t) => t !== tag))}
            >
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

/* ============================================================
   Inline "ScoreLegend" + "DebugPanel" replacements
============================================================ */
function ScoreLegend() {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-slate-600">
      <span className="rounded bg-slate-100 px-2 py-1">Profilmatch = hur väl ditt CV passar</span>
      <span className="rounded bg-slate-100 px-2 py-1">Önskemål = hur väl dina preferenser passar</span>
      <span className="rounded bg-slate-100 px-2 py-1">Slutbetyg = 0.7*profil + 0.3*önskemål (+ ev. remote boost)</span>
    </div>
  )
}

function DebugPanel({
  profilePayload,
  wishPayload,
  jobs,
}: {
  profilePayload: any
  wishPayload: any
  jobs: JobRow[]
}) {
  return (
    <div className="mt-8 grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Debug: /match/init payload</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="max-h-64 overflow-auto text-xs">{JSON.stringify(profilePayload, null, 2)}</pre>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Debug: /match/refine payload</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="max-h-64 overflow-auto text-xs">{JSON.stringify(wishPayload, null, 2)}</pre>
        </CardContent>
      </Card>
      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle className="text-base">Debug: Jobs</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="max-h-64 overflow-auto text-xs">{JSON.stringify(jobs, null, 2)}</pre>
        </CardContent>
      </Card>
    </div>
  )
}

/* ============================================================
   Inline CareerWishlistForm (minimal)
============================================================ */
function CareerWishlistForm({
  initial,
  onCancel,
  onSubmit,
  remoteBoost,
  setRemoteBoost,
}: {
  initial: Wish
  onCancel: () => void
  onSubmit: (wish: Wish) => void
  remoteBoost: boolean
  setRemoteBoost: (v: boolean) => void
}) {
  const [titles, setTitles] = useState<string[]>(initial.titles ?? [])
  const [industries, setIndustries] = useState<string[]>(initial.industries ?? [])
  const [useSkills, setUseSkills] = useState<string[]>(initial.use_skills ?? [])
  const [learnSkills, setLearnSkills] = useState<string[]>(initial.learn_skills ?? [])
  const [companySize, setCompanySize] = useState<Wish["company_size"]>(initial.company_size ?? null)
  const [modality, setModality] = useState<Wish["modality"]>(initial.modality ?? null)
  const [includeNearbyMetro, setIncludeNearbyMetro] = useState<boolean>(initial.includeNearbyMetro ?? true)
  const [locationCity, setLocationCity] = useState<string>(initial.location_city ?? "")

  function submit() {
    onSubmit({
      titles,
      industries,
      use_skills: useSkills,
      learn_skills: learnSkills,
      company_size: companySize,
      modality,
      includeNearbyMetro,
      location_city: locationCity,
    })
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
                <button
                  key={s}
                  type="button"
                  onClick={() => setCompanySize(companySize === s ? null : s)}
                  className={`rounded border px-3 py-1 ${companySize === s ? "border-blue-600 text-blue-700" : "border-slate-300 text-slate-700"}`}
                >
                  {s}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setCompanySize(null)}
                className={`rounded border px-3 py-1 ${companySize === null ? "border-blue-600 text-blue-700" : "border-slate-300 text-slate-700"}`}
              >
                spelar ingen roll
              </button>
            </div>
          </div>
          <div>
            <Label>Arbetssätt</Label>
            <div className="mt-2 flex flex-wrap gap-2 text-sm">
              {(["onsite", "hybrid", "remote"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setModality(modality === m ? null : m)}
                  className={`rounded border px-3 py-1 ${modality === m ? "border-blue-600 text-blue-700" : "border-slate-300 text-slate-700"}`}
                >
                  {m}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setModality(null)}
                className={`rounded border px-3 py-1 ${modality === null ? "border-blue-600 text-blue-700" : "border-slate-300 text-slate-700"}`}
              >
                spelar ingen roll
              </button>
            </div>
          </div>
          <div>
            <Label>Plats</Label>
            <Input
              className="mt-2"
              placeholder="t.ex. Stockholm"
              value={locationCity}
              onChange={(e) => setLocationCity(e.target.value)}
            />
          </div>
        </div>

        <div className="mt-2 flex items-center gap-2 text-xs text-slate-600">
          <input
            id="nearby"
            type="checkbox"
            className="accent-blue-600"
            checked={includeNearbyMetro}
            onChange={(e) => setIncludeNearbyMetro(e.target.checked)}
          />
          <Label htmlFor="nearby" className="text-xs">
            Inkludera närliggande storstadsområde
          </Label>
        </div>

        <div className="mt-2 flex items-center gap-2 text-xs text-slate-600">
          <input
            id="remoteboost"
            type="checkbox"
            className="accent-blue-600"
            checked={remoteBoost}
            onChange={(e) => setRemoteBoost(e.target.checked)}
          />
          <Label htmlFor="remoteboost" className="text-xs">
            Prioritera fjärr-/hybridjobb (+0.05)
          </Label>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" onClick={onCancel}>
            Avbryt
          </Button>
          <Button onClick={submit}>Tillämpa önskemål</Button>
        </div>
      </CardContent>
    </Card>
  )
}

/* ============================================================
   Main Page Component
============================================================ */
export default function CVConsultationService() {
  // User state (Supabase session)
  const [user, setUser] = useState<SupabaseUser | null>(null);

  // Initialize Supabase client
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  // Check for user session on component mount
  useEffect(() => {
    const getSession = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        // @ts-ignore - data shape
        setUser(data?.session?.user ?? null);
      } catch (err) {
        console.warn("Could not get supabase session", err);
      }
    };
    getSession();
  }, []);

  // Job Matching state
  const [city, setCity] = useState("")
  const [cvText, setCvText] = useState("")
  const [radiusKm, setRadiusKm] = useState(40)
  const [jobs, setJobs] = useState<JobRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [debugOpen, setDebugOpen] = useState(false)
  const [lastInitPayload, setLastInitPayload] = useState<any>(null)
  const [lastRefinePayload, setLastRefinePayload] = useState<any>(null)
  const [remoteBoost, setRemoteBoost] = useState(false)
  const [showWishlist, setShowWishlist] = useState(false)
  const [includeNearbyMetro, setIncludeNearbyMetro] = useState(true)
  const [lastWish, setLastWish] = useState<Wish | null>(null)

  // Freemium model state
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list')
  const [freeJobsShown, setFreeJobsShown] = useState(0)
  const FREE_JOB_LIMIT = 10

  // Safe parse helper — reads text and returns JSON if possible, else exposes raw text as error
  async function safeParseResponse(res: Response) {
    const text = await res.text()
    try {
      return { data: text ? JSON.parse(text) : null, raw: text }
    } catch {
      // return the text as an error payload so UI can pick up server HTML/error messages
      return { data: { error: text }, raw: text }
    }
  }

  async function onFindMatches() {
    setError(null)

    if (!city.trim()) {
      setError("Ange en stad.")
      return
    }
    if (!cvText.trim()) {
      setError("Klistra in lite CV‑text.")
      return
    }

    const geo = cityToGeo(city)
    if (!geo) {
      setError("Okänd stad. Prova t.ex. Stockholm, Uppsala eller Göteborg.")
      return
    }

    const payload = {
      city,
      lat: geo.lat ?? 0,
      lon: geo.lon ?? 0,
      county_code: geo.county_code ?? null,
      radius_km: radiusKm,
      cv_text: cvText,
    }

    try {
      setLoading(true)
      setLastInitPayload(payload)
      const res = await fetch("/api/match/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      const { data, raw } = await safeParseResponse(res)

      if (!res.ok) {
        console.error("Init fetch failed, raw response:", raw)
        setError(data?.error || "Kunde inte hämta matchningar.")
        setJobs([])
        return
      }

      const jobResults = data?.jobs || []
      setJobs(jobResults)
      setFreeJobsShown(Math.min(jobResults.length, FREE_JOB_LIMIT))
    } catch (e) {
      console.error(e)
      setError("Kunde inte hämta matchningar.")
    } finally {
      setLoading(false)
    }
  }

  async function handleRefineSubmit(wish: Wish) {
    const payload = { candidate_id: "demo-local", wish: { ...wish, remoteBoost } }

    try {
      setLoading(true)
      setLastRefinePayload(payload)
      const res = await fetch("/api/match/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      const { data, raw } = await safeParseResponse(res)

      if (!res.ok) {
        console.error("Refine fetch failed, raw response:", raw)
        setError(data?.error || "Kunde inte förfina matchningarna.")
        return
      }

      setJobs(data?.jobs || [])
      setShowWishlist(false)
      setLastWish(wish)
    } catch (e) {
      console.error(e)
      setError("Kunde inte förfina matchningarna.")
    } finally {
      setLoading(false)
    }
  }

  // File upload handler for CV files (.txt and .pdf)
  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    // Store a reference to the input element before any async operations
    const target = e.currentTarget;

    setError(null);
    setLoading(true); // show loading indicator
    const file = e.target.files?.[0];
    if (!file) {
      setLoading(false);
      return;
    }

    const fileName = file.name.toLowerCase();
    const isPdf = file.type === "application/pdf" || fileName.endsWith(".pdf");
    const isText = file.type === "text/plain" || fileName.endsWith(".txt");

    if (!isPdf && !isText) {
      setError("Endast .txt och .pdf filer stöds.");
      setLoading(false);
      if (target) target.value = ""; // clear file input
      return;
    }

    try {
      if (isText) {
        const text = await file.text();
        setCvText(text);
      } else if (isPdf) {
        const formData = new FormData();
        formData.append("file", file);

        const response = await fetch("/api/parse-pdf", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          throw new Error("Misslyckades att läsa PDF på servern.");
        }

        const data = await response.json();
        setCvText(data.text || "");
      }
    } catch (err) {
      console.error("file read error", err);
      setError("Kunde inte läsa filen.");
    } finally {
      setLoading(false);
      // Use the stored reference to safely clear the input
      if (target) {
        target.value = "";
      }
    }
  }

  // Map location change handler
  function handleMapLocationChange(lat: number, lon: number, radius: number) {
    setRadiusKm(radius)
    // Update search automatically when map location changes
    if (cvText.trim()) {
      onFindMatches()
    }
  }

  return (
    <div className="min-h-screen bg-white">
      {/* === Job Matcher Header === */}
      <section className="border-b bg-gradient-to-br from-slate-50 via-blue-50 to-amber-50">
        <div className="container mx-auto grid gap-8 px-4 py-10 lg:grid-cols-5 items-center">
          <div className="lg:col-span-3">
            <h1 className="text-3xl font-bold text-slate-900">Hitta jobb som matchar dig</h1>
            
            {/* CONDITIONAL UI: Show different content based on login state */}
            {user ? (
               // LOGGED-IN VIEW
              <div className="mt-6">
                <p className="text-slate-600 mb-4">Välkommen tillbaka! Ditt CV och dina preferenser är sparade. Klicka nedan för att se dina senaste matchningar.</p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Button className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700" onClick={onFindMatches} disabled={loading}>
                    {loading ? "Söker…" : "🔎 Hitta mina matchningar"}
                  </Button>
                  <Button variant="outline" className="w-full sm:w-auto" onClick={() => setShowWishlist(true)}>
                    <Wand2 className="h-4 w-4 mr-2"/> Förfina med önskemål
                  </Button>
                </div>
              </div>
            ) : (
              // LOGGED-OUT / ANONYMOUS VIEW
              <>
                <p className="mt-2 text-slate-600">
                  Steg 1: Välj plats och lägg in ditt CV. Vi visar direkt roller du är kvalificerad för.
                </p>
                <div className="mt-6 grid gap-4 sm:grid-cols-3">
                  <div className="sm:col-span-1">
                    <Label htmlFor="city">Stad / Postort</Label>
                    <div className="mt-1 flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-blue-600" />
                      <Input id="city" placeholder="t.ex. Uppsala" value={city} onChange={(e) => setCity(e.target.value)} />
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      Uppsala/Bålsta räknas mot Stockholmsområdet om du vill.
                    </p>
                  </div>
                  <div className="sm:col-span-2">
                    <Label htmlFor="cvtext">CV (klistra in text för test)</Label>
                    <Textarea
                      id="cvtext"
                      rows={4}
                      className="resize-none max-h-32 overflow-y-auto"
                      placeholder="Klistra in ditt CV här (text) — PDF-parsning kan kopplas senare"
                      value={cvText}
                      onChange={(e) => setCvText(e.target.value)}
                    />
                    <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                      <Upload className="h-3.5 w-3.5" /> Du kan även ladda upp PDF eller .txt:
                      <Input type="file" accept=".txt,.pdf" onChange={handleFileUpload} className="max-w-[240px]" />
                    </div>
                  </div>
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-3">
                  <div>
                    <Label htmlFor="radius">Pendlingsradie (km)</Label>
                    <Input
                      id="radius"
                      type="number"
                      min={5}
                      max={100}
                      value={radiusKm}
                      onChange={(e) => setRadiusKm(Number(e.target.value || 0))}
                    />
                  </div>
                  <div className="flex items-end gap-3">
                    <Button className="w-full bg-blue-600 hover:bg-blue-700" onClick={onFindMatches} disabled={loading}>
                      {loading ? "Söker…" : "🔎 Hitta matchningar"}
                    </Button>
                  </div>
                  <div className="flex items-end gap-3">
                    <Button variant="outline" className="w-full" onClick={() => setDebugOpen((v) => !v)}>
                      {debugOpen ? "Dölj debug" : "Visa debug"}
                    </Button>
                  </div>
                </div>
              </>
            )}

            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          </div>

          {/* YOUR PORTRAIT */}
          <div className="lg:col-span-2 flex justify-center lg:justify-end">
            <Image
              src="/portrait.jpeg"
              alt="Nikola Dragicevic"
              width={300}
              height={300}
              className="rounded-full shadow-lg border-4 border-white object-cover aspect-square"
              priority
            />
          </div>
        </div>
      </section>

      {/* Results */}
      <section className="container mx-auto px-4 py-10">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-2xl font-semibold">Matchningar</h2>
          <div className="flex items-center gap-4">
            {jobs.length > 0 && (
              <div className="flex items-center gap-2 rounded-lg border bg-white p-1">
                <button
                  onClick={() => setViewMode('list')}
                  className={`flex items-center gap-2 px-3 py-2 rounded text-sm transition-colors ${
                    viewMode === 'list'
                      ? 'bg-blue-100 text-blue-700 font-medium'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <Eye className="h-4 w-4" />
                  Lista
                </button>
                <button
                  onClick={() => setViewMode('map')}
                  className={`flex items-center gap-2 px-3 py-2 rounded text-sm transition-colors ${
                    viewMode === 'map'
                      ? 'bg-blue-100 text-blue-700 font-medium'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <MapPin className="h-4 w-4" />
                  Karta
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
          <InteractiveJobMap
            onLocationChange={handleMapLocationChange}
            initialCenter={cityToGeo(city) ? { lat: cityToGeo(city)!.lat, lon: cityToGeo(city)!.lon } : undefined}
            initialRadius={radiusKm}
          />
        ) : (
          <>
            {/* Freemium Notice */}
            {jobs.length > FREE_JOB_LIMIT && (
              <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
                <div className="flex items-start gap-3">
                  <Lock className="h-5 w-5 text-amber-600 mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-amber-800">Visar {FREE_JOB_LIMIT} av {jobs.length} jobb gratis</h3>
                    <p className="text-sm text-amber-700 mt-1">
                      Få tillgång till alla {jobs.length} jobb + jobbvarningar via e-post genom att prenumerera.
                    </p>
                    <Button className="mt-3 bg-amber-600 hover:bg-amber-700 text-white">
                      Prenumerera för fler jobb →
                    </Button>
                  </div>
                </div>
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              {jobs.slice(0, freeJobsShown).map((j) => (
  <Card key={j.id} className="hover:shadow-md">
    <CardHeader>
      <div className="flex items-start justify-between gap-4">
        <div>
          <CardTitle className="text-lg">{j.headline}</CardTitle>
          <CardDescription className="mt-1 flex items-center gap-2">
            <MapPin className="h-4 w-4 text-slate-500" /> {j.location ?? "—"}
          </CardDescription>
        </div>
        <Badge variant="outline">{j.work_modality ?? "—"}</Badge>
      </div>
    </CardHeader>
    <CardContent className="flex items-center justify-between text-sm text-slate-700">
      <div className="space-y-1">
        <div>
          Profilmatch: <span className="font-medium">{pct(j.s_profile)}</span>
        </div>
        {j.s_wish != null && (
          <div>
            Önskemål: <span className="font-medium">{pct(j.s_wish)}</span>
            {/* --- Merged localized section below --- */}
            <div className="mt-3 flex items-center justify-between">
              <div className="text-xs text-slate-500">
                {j.company_size
                  ? j.company_size === "small"
                    ? "Litet företag"
                    : j.company_size === "medium"
                    ? "Medelstort företag"
                    : j.company_size === "large"
                    ? "Stort företag"
                    : j.company_size
                  : "—"}{" "}
                •{" "}
                {j.work_modality
                  ? j.work_modality === "onsite"
                    ? "På plats"
                    : j.work_modality === "hybrid"
                    ? "Hybrid"
                    : j.work_modality === "remote"
                    ? "Fjärr"
                    : j.work_modality
                  : "—"}
              </div>

              {(j.job_url || j.webpage_url) ? (
                <a
                  href={j.job_url || j.webpage_url || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-700 hover:underline"
                >
                  Öppna annons →
                </a>
              ) : (
                <span className="text-sm text-slate-400">Ingen länk</span>
              )}
            </div>
            {/* --- End merged section --- */}
          </div>
        )}
      </div>
      <div className="text-right">
        <div className="text-xs text-slate-500">Slutbetyg</div>
        <div className="text-xl font-bold text-blue-700">{pct(j.final_score)}</div>

        {(j.job_url || j.webpage_url) ? (
          <a
            href={j.job_url || j.webpage_url || '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block text-sm text-blue-700 hover:underline"
          >
            Öppna annons →
          </a>
        ) : (
          <span className="mt-2 inline-block text-sm text-slate-400">Ingen länk</span>
        )}
      </div>
    </CardContent>
  </Card>
))}
            </div>

            {/* GDPR Notice */}
            {freeJobsShown > 0 && (
              <div className="mt-8 rounded-lg border border-gray-200 bg-gray-50 p-4">
                <p className="text-sm text-gray-700">
                  🔒 <strong>Integritet:</strong> Ditt CV lagras säkert för att förbättra våra matchningar.
                  Vi delar aldrig dina uppgifter utan ditt medgivande.
                  <a href="/privacy" className="text-blue-600 hover:underline ml-1">Läs mer om integritet →</a>
                </p>
                <div className="mt-3 flex gap-3">
                  <Button className="bg-blue-600 hover:bg-blue-700">
                    📧 Prenumerera på jobbvarningar
                  </Button>
                  <Button variant="outline">
                    📞 Boka gratis CV-konsultation
                  </Button>
                </div>
              </div>
            )}
          </>
        )}

        {debugOpen && (
          <DebugPanel profilePayload={lastInitPayload} wishPayload={lastRefinePayload} jobs={jobs} />
        )}
      </section>

      {/* --- Marketing sections (unchanged) --- */}
      <section id="about" className="py-20 bg-white">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center space-y-8">
            <h2 className="text-3xl lg:text-4xl font-bold text-slate-900">Varför välja mig?</h2>
            <div className="grid md:grid-cols-3 gap-8 mt-12">
              <div className="text-center space-y-4">
                <div className="bg-blue-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto">
                  <Users className="h-8 w-8 text-blue-600" />
                </div>
                <h3 className="text-xl font-semibold">50+ Nöjda Kunder</h3>
                <p className="text-slate-600">
                  Jag har hjälpt över 50 personer att landa sina drömjobb med personlig coaching och skräddarsydda ansökningar.
                </p>
              </div>
              <div className="text-center space-y-4">
                <div className="bg-blue-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto">
                  <FileText className="h-8 w-8 text-blue-600" />
                </div>
                <h3 className="text-xl font-semibold">Svenska & Engelska</h3>
                <p className="text-slate-600">
                  Alla tjänster levereras på svenska som standard, med möjlighet till engelska vid behov. Anpassat för den svenska arbetsmarknaden.
                </p>
              </div>
              <div className="text-center space-y-4">
                <div className="bg-blue-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto">
                  <Award className="h-8 w-8 text-blue-600" />
                </div>
                <h3 className="text-xl font-semibold">Personlig Coaching</h3>
                <p className="text-slate-600">
                  Mitt fokus ligger på att ge dig verktyg och strategier som fungerar långsiktigt, inte bara en engångstext.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ + Footer */}
      <section className="py-20 bg-slate-50">
        <div className="container mx-auto px-4">
          <div className="text-center space-y-4 mb-16">
            <h2 className="text-3xl lg:text-4xl font-bold text-slate-900">Vanliga frågor</h2>
          </div>
          <div className="max-w-3xl mx-auto">
            <Accordion type="single" collapsible>
              <AccordionItem value="item-1">
                <AccordionTrigger>Vad ingår i konsultationen?</AccordionTrigger>
                <AccordionContent>
                  Konsultationen är ett 60-minuters personligt möte (video eller telefon) där vi går igenom din karriär, diskuterar dina mål, och skapar en konkret jobbsökningsstrategi.
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        </div>
      </section>

      <footer className="bg-slate-900 text-white py-16">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-3 gap-8">
            <div>
              <h3 className="text-xl font-bold mb-4">Kontakta Nikola</h3>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Mail className="h-5 w-5" />
                  <span>nikola@cvhjälp.se</span>
                </div>
                <div className="flex items-center gap-3">
                  <Phone className="h-5 w-5" />
                  <span>070-123 45 67</span>
                </div>
              </div>
            </div>
            <div>
              <h3 className="text-xl font-bold mb-4">Snabbkontakt</h3>
              <div className="space-y-3">
                <Input placeholder="Din e-post" className="bg-slate-800 border-slate-700" />
                <Textarea placeholder="Ditt meddelande" className="bg-slate-800 border-slate-700" rows={3} />
                <Button className="bg-blue-600 hover:bg-blue-700">Skicka meddelande</Button>
              </div>
            </div>
            <div>
              <h3 className="text-xl font-bold mb-4">Tjänster</h3>
              <div className="space-y-2 text-slate-300">
                <p>Professionell CV-skrivning</p>
                <p>Personliga brev</p>
                <p>Jobbkonsultation & coaching</p>
                <p>Intervjuförberedelse</p>
                <p>Jobbsökningsstrategier</p>
              </div>
            </div>
          </div>
          <div className="border-t border-slate-700 mt-12 pt-8 text-center text-slate-400">
            <p>&copy; 2025 Nikola - CV & Jobbkonsultation. Alla rättigheter förbehållna.</p>
          </div>
        </div>
      </footer>

      {/* Wishlist overlay */}
      {showWishlist && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <CareerWishlistForm
            initial={{
              titles: [],
              use_skills: [],
              learn_skills: [],
              industries: [],
              company_size: null,
              modality: null,
              pace: null,
              structure: null,
              collaboration: null,
              includeNearbyMetro: true,
              location_city: city,
            }}
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
