"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { getBrowserSupabase } from "@/lib/supabaseBrowser"
import { Button } from "@/components/ui/button"

type DocumentOrder = {
  id: string
  status: string
  package_name: string
  package_flow: string
  amount_sek: number
  target_role: string | null
  target_job_link: string | null
  stripe_checkout_session_id: string | null
  paid_at: string | null
  delivery_notes: string | null
  delivered_at: string | null
  created_at: string
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<DocumentOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    const supabase = getBrowserSupabase()

    async function load() {
      setLoading(true)
      setError("")

      const { data: userRes } = await supabase.auth.getUser()
      if (!userRes.user) {
        setError("Du behöver logga in för att se dina beställningar.")
        setLoading(false)
        return
      }

      const { data, error } = await supabase
        .from("document_orders")
        .select("id,status,package_name,package_flow,amount_sek,target_role,target_job_link,stripe_checkout_session_id,paid_at,delivery_notes,delivered_at,created_at")
        .order("created_at", { ascending: false })

      if (error) {
        setError(error.message)
      } else {
        setOrders((data || []) as DocumentOrder[])
      }
      setLoading(false)
    }

    load()
  }, [])

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Mina dokumentbeställningar</h1>
            <p className="text-sm text-slate-600">Status för CV- och personligt brev-beställningar.</p>
          </div>
          <Button variant="outline" asChild>
            <Link href="/">Till startsidan</Link>
          </Button>
        </div>

        {loading && <div className="rounded-lg border bg-white p-4 text-sm text-slate-500">Laddar beställningar...</div>}
        {!loading && error && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

        {!loading && !error && (
          <div className="space-y-4">
            {orders.map((order) => (
              <div key={order.id} className="rounded-lg border bg-white p-4 shadow-sm">
                <div className="flex flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-slate-900">{order.package_name}</p>
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">{order.status}</span>
                  </div>
                  <p className="text-sm text-slate-600">{order.package_flow} • {order.amount_sek} SEK</p>
                  <p className="text-xs text-slate-500">Beställd: {new Date(order.created_at).toLocaleString()}</p>
                  {order.target_role && <p className="text-sm text-slate-700">Målroll: {order.target_role}</p>}
                  {order.target_job_link && (
                    <a className="text-sm text-blue-700 underline break-all" href={order.target_job_link} target="_blank" rel="noreferrer">
                      {order.target_job_link}
                    </a>
                  )}
                  {order.paid_at && <p className="text-xs text-slate-500">Betald: {new Date(order.paid_at).toLocaleString()}</p>}
                  {order.delivered_at && <p className="text-xs text-green-700">Levererad: {new Date(order.delivered_at).toLocaleString()}</p>}
                  {order.delivery_notes && (
                    <div className="mt-2 rounded border border-slate-200 bg-slate-50 p-2 text-sm text-slate-700">
                      <p className="font-medium">Leveransanteckning</p>
                      <p>{order.delivery_notes}</p>
                    </div>
                  )}
                  <p className="mt-2 text-xs text-slate-400">Order ID: {order.id}</p>
                </div>
              </div>
            ))}
            {orders.length === 0 && (
              <div className="rounded-lg border bg-white p-4 text-sm text-slate-500">
                Du har inga dokumentbeställningar ännu.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
