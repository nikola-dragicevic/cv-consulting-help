"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type FollowupPayload = {
  booking: {
    id: string
    company_name: string
    contact_name: string
    contact_email: string
    booking_date: string
    start_time: string
    end_time: string
    admin_followup_status: string | null
    employer_followup_notes: string | null
    agreed_base_salary_sek: number | null
    employment_start_date: string | null
    employment_type: string | null
    employment_contract_signed: boolean
    proof_document_name: string | null
    employment_ended_at: string | null
  }
  savedJob: {
    headline: string | null
    company: string | null
  } | null
}

const STATUS_OPTIONS = [
  { value: "not_moving_forward", label: "Går inte vidare" },
  { value: "next_interview", label: "Nästa intervju planerad" },
  { value: "offer_planned", label: "Erbjudande planeras" },
  { value: "offer_sent", label: "Erbjudande skickat" },
  { value: "hired_pending_proof", label: "Anställd, underlag kommer" },
  { value: "salary_confirmed", label: "Lön bekräftad" },
  { value: "employment_ended", label: "Anställning avslutad" },
] as const

function needsHiringFields(status: string) {
  return status === "hired_pending_proof" || status === "salary_confirmed"
}

export default function EmployerFollowupPage() {
  const params = useParams<{ token: string }>()
  const token = typeof params?.token === "string" ? params.token : ""
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [payload, setPayload] = useState<FollowupPayload | null>(null)
  const [status, setStatus] = useState("offer_planned")
  const [notes, setNotes] = useState("")
  const [agreedBaseSalarySek, setAgreedBaseSalarySek] = useState("")
  const [employmentStartDate, setEmploymentStartDate] = useState("")
  const [employmentType, setEmploymentType] = useState("")
  const [employmentEndedAt, setEmploymentEndedAt] = useState("")
  const [employmentContractSigned, setEmploymentContractSigned] = useState(false)
  const [proofFile, setProofFile] = useState<File | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError("")
      try {
        const res = await fetch(`/api/employer-followup/${token}`)
        const json = await res.json()
        if (!res.ok) throw new Error(json?.error || "Could not load follow-up page")
        const nextPayload = json.data as FollowupPayload
        setPayload(nextPayload)
        setStatus(nextPayload.booking.admin_followup_status || "offer_planned")
        setNotes(nextPayload.booking.employer_followup_notes || "")
        setAgreedBaseSalarySek(nextPayload.booking.agreed_base_salary_sek ? String(nextPayload.booking.agreed_base_salary_sek) : "")
        setEmploymentStartDate(nextPayload.booking.employment_start_date || "")
        setEmploymentType(nextPayload.booking.employment_type || "")
        setEmploymentEndedAt(nextPayload.booking.employment_ended_at || "")
        setEmploymentContractSigned(Boolean(nextPayload.booking.employment_contract_signed))
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

  async function handleSubmit() {
    setSaving(true)
    setError("")
    setSuccess("")
    try {
      const formData = new FormData()
      formData.set("status", status)
      formData.set("notes", notes)
      formData.set("agreedBaseSalarySek", agreedBaseSalarySek)
      formData.set("employmentStartDate", employmentStartDate)
      formData.set("employmentType", employmentType)
      formData.set("employmentEndedAt", employmentEndedAt)
      formData.set("employmentContractSigned", employmentContractSigned ? "true" : "false")
      if (proofFile) {
        formData.set("proofFile", proofFile)
      }

      const res = await fetch(`/api/employer-followup/${token}`, {
        method: "POST",
        body: formData,
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || "Could not save follow-up")
      setSuccess("Tack. Uppdateringen är sparad.")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="mx-auto max-w-2xl px-4 py-10">Laddar uppföljning...</div>
  }

  if (!payload) {
    return <div className="mx-auto max-w-2xl px-4 py-10 text-red-600">{error || "Länken kunde inte laddas."}</div>
  }

  const roleLabel = payload.savedJob?.headline || "rollen"
  const companyLabel = payload.savedJob?.company || payload.booking.company_name

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <Card>
        <CardHeader>
          <CardTitle>Uppföljning efter intervju</CardTitle>
          <CardDescription>
            {companyLabel} · {roleLabel} · {payload.booking.booking_date} {payload.booking.start_time.slice(0, 5)}-{payload.booking.end_time.slice(0, 5)}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Status</Label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {needsHiringFields(status) ? (
            <>
              <div className="space-y-2">
                <Label>Avtalad fast månadslön före skatt</Label>
                <Input
                  inputMode="numeric"
                  value={agreedBaseSalarySek}
                  onChange={(e) => setAgreedBaseSalarySek(e.target.value)}
                  placeholder="Exempel: 40000"
                />
              </div>
              <div className="space-y-2">
                <Label>Anställningsstart</Label>
                <Input type="date" value={employmentStartDate} onChange={(e) => setEmploymentStartDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Anställningsform</Label>
                <Input
                  value={employmentType}
                  onChange={(e) => setEmploymentType(e.target.value)}
                  placeholder="Exempel: Tillsvidare, provanställning eller visstid"
                />
              </div>
              <label className="flex items-start gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={employmentContractSigned}
                  onChange={(e) => setEmploymentContractSigned(e.target.checked)}
                  className="mt-1"
                />
                Jag bekräftar att anställningsavtalet är signerat.
              </label>
              <div className="space-y-2">
                <Label>Underlag (PDF eller bild)</Label>
                <Input
                  type="file"
                  accept=".pdf,image/*"
                  onChange={(e) => setProofFile(e.target.files?.[0] || null)}
                />
                <p className="text-xs text-slate-500">
                  Ladda gärna upp endast de delar som visar namn, arbetsgivare, startdatum, fast månadslön och signering/status.
                </p>
                {payload.booking.proof_document_name ? (
                  <p className="text-xs text-slate-500">Nuvarande fil: {payload.booking.proof_document_name}</p>
                ) : null}
              </div>
            </>
          ) : null}

          {status === "employment_ended" ? (
            <div className="space-y-2">
              <Label>Datum då anställningen avslutades</Label>
              <Input type="date" value={employmentEndedAt} onChange={(e) => setEmploymentEndedAt(e.target.value)} />
            </div>
          ) : null}

          <div className="space-y-2">
            <Label>Kommentar (valfritt)</Label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="min-h-28 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="Exempel: Kandidaten går vidare till slutintervju nästa vecka."
            />
          </div>

          <Button onClick={() => void handleSubmit()} disabled={saving} className="w-full">
            {saving ? "Sparar..." : "Spara uppföljning"}
          </Button>

          {(success || error) && (
            <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3">
              {success ? <p className="text-sm text-emerald-700">{success}</p> : null}
              {error ? <p className="text-sm text-red-600">{error}</p> : null}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
