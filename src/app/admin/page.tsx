// src/app/admin/page.tsx
"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import type { User } from "@supabase/supabase-js"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { isAdminUser, isAdminOrModerator } from "@/lib/admin"
import { getBrowserSupabase } from "@/lib/supabaseBrowser"

const supabase = getBrowserSupabase()

type CandidateRow = {
  id: string
  user_id: string | null
  full_name: string | null
  email: string | null
  city: string | null
  cv_file_url: string | null
  cv_bucket_path: string | null
  category_tags: string[] | null
  primary_occupation_field: string | null
  manual_premium: boolean | null
  created_at: string | null
}

type AvailabilityBlockRow = {
  id: number
  block_date: string
  start_time: string | null
}

type AdminDocumentOrderRow = {
  id: string
  status: string
  package_name: string
  package_flow: string
  amount_sek: number
  target_role: string | null
  target_job_link: string | null
  intake_full_name: string | null
  intake_email: string | null
  letter_job_title: string | null
  stripe_customer_email: string | null
  stripe_checkout_session_id: string | null
  paid_at: string | null
  delivery_notes: string | null
  delivered_at: string | null
  created_at: string | null
}

type JobResult = {
  id: string
  headline: string
  company: string | null
  city: string | null
  occupation_field_label: string | null
  occupation_group_label: string | null
  occupation_label: string | null
  distance_km: number
  webpage_url: string | null
  published_at: string | null
}

type TabKey = "candidates" | "jobsearch" | "orders" | "calendar" | "cvgen"

export default function AdminDashboard() {
  const router = useRouter()
  const [tab, setTab] = useState<TabKey>("candidates")
  const [isAuthorized, setIsAuthorized] = useState(false)
  const [authLoading, setAuthLoading] = useState(true)
  const [adminUser, setAdminUser] = useState<User | null>(null)

  // Candidates
  const [candidates, setCandidates] = useState<CandidateRow[]>([])
  const [candidatesLoading, setCandidatesLoading] = useState(false)
  const [candidateSearch, setCandidateSearch] = useState("")
  const [expandedCandidate, setExpandedCandidate] = useState<string | null>(null)
  const [moderatorIds, setModeratorIds] = useState<Set<string>>(new Set())

  // Document orders
  const [documentOrders, setDocumentOrders] = useState<AdminDocumentOrderRow[]>([])
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [orderNotesDraft, setOrderNotesDraft] = useState<Record<string, string>>({})

  // Calendar
  const [blockDate, setBlockDate] = useState("")
  const [blockTime, setBlockTime] = useState("")
  const [blocks, setBlocks] = useState<AvailabilityBlockRow[]>([])

  // CV Generator
  const [cvGenText, setCvGenText] = useState("")
  const [cvGenResult, setCvGenResult] = useState("")
  const [cvGenLoading, setCvGenLoading] = useState(false)
  const [cvGenError, setCvGenError] = useState("")

  // Job search
  const [jsAddress, setJsAddress] = useState("")
  const [jsRadius, setJsRadius] = useState("50")
  const [jsKeyword, setJsKeyword] = useState("")
  const [jsResults, setJsResults] = useState<JobResult[]>([])
  const [jsLoading, setJsLoading] = useState(false)
  const [jsError, setJsError] = useState("")
  const [jsTotal, setJsTotal] = useState<number | null>(null)

  useEffect(() => {
    let mounted = true

    async function bootstrap() {
      const { data } = await supabase.auth.getUser()
      const user = data.user ?? null

      if (!mounted) return

      if (!user) {
        router.push("/admin/login")
        setAuthLoading(false)
        return
      }

      if (!isAdminOrModerator(user)) {
        router.push("/")
        setAuthLoading(false)
        return
      }

      setAdminUser(user)
      setIsAuthorized(true)
      setAuthLoading(false)
      fetchCandidates()
      fetchBlocks()
      fetchDocumentOrders()
    }

    bootstrap()

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        setIsAuthorized(false)
        setAdminUser(null)
        router.push("/admin/login")
        return
      }
      const user = session?.user ?? null
      if (!user) return // transient state during token refresh — bootstrap() handles initial check
      if (!isAdminOrModerator(user)) {
        setIsAuthorized(false)
        setAdminUser(null)
        router.push("/")
        return
      }
      setAdminUser(user)
      setIsAuthorized(true)
    })

    return () => {
      mounted = false
      authListener.subscription.unsubscribe()
    }
  }, [router])

  const fetchCandidates = async () => {
    setCandidatesLoading(true)
    try {
      const res = await fetch("/api/admin/candidates")
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || "Failed to fetch candidates")
      setCandidates((json.data || []) as CandidateRow[])
    } catch (err) {
      console.error(err)
      alert("Kunde inte hämta kandidater")
    } finally {
      setCandidatesLoading(false)
    }
  }

  const fetchBlocks = async () => {
    try {
      const res = await fetch("/api/admin/availability-blocks")
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || "Failed to fetch availability blocks")
      setBlocks((json.data || []) as AvailabilityBlockRow[])
    } catch (err) {
      console.error(err)
    }
  }

  const fetchDocumentOrders = async () => {
    setOrdersLoading(true)
    try {
      const res = await fetch("/api/admin/document-orders")
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || "Failed to fetch document orders")
      setDocumentOrders(json.data || [])
      setOrderNotesDraft((prev) => {
        const next = { ...prev }
        for (const o of json.data || []) {
          if (!(o.id in next)) next[o.id] = o.delivery_notes || ""
        }
        return next
      })
    } catch (err: unknown) {
      console.error(err)
    } finally {
      setOrdersLoading(false)
    }
  }

  const isSuperAdmin = isAdminUser(adminUser)

  const togglePremium = async (candidate: CandidateRow) => {
    const newValue = !candidate.manual_premium
    try {
      const res = await fetch(`/api/admin/candidates/${candidate.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manual_premium: newValue }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || "Update failed")
      setCandidates((prev) =>
        prev.map((c) => (c.id === candidate.id ? { ...c, manual_premium: newValue } : c))
      )
    } catch (err) {
      console.error(err)
      alert("Kunde inte uppdatera premium-status")
    }
  }

  const toggleModerator = async (candidate: CandidateRow, currentlyModerator: boolean) => {
    if (!candidate.user_id) return alert("Användaren saknar user_id")
    const uid = candidate.user_id
    const newRole = currentlyModerator ? null : "moderator"
    try {
      const res = await fetch(`/api/admin/users/${uid}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || "Update failed")
      setModeratorIds((prev) => {
        const next = new Set(prev)
        newRole ? next.add(uid) : next.delete(uid)
        return next
      })
    } catch (err) {
      console.error(err)
      alert("Kunde inte uppdatera roll")
    }
  }

  const viewCv = async (cvPath?: string | null, cvBucketPath?: string | null) => {
    try {
      const path = cvBucketPath || cvPath || ""
      if (!path) return alert("Ingen sökväg till filen.")
      const res = await fetch("/api/admin/view-cv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
      })
      const json = await res.json()
      if (json.signedUrl) {
        window.open(json.signedUrl, "_blank")
      } else {
        alert("Kunde inte hämta filen.")
      }
    } catch (err) {
      console.error(err)
      alert("Fel vid öppning av CV.")
    }
  }

  const handleBlockTime = async () => {
    if (!blockDate) return alert("Välj datum")
    try {
      const res = await fetch("/api/admin/availability-blocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blockDate, blockTime }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || "Fel vid blockering")
      alert("Tid blockerad!")
      fetchBlocks()
    } catch (err) {
      console.error(err)
      alert("Fel vid blockering")
    }
  }

  const handleDeleteBlock = async (id: number) => {
    try {
      const res = await fetch(`/api/admin/availability-blocks/${id}`, { method: "DELETE" })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || "Delete failed")
      fetchBlocks()
    } catch (err) {
      console.error(err)
      alert("Kunde inte ta bort blockering")
    }
  }

  const updateDocumentOrder = async (id: string, patch: { status?: string; deliveryNotes?: string }) => {
    try {
      const res = await fetch(`/api/admin/document-orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || "Update failed")
      await fetchDocumentOrders()
    } catch (err: unknown) {
      console.error(err)
      alert("Kunde inte uppdatera: " + (err instanceof Error ? err.message : "okänt fel"))
    }
  }

  const handleJobSearch = async () => {
    if (!jsAddress.trim()) return setJsError("Ange en adress eller stad")
    setJsLoading(true)
    setJsError("")
    setJsResults([])
    setJsTotal(null)
    try {
      const res = await fetch("/api/admin/job-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: jsAddress.trim(),
          radiusKm: Number(jsRadius),
          keyword: jsKeyword.trim(),
          limit: 100,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || "Search failed")
      setJsResults(json.results || [])
      setJsTotal(json.total)
    } catch (err: unknown) {
      setJsError(err instanceof Error ? err.message : "Okänt fel")
    } finally {
      setJsLoading(false)
    }
  }

  const handleLogout = () => {
    supabase.auth.signOut().finally(() => {
      setIsAuthorized(false)
      setAdminUser(null)
      router.push("/login")
    })
  }

  if (authLoading) return null
  if (!isAuthorized) return null

  const filteredCandidates = candidates.filter((c) => {
    if (!candidateSearch) return true
    const q = candidateSearch.toLowerCase()
    return (
      c.full_name?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.city?.toLowerCase().includes(q) ||
      c.category_tags?.some((t) => t.toLowerCase().includes(q))
    )
  })

  const handleCvGen = async () => {
    if (!cvGenText.trim()) return setCvGenError("Klistra in text först")
    setCvGenLoading(true)
    setCvGenError("")
    setCvGenResult("")
    try {
      const res = await fetch("/api/admin/generate-cv-freetext", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: cvGenText }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || "Generation failed")
      setCvGenResult(json.cv || "")
    } catch (err) {
      setCvGenError(err instanceof Error ? err.message : "Okänt fel")
    } finally {
      setCvGenLoading(false)
    }
  }

  const downloadTxt = () => {
    const blob = new Blob([cvGenResult], { type: "text/plain;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "cv.txt"
    a.click()
    URL.revokeObjectURL(url)
  }

  const downloadPdf = () => {
    const html = `<!DOCTYPE html>
<html lang="sv">
<head>
<meta charset="utf-8">
<title>CV</title>
<style>
  body { font-family: Arial, sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; font-size: 13px; line-height: 1.5; color: #111; }
  h1 { font-size: 22px; margin-bottom: 2px; }
  h2 { font-size: 15px; border-bottom: 1px solid #ccc; padding-bottom: 3px; margin-top: 18px; }
  h3 { font-size: 13px; margin-bottom: 2px; }
  hr { border: none; border-top: 1px solid #ddd; margin: 10px 0; }
  ul { margin: 4px 0; padding-left: 18px; }
  li { margin-bottom: 2px; }
  strong { font-weight: 600; }
  @media print { body { margin: 0; } }
</style>
</head>
<body>
<pre style="white-space:pre-wrap;font-family:inherit">${cvGenResult.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre>
</body>
</html>`
    const win = window.open("", "_blank")
    if (!win) return alert("Tillåt popups för att ladda ner PDF")
    win.document.write(html)
    win.document.close()
    win.focus()
    setTimeout(() => win.print(), 300)
  }

  const TAB_LABELS: { key: TabKey; label: string }[] = [
    { key: "candidates", label: "Kandidater" },
    { key: "jobsearch", label: "Jobsökning" },
    { key: "orders", label: "Beställningar" },
    { key: "calendar", label: "Kalender" },
    { key: "cvgen", label: "CV-generator" },
  ]

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top bar */}
      <div className="bg-white border-b px-6 py-3 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">Admin Dashboard</h1>
        <div className="flex items-center gap-3">
          {adminUser?.email && <span className="text-sm text-slate-500">{adminUser.email}</span>}
          <Button variant="outline" size="sm" onClick={handleLogout}>Logga ut</Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b px-6">
        <div className="flex gap-0">
          {TAB_LABELS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === key
                  ? "border-blue-600 text-blue-700"
                  : "border-transparent text-slate-600 hover:text-slate-900"
              }`}
            >
              {label}
              {key === "candidates" && candidates.length > 0 && (
                <span className="ml-1.5 text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full">
                  {candidates.length}
                </span>
              )}
              {key === "orders" && documentOrders.length > 0 && (
                <span className="ml-1.5 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">
                  {documentOrders.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6">

        {/* ═══ TAB: Candidates ═══ */}
        {tab === "candidates" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Kandidater ({filteredCandidates.length})</h2>
              <div className="flex gap-2">
                <Input
                  placeholder="Sök namn, e-post, stad, kategori..."
                  className="w-72"
                  value={candidateSearch}
                  onChange={(e) => setCandidateSearch(e.target.value)}
                />
                <Button variant="outline" size="sm" onClick={fetchCandidates} disabled={candidatesLoading}>
                  {candidatesLoading ? "Laddar..." : "Uppdatera"}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              {filteredCandidates.map((c) => (
                <div key={c.id} className="bg-white rounded-lg border shadow-sm">
                  <div
                    className="flex items-center justify-between p-4 cursor-pointer hover:bg-slate-50"
                    onClick={() => setExpandedCandidate(expandedCandidate === c.id ? null : c.id)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 truncate">{c.full_name || "(inget namn)"}</p>
                        <p className="text-sm text-slate-500 truncate">{c.email} {c.city ? `• ${c.city}` : ""}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 ml-4">
                      {c.manual_premium && (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                          Premium
                        </span>
                      )}
                      {c.category_tags && c.category_tags.length > 0 && (
                        <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
                          {c.category_tags.length} tags
                        </span>
                      )}
                      <span className="text-slate-400 text-sm">{expandedCandidate === c.id ? "▲" : "▼"}</span>
                    </div>
                  </div>

                  {expandedCandidate === c.id && (
                    <div className="border-t px-4 pb-4 pt-3 space-y-3 bg-slate-50 rounded-b-lg">
                      {/* Category tags */}
                      {c.category_tags && c.category_tags.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-slate-500 mb-1">Yrkeskategorier</p>
                          <div className="flex flex-wrap gap-1.5">
                            {c.category_tags.map((tag) => (
                              <span key={tag} className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {c.primary_occupation_field && (
                        <p className="text-xs text-slate-600">
                          <span className="font-medium">Primärt fält:</span> {c.primary_occupation_field}
                        </p>
                      )}

                      {/* Actions row */}
                      <div className="flex flex-wrap gap-2 pt-1">
                        {isSuperAdmin && (
                          <Button
                            size="sm"
                            variant={c.manual_premium ? "destructive" : "default"}
                            onClick={() => togglePremium(c)}
                          >
                            {c.manual_premium ? "Ta bort Premium" : "Ge Premium"}
                          </Button>
                        )}
                        {isSuperAdmin && c.user_id && (
                          <Button
                            size="sm"
                            variant={moderatorIds.has(c.user_id!) ? "destructive" : "outline"}
                            onClick={() => toggleModerator(c, moderatorIds.has(c.user_id!))}
                          >
                            {moderatorIds.has(c.user_id) ? "Ta bort Moderator" : "Ge Moderator"}
                          </Button>
                        )}
                        {(c.cv_file_url || c.cv_bucket_path) && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => viewCv(c.cv_file_url, c.cv_bucket_path)}
                          >
                            Visa CV
                          </Button>
                        )}
                      </div>

                      <p className="text-xs text-slate-400">
                        Registrerad: {c.created_at ? new Date(c.created_at).toLocaleString("sv-SE") : "—"}
                      </p>
                    </div>
                  )}
                </div>
              ))}

              {filteredCandidates.length === 0 && !candidatesLoading && (
                <div className="bg-white rounded-lg border p-6 text-center text-slate-400">
                  Inga kandidater hittades.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══ TAB: Job Search ═══ */}
        {tab === "jobsearch" && (
          <div>
            <h2 className="text-lg font-semibold mb-4">Jobsökning i databas</h2>

            <div className="bg-white rounded-lg border p-5 shadow-sm mb-6">
              <div className="grid sm:grid-cols-3 gap-4 mb-4">
                <div>
                  <Label>Adress / Stad</Label>
                  <Input
                    placeholder="t.ex. Stockholm, Göteborg, Malmö västra..."
                    value={jsAddress}
                    onChange={(e) => setJsAddress(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleJobSearch()}
                  />
                </div>
                <div>
                  <Label>Radie (km)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={500}
                    value={jsRadius}
                    onChange={(e) => setJsRadius(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Nyckelord / Yrke</Label>
                  <Input
                    placeholder="t.ex. elektriker, sjuksköterska, IT..."
                    value={jsKeyword}
                    onChange={(e) => setJsKeyword(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleJobSearch()}
                  />
                </div>
              </div>

              <Button onClick={handleJobSearch} disabled={jsLoading}>
                {jsLoading ? "Söker..." : "Sök jobb"}
              </Button>

              {jsError && <p className="mt-3 text-sm text-red-600">{jsError}</p>}
            </div>

            {jsTotal !== null && (
              <p className="text-sm text-slate-600 mb-3">
                Visar {jsResults.length} av {jsTotal} träffar
                {jsKeyword ? ` för "${jsKeyword}"` : ""} inom {jsRadius} km från {jsAddress}
              </p>
            )}

            <div className="space-y-2">
              {jsResults.map((job) => (
                <div key={job.id} className="bg-white rounded-lg border p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900">{job.headline}</p>
                      <p className="text-sm text-slate-600">
                        {job.company && <span>{job.company} • </span>}
                        {job.city && <span>{job.city} • </span>}
                        <span className="text-blue-700">{job.distance_km.toFixed(1)} km</span>
                      </p>
                      {job.occupation_group_label && (
                        <p className="text-xs text-slate-500 mt-0.5">{job.occupation_group_label}</p>
                      )}
                    </div>
                    <div className="shrink-0 flex flex-col items-end gap-1">
                      {job.webpage_url && (
                        <a
                          href={job.webpage_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-blue-600 underline whitespace-nowrap"
                        >
                          Öppna annons
                        </a>
                      )}
                      {job.published_at && (
                        <span className="text-xs text-slate-400">
                          {new Date(job.published_at).toLocaleDateString("sv-SE")}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {jsTotal === 0 && (
                <div className="bg-white rounded-lg border p-6 text-center text-slate-400">
                  Inga jobb hittades för dessa sökkriterier.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══ TAB: Document Orders ═══ */}
        {tab === "orders" && (
          <div>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Dokumentbeställningar</h2>
              <Button variant="outline" size="sm" onClick={fetchDocumentOrders} disabled={ordersLoading}>
                {ordersLoading ? "Laddar..." : "Uppdatera"}
              </Button>
            </div>

            <div className="space-y-4">
              {documentOrders.map((order) => (
                <div key={order.id} className="rounded-lg border bg-white p-4 shadow-sm">
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-1">
                      <p className="font-semibold text-slate-900">{order.package_name}</p>
                      <p className="text-sm text-slate-600">
                        {order.package_flow} • {order.amount_sek} SEK • {order.status}
                      </p>
                      <p className="text-xs text-slate-500">Order ID: {order.id}</p>
                      {order.stripe_checkout_session_id && (
                        <p className="text-xs text-slate-500">Stripe Session: {order.stripe_checkout_session_id}</p>
                      )}
                      {order.intake_full_name && (
                        <p className="text-sm text-slate-700">Kund: {order.intake_full_name}</p>
                      )}
                      {order.intake_email && (
                        <p className="text-sm text-slate-700">Intake e-post: {order.intake_email}</p>
                      )}
                      <p className="text-xs text-slate-500">
                        {order.stripe_customer_email || "Ingen e-post"} •{" "}
                        {order.created_at ? new Date(order.created_at).toLocaleString() : ""}
                      </p>
                      {order.target_role && <p className="text-sm text-slate-700">Målroll: {order.target_role}</p>}
                      {!order.target_role && order.letter_job_title && (
                        <p className="text-sm text-slate-700">Målroll: {order.letter_job_title}</p>
                      )}
                      {order.target_job_link && (
                        <a
                          className="text-sm text-blue-700 underline break-all"
                          href={order.target_job_link}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {order.target_job_link}
                        </a>
                      )}
                    </div>

                    <div className="w-full md:w-[340px] space-y-2">
                      <Label htmlFor={`status-${order.id}`}>Status</Label>
                      <select
                        id={`status-${order.id}`}
                        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                        value={order.status}
                        onChange={(e) => updateDocumentOrder(order.id, { status: e.target.value })}
                      >
                        {["draft", "checkout_created", "paid", "in_progress", "delivered", "failed", "cancelled"].map(
                          (status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          )
                        )}
                      </select>

                      <Label htmlFor={`notes-${order.id}`}>Leveransanteckning</Label>
                      <textarea
                        id={`notes-${order.id}`}
                        className="min-h-[84px] w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                        value={orderNotesDraft[order.id] ?? ""}
                        onChange={(e) =>
                          setOrderNotesDraft((prev) => ({ ...prev, [order.id]: e.target.value }))
                        }
                        placeholder="T.ex. skickat CV v1 via e-post, väntar feedback"
                      />

                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            updateDocumentOrder(order.id, { deliveryNotes: orderNotesDraft[order.id] ?? "" })
                          }
                        >
                          Spara anteckning
                        </Button>
                        <Button
                          size="sm"
                          onClick={() =>
                            updateDocumentOrder(order.id, {
                              status: "delivered",
                              deliveryNotes: orderNotesDraft[order.id] ?? "",
                            })
                          }
                        >
                          Markera levererad
                        </Button>
                      </div>

                      {order.paid_at && (
                        <p className="text-xs text-slate-500">Betald: {new Date(order.paid_at).toLocaleString()}</p>
                      )}
                      {order.delivered_at && (
                        <p className="text-xs text-green-700">
                          Levererad: {new Date(order.delivered_at).toLocaleString()}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {!ordersLoading && documentOrders.length === 0 && (
                <div className="rounded-lg border bg-white p-4 text-sm text-slate-500">
                  Inga dokumentbeställningar ännu.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══ TAB: CV Generator ═══ */}
        {tab === "cvgen" && (
          <div className="max-w-4xl">
            <h2 className="text-lg font-semibold mb-4">CV-generator (fritext)</h2>

            <div className="bg-white rounded-lg border p-5 shadow-sm mb-6 space-y-4">
              <div>
                <Label htmlFor="cvgen-input">Klistra in text (CV-underlag, LinkedIn-profil, anteckningar…)</Label>
                <textarea
                  id="cvgen-input"
                  className="mt-1 w-full min-h-[220px] rounded-md border border-slate-300 px-3 py-2 text-sm font-mono resize-y"
                  placeholder="Klistra in fritext här – namn, kontaktuppgifter, erfarenheter, utbildning, kompetenser etc."
                  value={cvGenText}
                  onChange={(e) => setCvGenText(e.target.value)}
                />
              </div>

              <div className="flex items-center gap-3">
                <Button onClick={handleCvGen} disabled={cvGenLoading}>
                  {cvGenLoading ? "Genererar…" : "Generera CV"}
                </Button>
                {cvGenLoading && (
                  <span className="text-sm text-slate-500">Claude Haiku arbetar – brukar ta 10–20 sek…</span>
                )}
              </div>

              {cvGenError && <p className="text-sm text-red-600">{cvGenError}</p>}
            </div>

            {cvGenResult && (
              <div className="bg-white rounded-lg border shadow-sm">
                <div className="flex items-center justify-between px-5 py-3 border-b">
                  <span className="font-medium text-slate-800">Genererat CV</span>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={downloadTxt}>
                      Ladda ner .txt
                    </Button>
                    <Button size="sm" onClick={downloadPdf}>
                      Ladda ner PDF
                    </Button>
                  </div>
                </div>
                <pre className="whitespace-pre-wrap px-5 py-4 text-sm text-slate-800 font-mono leading-relaxed">
                  {cvGenResult}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* ═══ TAB: Calendar ═══ */}
        {tab === "calendar" && (
          <div className="max-w-lg">
            <h2 className="text-lg font-semibold mb-4">Hantera Tillgänglighet</h2>

            <div className="bg-white p-6 rounded-lg shadow-sm border mb-6">
              <div className="grid gap-4">
                <div>
                  <Label>Datum att blockera</Label>
                  <Input
                    type="date"
                    value={blockDate}
                    onChange={(e) => setBlockDate(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Tid (Lämna tomt för hela dagen)</Label>
                  <Input
                    type="time"
                    value={blockTime}
                    onChange={(e) => setBlockTime(e.target.value)}
                  />
                </div>
                <Button onClick={handleBlockTime}>Blockera Tid</Button>
              </div>
            </div>

            <h3 className="font-medium mb-2">Blockerade tider:</h3>
            <div className="bg-white rounded-lg border overflow-hidden">
              {blocks.map((b) => (
                <div key={b.id} className="flex justify-between items-center p-3 border-b last:border-0">
                  <span>
                    {b.block_date} {b.start_time ? `kl ${b.start_time}` : "(Hela dagen)"}
                  </span>
                  <Button variant="destructive" size="sm" onClick={() => handleDeleteBlock(b.id)}>
                    Ta bort
                  </Button>
                </div>
              ))}
              {blocks.length === 0 && <p className="p-4 text-gray-500 text-sm">Inga blockeringar.</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
