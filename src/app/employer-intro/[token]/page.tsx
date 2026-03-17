"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type IntroSlot = {
  id: string
  source_slot_id: string
  slot_date: string
  start_time: string
  end_time: string
}

type IntroData = {
  link: { id: string; termsVersion: string }
  savedJob: {
    candidate_label: string
    headline: string | null
    company: string | null
    city: string | null
    distance_km: number | null
    occupation_group_label: string | null
    search_keyword: string | null
    candidate_cv_text: string | null
    interview_analysis?: string | null
  } | null
  candidate: {
    full_name: string | null
    city: string | null
    category_tags: string[] | null
    search_keywords: string[] | null
    experience_titles: string[] | null
    education_titles: string[] | null
    seniority_reason: string | null
    experience_summary: string | null
    skills_text: string | null
  } | null
  analysis: {
    firstName: string
    fitLabel: "Perfekt match" | "Mycket bra match" | "Bra match"
    semanticSimilarity: number | null
    keywordHits: string[]
    keywordMisses: string[]
    matchedRequiredSkills: string[]
    matchedPreferredSkills: string[]
    whyFit: string[]
    taxonomyFit: boolean
    swedishProfileSummary: string
    swedishSenioritySummary: string
  }
  interviewerAnalysis: string | null
  slots: IntroSlot[]
  acceptance: {
    id: string
    company_name: string
    contact_name: string
    contact_email: string
    accepted_at: string
  } | null
}

export default function EmployerIntroPage() {
  const params = useParams<{ token: string }>()
  const token = typeof params?.token === "string" ? params.token : ""
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [data, setData] = useState<IntroData | null>(null)
  const [acceptanceId, setAcceptanceId] = useState("")
  const [selectedSlotId, setSelectedSlotId] = useState("")
  const [companyName, setCompanyName] = useState("")
  const [contactName, setContactName] = useState("")
  const [contactEmail, setContactEmail] = useState("")
  const [contactPhone, setContactPhone] = useState("")
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [submittingAcceptance, setSubmittingAcceptance] = useState(false)
  const [bookingLoading, setBookingLoading] = useState(false)
  const [successMessage, setSuccessMessage] = useState("")

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError("")
      try {
        const res = await fetch(`/api/employer-intro/${token}`)
        const json = await res.json()
        if (!res.ok) throw new Error(json?.error || "Could not load intro page")
        setData(json)
        if (json.acceptance?.id) {
          setAcceptanceId(json.acceptance.id)
          setCompanyName(json.acceptance.company_name || "")
          setContactName(json.acceptance.contact_name || "")
          setContactEmail(json.acceptance.contact_email || "")
          setAcceptedTerms(true)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error")
      } finally {
        setLoading(false)
      }
    }

    if (token) {
      void load()
    }
  }, [token])

  const experienceLines = useMemo(() => data?.candidate?.experience_titles?.slice(0, 4) || [], [data])
  const educationLines = useMemo(() => data?.candidate?.education_titles?.slice(0, 3) || [], [data])
  const skillLines = useMemo(() => {
    const raw = data?.candidate?.skills_text || ""
    return raw
      .split(/[,\n]/)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 8)
  }, [data])
  const headline = data?.savedJob?.headline || "den aktuella tjänsten"
  const company = data?.savedJob?.company || "arbetsgivaren"
  const fitToneClass =
    data?.analysis.fitLabel === "Perfekt match"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : data?.analysis.fitLabel === "Mycket bra match"
        ? "bg-blue-50 text-blue-700 border-blue-200"
        : "bg-amber-50 text-amber-700 border-amber-200"

  async function trackEvent(eventType: "accept_started" | "booking_started", metadata?: Record<string, unknown>) {
    try {
      await fetch(`/api/employer-intro/${token}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventType, metadata: metadata || {} }),
      })
    } catch {
      // Best effort only; analytics should not block the employer flow.
    }
  }

  async function handleAcceptTerms() {
    setSubmittingAcceptance(true)
    setError("")
    try {
      await trackEvent("accept_started", {
        hasCompanyName: Boolean(companyName.trim()),
        hasContactEmail: Boolean(contactEmail.trim()),
      })
      const res = await fetch(`/api/employer-intro/${token}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName,
          contactName,
          contactEmail,
          contactPhone,
          acceptedTerms,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || "Could not save acceptance")
      setAcceptanceId(json.data.id)
      setSuccessMessage("Villkoren är godkända. Du kan nu boka intervju.")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setSubmittingAcceptance(false)
    }
  }

  async function handleBook() {
    setBookingLoading(true)
    setError("")
    try {
      const selectedSlot = data?.slots.find((slot) => slot.id === selectedSlotId)
      if (!selectedSlot) {
        throw new Error("Välj en tid först.")
      }

      await trackEvent("booking_started", {
        selectedSlotId: selectedSlot.source_slot_id,
      })

      const res = await fetch(`/api/employer-intro/${token}/book`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slotId: selectedSlot.source_slot_id,
          startTime: selectedSlot.start_time,
          endTime: selectedSlot.end_time,
          acceptanceId,
          companyName,
          contactName,
          contactEmail,
          contactPhone,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || "Could not book slot")
      setSuccessMessage("Intervjun är bokad. JobbNu följer upp med kandidaten.")
      setSelectedSlotId("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setBookingLoading(false)
    }
  }

  if (loading) {
    return <div className="mx-auto max-w-4xl px-4 py-10">Laddar kandidatprofil...</div>
  }

  if (error && !data) {
    return <div className="mx-auto max-w-4xl px-4 py-10 text-red-600">{error}</div>
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold text-slate-900">
          Kandidatintroduktion för {company}
        </h1>
        <p className="mt-2 text-slate-600">
          Här ser ni varför {data?.analysis.firstName || "kandidaten"} kan vara relevant för rollen {headline}.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-3">
              <CardTitle>{data?.analysis.firstName || data?.savedJob?.candidate_label || data?.candidate?.full_name || "Kandidaten"}</CardTitle>
              <span className={`rounded-full border px-3 py-1 text-xs font-medium ${fitToneClass}`}>
                {data?.analysis.fitLabel || "Bra match"}
              </span>
            </div>
            <CardDescription>
              {data?.candidate?.city || data?.savedJob?.city || ""}{" "}
              {typeof data?.savedJob?.distance_km === "number" ? `• ${data.savedJob.distance_km.toFixed(1)} km från tjänsten` : ""}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Kort profil</h2>
              <p className="mt-2 text-sm text-slate-700">
                {data?.analysis?.swedishProfileSummary ||
                  "Kandidaten har relevant erfarenhet, tydlig rollmatch och bakgrund som passar tjänsten."}
              </p>
            </section>

            {data?.analysis?.whyFit?.length ? (
              <section>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Varför kandidaten kan passa er</h2>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
                  {data.analysis.whyFit.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              </section>
            ) : null}

            {data?.interviewerAnalysis ? (
              <section>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">JobbNu:s bedömning efter intervju</h2>
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{data.interviewerAnalysis}</p>
              </section>
            ) : null}

            {experienceLines.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Relevant erfarenhet</h2>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
                  {experienceLines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </section>
            )}

            {educationLines.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Utbildning</h2>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
                  {educationLines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </section>
            )}

            {skillLines.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Kompetenser</h2>
                <div className="mt-2 flex flex-wrap gap-2">
                  {skillLines.map((skill) => (
                    <span key={skill} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-700">
                      {skill}
                    </span>
                  ))}
                </div>
              </section>
            )}

            {data?.analysis?.keywordHits?.length || data?.analysis?.matchedRequiredSkills?.length || data?.analysis?.matchedPreferredSkills?.length ? (
              <section>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Match mot rollen</h2>
                <div className="mt-2 space-y-2 text-sm text-slate-700">
                  {data.analysis.keywordHits.length > 0 ? (
                    <p>
                      <span className="font-medium">Träffade nyckelord:</span> {data.analysis.keywordHits.join(", ")}
                    </p>
                  ) : null}
                  {data.analysis.matchedRequiredSkills.length > 0 ? (
                    <p>
                      <span className="font-medium">Matchade krav:</span> {data.analysis.matchedRequiredSkills.join(", ")}
                    </p>
                  ) : null}
                  {data.analysis.matchedPreferredSkills.length > 0 ? (
                    <p>
                      <span className="font-medium">Matchade meriterande kompetenser:</span>{" "}
                      {data.analysis.matchedPreferredSkills.join(", ")}
                    </p>
                  ) : null}
                  {data.savedJob?.occupation_group_label ? (
                    <p>
                      <span className="font-medium">Rollområde:</span> {data.savedJob.occupation_group_label}
                    </p>
                  ) : null}
                </div>
              </section>
            ) : null}

            {data?.candidate?.seniority_reason && (
              <section>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Erfarenhetsnivå</h2>
                <p className="mt-2 text-sm text-slate-700">{data.analysis.swedishSenioritySummary}</p>
              </section>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Godkänn villkor</CardTitle>
              <CardDescription>
                Genom att godkänna villkoren bekräftar ni att JobbNu introducerat kandidaten till er.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-slate-700">
                Om kandidaten anställs utgår en ersättning till JobbNu motsvarande 3% av kandidatens bruttolön under pågående anställning. Ersättningen upphör om anställningen avslutas.
              </p>
              <div className="space-y-2">
                <Label>Företag</Label>
                <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Kontaktperson</Label>
                <Input value={contactName} onChange={(e) => setContactName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>E-post</Label>
                <Input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Telefon (valfritt)</Label>
                <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
              </div>
              <label className="flex items-start gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={(e) => setAcceptedTerms(e.target.checked)}
                  className="mt-1"
                />
                Jag godkänner villkoren för kandidatintroduktion och ersättningsmodellen.
              </label>
              <Button
                onClick={() => void handleAcceptTerms()}
                disabled={submittingAcceptance || !companyName || !contactName || !contactEmail || !acceptedTerms}
                className="w-full"
              >
                {submittingAcceptance ? "Sparar..." : acceptanceId ? "Villkor godkända" : "Godkänn villkor"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Boka intervju</CardTitle>
              <CardDescription>Välj en 60-minutersintervju med 30 minuters startsteg inom kandidatens tillgängliga block.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {data?.slots?.length ? (
                <div className="space-y-2">
                  {data.slots.map((slot) => {
                    const label = `${slot.slot_date} ${slot.start_time.slice(0, 5)}-${slot.end_time.slice(0, 5)}`
                    return (
                      <label key={slot.id} className="flex items-center gap-2 rounded border border-slate-200 px-3 py-2 text-sm">
                        <input
                          type="radio"
                          name="slot"
                          value={slot.id}
                          checked={selectedSlotId === slot.id}
                          onChange={() => setSelectedSlotId(slot.id)}
                        />
                        {label}
                      </label>
                    )
                  })}
                </div>
              ) : (
                <p className="text-sm text-slate-500">Inga tider är upplagda ännu.</p>
              )}
              <Button
                onClick={() => void handleBook()}
                disabled={!acceptanceId || !selectedSlotId || bookingLoading}
                className="w-full"
              >
                {bookingLoading ? "Bokar..." : "Boka intervju"}
              </Button>
            </CardContent>
          </Card>

          {(successMessage || error) && (
            <Card>
              <CardContent className="py-4">
                {successMessage && <p className="text-sm text-emerald-700">{successMessage}</p>}
                {error && <p className="text-sm text-red-600">{error}</p>}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
