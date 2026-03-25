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
    webpage_url?: string | null
  } | null
  candidate: {
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
    fitLabel: "Perfekt match" | "Väldigt bra match"
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
  employerJudgment: {
    summary: string
    bullets: string[]
  }
  cvSections: {
    profile: string | null
    coreCompetencies: string[]
    detailedExperience: string[]
    experienceEntries: Array<{
      heading: string
      period: string | null
      bullets: string[]
    }>
    detailedEducation: string[]
    detailedCertifications: string[]
    detailedSkills: string[]
    references: string | null
    yearsExperience: number | null
  }
  interviewerAnalysis: string | null
  slots: IntroSlot[]
  acceptance: {
    id: string
    company_name: string
    contact_name: string
    contact_email: string
    contact_phone: string | null
    compensation_model: "monthly_percentage" | "one_time_offer"
    monthly_percentage: number | null
    one_time_fee_sek: number | null
    accepted_at: string
  } | null
  latestBooking: {
    id: string
    booking_date: string
    start_time: string
    end_time: string
    status: string
    meeting_link: string | null
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
  const [compensationModel, setCompensationModel] = useState<"monthly_percentage" | "one_time_offer">("one_time_offer")
  const [oneTimeFeeSek, setOneTimeFeeSek] = useState("")
  const [meetingLink, setMeetingLink] = useState("")
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [submittingAcceptance, setSubmittingAcceptance] = useState(false)
  const [bookingLoading, setBookingLoading] = useState(false)
  const [successMessage, setSuccessMessage] = useState("")
  const [interviewBooked, setInterviewBooked] = useState(false)
  const [savingMeetingLink, setSavingMeetingLink] = useState(false)

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
          setContactPhone(json.acceptance.contact_phone || "")
          setCompensationModel(json.acceptance.compensation_model || "one_time_offer")
          setOneTimeFeeSek(json.acceptance.one_time_fee_sek ? String(json.acceptance.one_time_fee_sek) : "")
          setAcceptedTerms(true)
        }
        if (json.latestBooking?.id) {
          setInterviewBooked(true)
          setMeetingLink(json.latestBooking.meeting_link || "")
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
  const company = data?.savedJob?.company || "arbetsgivaren"
  const detailedExperienceBlocks = data?.cvSections?.detailedExperience || []
  const experienceEntries = data?.cvSections?.experienceEntries || []
  const detailedEducationLines = data?.cvSections?.detailedEducation || []
  const detailedCertificationLines = data?.cvSections?.detailedCertifications || []
  const detailedSkillLines = data?.cvSections?.detailedSkills || skillLines
  const candidateTitle =
    experienceLines[0] || data?.savedJob?.occupation_group_label || null
  const fitToneClass =
    data?.analysis.fitLabel === "Perfekt match"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : "bg-green-50 text-green-700 border-green-200"

  // Step state
  const step1Done = Boolean(acceptanceId)
  const step2Done = interviewBooked || Boolean(data?.latestBooking?.id)

  async function trackEvent(eventType: "accept_started" | "booking_started", metadata?: Record<string, unknown>) {
    try {
      await fetch(`/api/employer-intro/${token}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventType, metadata: metadata || {} }),
      })
    } catch {
      // Best effort only
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
          compensationModel,
          oneTimeFeeSek,
          acceptedTerms,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || "Could not save acceptance")
      setAcceptanceId(json.data.id)
      setSuccessMessage("Villkoren är godkända. Välj en intervjutid nedan.")
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
          meetingLink,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || "Could not book slot")
      setInterviewBooked(true)
      setData((prev) => prev ? { ...prev, latestBooking: json.data || null } : prev)
      setSuccessMessage("Intervjun är bokad. JobbNu bekräftar med kandidaten och återkommer med detaljer.")
      setSelectedSlotId("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setBookingLoading(false)
    }
  }

  async function handleSaveMeetingLink() {
    setSavingMeetingLink(true)
    setError("")
    try {
      const res = await fetch(`/api/employer-intro/${token}/booking-link`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meetingLink }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || "Could not update meeting link")
      setData((prev) =>
        prev
          ? {
              ...prev,
              latestBooking: prev.latestBooking
                ? { ...prev.latestBooking, meeting_link: json.data?.meeting_link || null }
                : prev.latestBooking,
            }
          : prev
      )
      setSuccessMessage("Möteslänken är sparad.")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setSavingMeetingLink(false)
    }
  }

  if (loading) {
    return <div className="mx-auto max-w-4xl px-4 py-10 text-slate-500">Laddar kandidatprofil...</div>
  }

  if (error && !data) {
    return <div className="mx-auto max-w-4xl px-4 py-10 text-red-600">{error}</div>
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">

      {/* Page header */}
      <div className="mb-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">JobbNu · Kandidatintroduktion</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">
          Vi har en kandidat till er — {data?.savedJob?.headline || "tjänsten"}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Nedan hittar ni vår bedömning av kandidaten och vad som gör den relevant för {company}.
        </p>
      </div>

      {/* Step indicator */}
      <div className="mb-6 mt-5 flex items-center gap-0">
        {[
          { n: 1, label: "Granska profil", done: true },
          { n: 2, label: "Godkänn villkor", done: step1Done },
          { n: 3, label: "Boka intervju", done: step2Done },
        ].map((step, idx, arr) => (
          <div key={step.n} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                  step.done
                    ? "bg-emerald-600 text-white"
                    : "bg-slate-200 text-slate-500"
                }`}
              >
                {step.done ? "✓" : step.n}
              </div>
              <span className={`mt-1 text-xs ${step.done ? "font-medium text-emerald-700" : "text-slate-400"}`}>
                {step.label}
              </span>
            </div>
            {idx < arr.length - 1 && (
              <div className={`mx-2 mb-5 h-0.5 w-10 ${step.done ? "bg-emerald-400" : "bg-slate-200"}`} />
            )}
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">

        {/* Left: candidate profile */}
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-3">
              <CardTitle className="text-xl">
                {data?.analysis.firstName || "Kandidaten"}
              </CardTitle>
              <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${fitToneClass}`}>
                {data?.analysis.fitLabel || "Bra match"}
              </span>
            </div>
            <CardDescription>
              {candidateTitle ? `${candidateTitle} • ` : ""}
              {data?.candidate?.city || data?.savedJob?.city || ""}{" "}
              {typeof data?.savedJob?.distance_km === "number"
                ? `• ${data.savedJob.distance_km.toFixed(1)} km från tjänsten`
                : ""}
            </CardDescription>

            {/* Privacy note */}
            <div className="mt-2 rounded-md bg-slate-50 border border-slate-200 px-3 py-2 text-xs text-slate-500">
              Kandidatens fullständiga namn och kontaktuppgifter delas med er efter intervjubokning.
            </div>
          </CardHeader>

          <CardContent className="space-y-5">

            {/* JobbNu:s bedömning — primary judgment */}
            {data?.interviewerAnalysis ? (
              <section className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-4">
                <h2 className="text-xs font-bold uppercase tracking-wide text-emerald-700">
                  JobbNu:s bedömning efter intervju med kandidaten
                </h2>
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800 leading-relaxed">
                  {data.interviewerAnalysis}
                </p>
              </section>
            ) : (
              <section>
                <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  JobbNu:s bedömning
                </h2>
                <p className="mt-2 text-sm font-medium text-slate-900 leading-relaxed">
                  {data?.employerJudgment?.summary ||
                    `${data?.analysis.firstName || "Kandidaten"} bedöms vara en stark kandidat för rollen.`}
                </p>
                {data?.employerJudgment?.bullets?.length ? (
                  <ul className="mt-3 space-y-2 pl-0">
                    {data.employerJudgment.bullets.map((reason) => (
                      <li key={reason} className="flex items-start gap-2 text-sm text-slate-700">
                        <span className="mt-0.5 text-emerald-500 font-bold shrink-0">→</span>
                        <span>{reason}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>
            )}

            {/* Short profile */}
            <section>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Profil</h2>
              <p className="mt-2 text-sm text-slate-700 leading-relaxed">
                {data?.cvSections?.profile ||
                  data?.analysis?.swedishProfileSummary ||
                  "Kandidaten har relevant erfarenhet och bakgrund som passar tjänsten."}
              </p>
            </section>

            {/* Why they fit */}
            {data?.analysis?.whyFit?.length ? (
              <section>
                <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Varför ni bör träffa den här kandidaten
                </h2>
                <ul className="mt-2 space-y-2 pl-0">
                  {data.analysis.whyFit.map((reason) => (
                    <li key={reason} className="flex items-start gap-2 text-sm text-slate-700">
                      <span className="mt-0.5 text-emerald-500 font-bold shrink-0">→</span>
                      <span>{reason}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {/* Certifications — featured prominently for trades */}
            {detailedCertificationLines.length > 0 ? (
              <section>
                <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Certifieringar och behörigheter
                </h2>
                <div className="mt-2 flex flex-wrap gap-2">
                  {detailedCertificationLines.map((cert) => (
                    <span
                      key={cert}
                      className="rounded-md border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-800"
                    >
                      {cert}
                    </span>
                  ))}
                </div>
              </section>
            ) : null}

            {/* Experience entries timeline */}
            {experienceEntries.length > 0 ? (
              <section>
                <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Erfarenhet</h2>
                {data?.cvSections?.yearsExperience ? (
                  <p className="mt-1 text-xs text-slate-500">
                    Uppskattningsvis {data.cvSections.yearsExperience} år i yrket
                  </p>
                ) : null}
                <div className="mt-3 space-y-3 text-sm text-slate-700">
                  {experienceEntries.map((entry, index) => (
                    <div
                      key={`${index}-${entry.heading}`}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3"
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="font-semibold text-slate-900">{entry.heading}</p>
                        {entry.period ? (
                          <p className="text-xs text-slate-500">{entry.period}</p>
                        ) : null}
                      </div>
                      {entry.bullets.length > 0 ? (
                        <ul className="mt-2 space-y-1 pl-4">
                          {entry.bullets.map((bullet) => (
                            <li key={`${entry.heading}-${bullet}`} className="list-disc text-slate-600">
                              {bullet}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ))}
                </div>
              </section>
            ) : detailedExperienceBlocks.length > 0 ? (
              <section>
                <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Erfarenhet</h2>
                <div className="mt-3 space-y-3 text-sm text-slate-700">
                  {detailedExperienceBlocks.map((block, index) => (
                    <div
                      key={`${index}-${block.slice(0, 32)}`}
                      className="whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 px-4 py-3"
                    >
                      {block}
                    </div>
                  ))}
                </div>
              </section>
            ) : experienceLines.length > 0 ? (
              <section>
                <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Relevant erfarenhet</h2>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
                  {experienceLines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </section>
            ) : null}

            {/* Education */}
            {detailedEducationLines.length > 0 ? (
              <section>
                <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Utbildning</h2>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
                  {detailedEducationLines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </section>
            ) : educationLines.length > 0 ? (
              <section>
                <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Utbildning</h2>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
                  {educationLines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </section>
            ) : null}

            {/* Core competencies */}
            {data?.cvSections?.coreCompetencies?.length ? (
              <section>
                <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Kärnkompetenser</h2>
                <ul className="mt-2 space-y-1 pl-0">
                  {data.cvSections.coreCompetencies.map((line) => (
                    <li key={line} className="flex items-start gap-2 text-sm text-slate-700">
                      <span className="mt-0.5 text-slate-400 shrink-0">·</span>
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {/* Skills chips */}
            {detailedSkillLines.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Kompetenser</h2>
                <div className="mt-2 flex flex-wrap gap-2">
                  {detailedSkillLines.map((skill) => (
                    <span
                      key={skill}
                      className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-700"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </section>
            )}

            {/* Seniority */}
            {data?.candidate?.seniority_reason && (
              <section>
                <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Erfarenhetsnivå</h2>
                <p className="mt-2 text-sm text-slate-700">{data.analysis.swedishSenioritySummary}</p>
              </section>
            )}

            {data?.cvSections?.references ? (
              <p className="text-xs text-slate-400">{data.cvSections.references}</p>
            ) : null}
          </CardContent>
        </Card>

        {/* Right: actions */}
        <div className="space-y-6">

          {/* Step 1: Accept terms */}
          <Card className={step1Done ? "border-emerald-200 bg-emerald-50/30" : ""}>
            <CardHeader>
              <div className="flex items-center gap-2">
                <div className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${step1Done ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-600"}`}>
                  {step1Done ? "✓" : "1"}
                </div>
                <CardTitle className="text-base">Godkänn villkor</CardTitle>
              </div>
              <CardDescription>
                Bekräfta att JobbNu introducerat kandidaten och välj ersättningsmodell för det fall att ni anställer.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">

              {/* Compensation model */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Ersättningsmodell vid anställningen</Label>

                <label className={`flex items-start gap-3 rounded-lg border-2 px-4 py-3 text-sm cursor-pointer transition-colors ${compensationModel === "one_time_offer" ? "border-slate-700 bg-white" : "border-slate-200 bg-white"}`}>
                  <input
                    type="radio"
                    checked={compensationModel === "one_time_offer"}
                    onChange={() => setCompensationModel("one_time_offer")}
                    className="mt-0.5"
                  />
                    <span>
                      <span className="font-semibold text-slate-900">Engångsbelopp vid anställning</span>
                      <br />
                      <span className="text-slate-500 text-xs">
                        Ni anger ett förslag i kr exkl. moms. Traditionell rekrytering ligger ofta på 15 000–50 000 kr,
                        men JobbNu vill hålla nivån tydligt lägre. Våra engångsupplägg brukar normalt ligga i intervallet
                        5 000–13 000 kr beroende på roll, och vår ambition är att i de flesta fall hålla nivån under 10 000 kr.
                      </span>
                    </span>
                  </label>

                <label className={`flex items-start gap-3 rounded-lg border-2 px-4 py-3 text-sm cursor-pointer transition-colors ${compensationModel === "monthly_percentage" ? "border-slate-700 bg-white" : "border-slate-200 bg-white"}`}>
                  <input
                    type="radio"
                    checked={compensationModel === "monthly_percentage"}
                    onChange={() => setCompensationModel("monthly_percentage")}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="font-semibold text-slate-900">Löpande 2% av fast månadslön</span>
                    <br />
                    <span className="text-slate-500 text-xs">
                      2% på 40 000 kr = 800 kr/mån + moms. Enkel modell som löper så länge
                      kandidaten är anställd. Faktureras månadsvis.
                    </span>
                  </span>
                </label>
              </div>

              {compensationModel === "one_time_offer" ? (
                <div className="space-y-1">
                  <Label>Vad vill ni erbjuda för den här kandidaten? (kr exkl. moms)</Label>
                  <Input
                    inputMode="numeric"
                    value={oneTimeFeeSek}
                    onChange={(e) => setOneTimeFeeSek(e.target.value)}
                    placeholder="Exempel: 8 000"
                    disabled={step1Done}
                  />
                  <p className="text-xs text-slate-400">
                    Ange gärna ett förslag. Beloppet är förhandlingsbart och fastställs skriftligen först när ni går vidare.
                  </p>
                </div>
              ) : null}

              {/* Contact fields */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1 col-span-2">
                  <Label>Företag</Label>
                  <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} disabled={step1Done} />
                </div>
                <div className="space-y-1">
                  <Label>Kontaktperson</Label>
                  <Input value={contactName} onChange={(e) => setContactName(e.target.value)} disabled={step1Done} />
                </div>
                <div className="space-y-1">
                  <Label>Telefon</Label>
                  <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} disabled={step1Done} />
                </div>
                <div className="space-y-1 col-span-2">
                  <Label>E-post</Label>
                  <Input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} disabled={step1Done} />
                </div>
              </div>

              {!step1Done && (
                <label className="flex items-start gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={acceptedTerms}
                    onChange={(e) => setAcceptedTerms(e.target.checked)}
                    className="mt-1"
                  />
                  Jag bekräftar att JobbNu introducerat denna kandidat till oss och godkänner ersättningsmodellen
                  som gäller om vi väljer att anställa.
                </label>
              )}

              {step1Done ? (
                <div className="rounded-md bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-800 font-medium">
                  Villkor godkända — välj en intervjutid nedan.
                </div>
              ) : (
                <Button
                  onClick={() => void handleAcceptTerms()}
                  disabled={
                    submittingAcceptance ||
                    !companyName ||
                    !contactName ||
                    !contactEmail ||
                    !acceptedTerms ||
                    (compensationModel === "one_time_offer" && !oneTimeFeeSek.trim())
                  }
                  className="w-full"
                >
                  {submittingAcceptance ? "Sparar..." : "Godkänn villkor"}
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Step 2: Book interview */}
          <Card className={step2Done ? "border-emerald-200 bg-emerald-50/30" : !step1Done ? "opacity-60" : ""}>
            <CardHeader>
              <div className="flex items-center gap-2">
                <div className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${step2Done ? "bg-emerald-600 text-white" : step1Done ? "bg-slate-700 text-white" : "bg-slate-200 text-slate-600"}`}>
                  {step2Done ? "✓" : "2"}
                </div>
                <CardTitle className="text-base">Boka intervju</CardTitle>
              </div>
              <CardDescription>
                {step1Done
                  ? "Välj ett tillgängligt block. JobbNu bekräftar med kandidaten och återkommer."
                  : "Godkänn villkoren ovan för att låsa upp tidsbokning."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {step2Done ? (
                <div className="space-y-3">
                  <div className="rounded-md bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-800 font-medium">
                    Intervju bokad
                    {data?.latestBooking
                      ? ` ${data.latestBooking.booking_date} kl. ${data.latestBooking.start_time.slice(0, 5)}–${data.latestBooking.end_time.slice(0, 5)}.`
                      : "."}{" "}
                    JobbNu har notifierat kandidaten.
                  </div>
                  <div className="space-y-1">
                    <Label>Möteslänk</Label>
                    <Input
                      value={meetingLink}
                      onChange={(e) => setMeetingLink(e.target.value)}
                      placeholder="https://meet.google.com/... eller Zoom"
                    />
                    <p className="text-xs text-slate-400">
                      Om ni använder digitalt möte kan ni lägga till eller uppdatera länken här även efter bokning.
                    </p>
                    <Button
                      onClick={() => void handleSaveMeetingLink()}
                      disabled={savingMeetingLink}
                      variant="outline"
                      className="w-full"
                    >
                      {savingMeetingLink ? "Sparar..." : "Spara möteslänk"}
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  {data?.slots?.length ? (
                    <div className="space-y-2">
                      {data.slots.map((slot) => {
                        const label = `${slot.slot_date} ${slot.start_time.slice(0, 5)}–${slot.end_time.slice(0, 5)}`
                        return (
                          <label
                            key={slot.id}
                            className={`flex items-center gap-2 rounded border px-3 py-2 text-sm cursor-pointer ${
                              selectedSlotId === slot.id
                                ? "border-slate-700 bg-slate-50 font-medium"
                                : "border-slate-200"
                            }`}
                          >
                            <input
                              type="radio"
                              name="slot"
                              value={slot.id}
                              checked={selectedSlotId === slot.id}
                              onChange={() => setSelectedSlotId(slot.id)}
                              disabled={!step1Done}
                            />
                            {label}
                          </label>
                        )
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500">Inga tider upplagda ännu — JobbNu återkommer.</p>
                  )}

                  <div className="space-y-1">
                    <Label>Möteslänk (valfritt)</Label>
                    <Input
                      value={meetingLink}
                      onChange={(e) => setMeetingLink(e.target.value)}
                      placeholder="https://meet.google.com/... eller Zoom"
                      disabled={!step1Done}
                    />
                    <p className="text-xs text-slate-400">Lämna tomt för fysiskt möte eller om JobbNu koordinerar.</p>
                  </div>

                  <Button
                    onClick={() => void handleBook()}
                    disabled={!step1Done || !selectedSlotId || bookingLoading}
                    className="w-full"
                  >
                    {bookingLoading ? "Bokar..." : "Bekräfta intervjutid"}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          {/* What happens next */}
          {step1Done && !step2Done && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500 space-y-1">
              <p className="font-semibold text-slate-700">Vad händer efter bokning?</p>
              <p>1. JobbNu bekräftar intervjutiden med kandidaten.</p>
              <p>2. Ni och kandidaten förbereds inför mötet.</p>
              <p>3. Kandidatens fullständiga namn och kontakt delas med er.</p>
              <p>4. JobbNu följer upp med er efter intervjun.</p>
            </div>
          )}

          {step2Done && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500 space-y-1">
              <p className="font-semibold text-slate-700">Nästa steg</p>
              <p>JobbNu kontaktar er efter intervjun för att höra hur det gick och stödja er i eventuell rekrytering.</p>
              <p>Om ni väljer att gå vidare hanterar vi villkoren skriftligen direkt med er.</p>
            </div>
          )}

          {/* Error / success */}
          {(successMessage || error) && (
            <div className="rounded-md border border-slate-200 bg-white px-4 py-3">
              {successMessage && <p className="text-sm text-emerald-700">{successMessage}</p>}
              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
