// src/app/admin/page.tsx

"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@supabase/supabase-js"
import { Button } from "@/components/ui/button"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function AdminDashboard() {
  const router = useRouter()
  const [candidates, setCandidates] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [cvUrl, setCvUrl] = useState<string | null>(null)

  // 🔐 Simple auth check
  useEffect(() => {
    const auth = sessionStorage.getItem("admin-auth")
    if (auth !== "true") {
      router.push("/admin/login")
    }
  }, [])

  // 📥 Fetch candidates from Supabase
  useEffect(() => {
    const fetchCandidates = async () => {
      setLoading(true)
      const { data, error } = await supabase
        .from("candidate_profiles")
        .select("*")
        .order("created_at", { ascending: false })
      if (data) setCandidates(data)
      setLoading(false)
    }

    fetchCandidates()
  }, [])

  // 🔗 Generate signed URL for private CV view
  const viewCv = async (cvPath: string) => {
    const filename = cvPath.split("cvs/")[1]
    const res = await fetch("/api/admin/view-cv", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename }),
    })
    const json = await res.json()
    if (json.signedUrl) {
      setCvUrl(json.signedUrl)
      window.open(json.signedUrl, "_blank")
    } else {
      alert("Kunde inte hämta fil.")
    }
  }

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-6">🛠 Admin – Inskickade Kandidater</h1>
      {loading && <p>Laddar...</p>}
      {!loading && candidates.length === 0 && <p>Inga inskickade kandidater ännu.</p>}

      <div className="space-y-6">
        {candidates.map((c) => (
          <div key={c.id} className="border rounded-lg p-4 shadow-sm bg-white">
            <div className="flex justify-between items-start">
              <div>
                <p className="font-semibold">📛 {c.full_name}</p>
                <p className="text-sm text-slate-600">📧 {c.email}</p>
                <p className="text-sm text-slate-600">📍 {c.city} – {c.street}</p>
                <p className="text-sm text-slate-600">📅 {new Date(c.created_at).toLocaleString()}</p>
              </div>
              <div className="flex gap-2">
                {c.cv_file_url ? (
                  <Button onClick={() => viewCv(c.cv_file_url)} size="sm">Visa CV</Button>
                ) : (
                  <span className="text-xs text-gray-500 italic">Ingen CV uppladdad</span>
                )}
              </div>
            </div>

            {c.quiz_answers && (
              <div className="mt-4 text-sm">
                <p className="font-medium mb-1">🎯 Quiz-svar:</p>
                <pre className="bg-slate-50 p-2 rounded-md border text-xs whitespace-pre-wrap">
                  {JSON.stringify(c.quiz_answers, null, 2)}
                </pre>
              </div>
            )}

            {c.additional_info && (
              <div className="mt-4 text-sm">
                <p className="font-medium mb-1">📝 Extra information från kandidaten:</p>
                <p className="bg-slate-50 p-2 rounded-md border text-xs whitespace-pre-wrap">
                  {c.additional_info}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
} 
