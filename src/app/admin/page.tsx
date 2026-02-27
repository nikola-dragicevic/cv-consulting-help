// src/app/admin/page.tsx
"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@supabase/supabase-js"
import type { User } from "@supabase/supabase-js"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { isAdminUser } from "@/lib/admin"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type CandidateRow = {
  id: string
  full_name: string | null
  email: string | null
  cv_file_url: string | null
  cv_bucket_path: string | null
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
  stripe_customer_email: string | null
  stripe_checkout_session_id: string | null
  paid_at: string | null
  delivery_notes: string | null
  delivered_at: string | null
  created_at: string | null
}

export default function AdminDashboard() {
  const router = useRouter()
  const [candidates, setCandidates] = useState<CandidateRow[]>([])
  const [documentOrders, setDocumentOrders] = useState<AdminDocumentOrderRow[]>([])
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [isAuthorized, setIsAuthorized] = useState(false)
  const [authLoading, setAuthLoading] = useState(true)
  const [adminUser, setAdminUser] = useState<User | null>(null)
  const [orderNotesDraft, setOrderNotesDraft] = useState<Record<string, string>>({})
  
  // Admin Calendar State
  const [blockDate, setBlockDate] = useState("")
  const [blockTime, setBlockTime] = useState("")
  const [blocks, setBlocks] = useState<AvailabilityBlockRow[]>([])

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

      if (!isAdminUser(user)) {
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

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user ?? null
      if (!user) {
        setIsAuthorized(false)
        setAdminUser(null)
        router.push("/admin/login")
        return
      }
      if (!isAdminUser(user)) {
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
    try {
      const res = await fetch("/api/admin/candidates")
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || "Failed to fetch candidates")
      setCandidates((json.data || []) as CandidateRow[])
    } catch (err) {
      console.error(err)
      alert("Kunde inte hämta kandidater")
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
      alert("Kunde inte hämta blockeringar")
    }
  }

  const fetchDocumentOrders = async () => {
    setOrdersLoading(true)
    try {
      const res = await fetch("/api/admin/document-orders", {
        headers: {},
      })
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
      alert("Kunde inte hämta dokumentbeställningar")
    } finally {
      setOrdersLoading(false)
    }
  }

  const handleBlockTime = async () => {
    if (!blockDate) return alert("Välj datum")
    
    // If no time is selected, block entire day logic could be implemented, 
    // but here we simply insert what we have.
    // Assuming "HELA_DAGEN" logic is handled if blockTime is empty string in your calendar component,
    // or you can enforce specific times.
    
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
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(patch),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || "Update failed")
      await fetchDocumentOrders()
    } catch (err: unknown) {
      console.error(err)
      alert("Kunde inte uppdatera beställning: " + (err instanceof Error ? err.message : "okänt fel"))
    }
  }

  // 🔗 3. Generate signed URL for private CV view via API
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
        alert("Kunde inte hämta filen (Ogiltig URL).")
      }
    } catch (err) {
      console.error(err)
      alert("Ett fel uppstod vid öppning av CV.")
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

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-slate-900">🛠 Admin Dashboard</h1>
          <div className="flex items-center gap-3">
            {adminUser?.email && <span className="text-sm text-slate-500">{adminUser.email}</span>}
            <Button variant="outline" onClick={handleLogout}>Logga ut</Button>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
            {/* Left: Candidates */}
            <div>
                <h2 className="text-xl font-semibold mb-4">Inskickade Kandidater</h2>
                <div className="space-y-4 max-h-[80vh] overflow-y-auto">
                    {candidates.map((c) => (
                        <div key={c.id} className="border rounded-lg p-4 bg-white shadow-sm">
                            <p className="font-bold">{c.full_name}</p>
                            <p className="text-sm text-gray-600">{c.email}</p>
                            {(c.cv_file_url || c.cv_bucket_path) && (
                              <Button size="sm" variant="link" onClick={() => viewCv(c.cv_file_url, c.cv_bucket_path)}>
                                Visa CV
                              </Button>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Right: Calendar Management */}
            <div>
                <h2 className="text-xl font-semibold mb-4">📅 Hantera Tillgänglighet</h2>
                <div className="bg-white p-6 rounded-lg shadow-sm border mb-6">
                    <div className="grid gap-4">
                        <div>
                            <Label>Datum att blockera</Label>
                            <Input type="date" value={blockDate} onChange={e => setBlockDate(e.target.value)} />
                        </div>
                        <div>
                            <Label>Tid (Lämna tomt för hela dagen)</Label>
                            <Input type="time" value={blockTime} onChange={e => setBlockTime(e.target.value)} />
                        </div>
                        <Button onClick={handleBlockTime}>Blockera Tid</Button>
                    </div>
                </div>

                <h3 className="font-medium mb-2">Blockerade tider:</h3>
                <div className="bg-white rounded-lg border overflow-hidden">
                    {blocks.map((b) => (
                        <div key={b.id} className="flex justify-between items-center p-3 border-b last:border-0">
                            <span>{b.block_date} {b.start_time ? `kl ${b.start_time}` : "(Hela dagen)"}</span>
                            <Button variant="destructive" size="sm" onClick={() => handleDeleteBlock(b.id)}>Ta bort</Button>
                        </div>
                    ))}
                    {blocks.length === 0 && <p className="p-4 text-gray-500 text-sm">Inga blockeringar.</p>}
                </div>
            </div>
        </div>

        <div className="mt-10">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold">🧾 Dokumentbeställningar</h2>
            <Button variant="outline" onClick={fetchDocumentOrders} disabled={ordersLoading}>
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
                    <p className="text-xs text-slate-500">
                      {order.stripe_customer_email || "Ingen e-post"} • {order.created_at ? new Date(order.created_at).toLocaleString() : ""}
                    </p>
                    {order.target_role && <p className="text-sm text-slate-700">Målroll: {order.target_role}</p>}
                    {order.target_job_link && (
                      <a className="text-sm text-blue-700 underline break-all" href={order.target_job_link} target="_blank" rel="noreferrer">
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
                      {["draft", "checkout_created", "paid", "in_progress", "delivered", "failed", "cancelled"].map((status) => (
                        <option key={status} value={status}>{status}</option>
                      ))}
                    </select>

                    <Label htmlFor={`notes-${order.id}`}>Leveransanteckning</Label>
                    <textarea
                      id={`notes-${order.id}`}
                      className="min-h-[84px] w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      value={orderNotesDraft[order.id] ?? ""}
                      onChange={(e) => setOrderNotesDraft((prev) => ({ ...prev, [order.id]: e.target.value }))}
                      placeholder="T.ex. skickat CV v1 via e-post, väntar feedback"
                    />

                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => updateDocumentOrder(order.id, { deliveryNotes: orderNotesDraft[order.id] ?? "" })}
                      >
                        Spara anteckning
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => updateDocumentOrder(order.id, { status: "delivered", deliveryNotes: orderNotesDraft[order.id] ?? "" })}
                      >
                        Markera levererad
                      </Button>
                    </div>

                    {order.paid_at && <p className="text-xs text-slate-500">Betald: {new Date(order.paid_at).toLocaleString()}</p>}
                    {order.delivered_at && <p className="text-xs text-green-700">Levererad: {new Date(order.delivered_at).toLocaleString()}</p>}
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
      </div>
    </div>
  )
}
