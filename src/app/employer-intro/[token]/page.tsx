"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type IntroSlot = {
  id: string
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
  } | null
  candidate: {
    full_name: string | null
    city: string | null
    search_keywords: string[] | null
    experience_titles: string[] | null
    education_titles: string[] | null
    seniority_reason: string | null
    experience_summary: string | null
    skills_text: string | null
  } | null
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
  const skillLines = useMemo(() => {
    const raw = data?.candidate?.skills_text || ""
    return raw
      .split(/[,\n]/)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 8)
  }, [data])

  async function handleAcceptTerms() {
    setSubmittingAcceptance(true)
    setError("")
    try {
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
      const res = await fetch(`/api/employer-intro/${token}/book`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slotId: selectedSlotId,
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
          Kandidatintroduktion for {data?.savedJob?.company || "arbetsgivare"}
        </h1>
        <p className="mt-2 text-slate-600">
          JobbNu presenterar en kandidat för rollen {data?.savedJob?.headline || "den aktuella tjänsten"}.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle>{data?.savedJob?.candidate_label || data?.candidate?.full_name || "Kandidaten"}</CardTitle>
            <CardDescription>
              {data?.candidate?.city || data?.savedJob?.city || ""}{" "}
              {typeof data?.savedJob?.distance_km === "number" ? `• ${data.savedJob.distance_km.toFixed(1)} km från tjänsten` : ""}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Varfor kandidaten ar relevant</h2>
              <p className="mt-2 text-sm text-slate-700">
                {data?.candidate?.experience_summary ||
                  "Kandidaten har relevant erfarenhet, tydlig rollmatch och bakgrund som passar tjänsten."}
              </p>
            </section>

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

            {data?.candidate?.search_keywords?.length ? (
              <section>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Match mot rollen</h2>
                <p className="mt-2 text-sm text-slate-700">
                  Kandidatens profil är särskilt relevant inom: {data.candidate.search_keywords.slice(0, 6).join(", ")}.
                  {data.savedJob?.occupation_group_label ? ` Rollen ligger inom ${data.savedJob.occupation_group_label}.` : ""}
                </p>
              </section>
            ) : null}

            {data?.candidate?.seniority_reason && (
              <section>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Erfarenhetsniva</h2>
                <p className="mt-2 text-sm text-slate-700">{data.candidate.seniority_reason}</p>
              </section>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Godkann villkor</CardTitle>
              <CardDescription>
                Genom att godkanna villkoren bekräftar ni att JobbNu introducerat kandidaten till er.
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
              <CardDescription>Valj en tid som kandidaten redan godkänt för intervju.</CardDescription>
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
