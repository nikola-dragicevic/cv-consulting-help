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
  
  // New state to prevent the dashboard from showing before we check auth
  const [isAuthorized, setIsAuthorized] = useState(false)

  // 🔐 1. Check Auth on Load
  useEffect(() => {
    const auth = sessionStorage.getItem("admin-auth")
    if (auth !== "true") {
      router.push("/admin/login")
    } else {
      setIsAuthorized(true) // User is allowed, show dashboard
      fetchCandidates()     // Start fetching data
    }
  }, [router])

  // 📥 2. Fetch candidates from Supabase
  const fetchCandidates = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from("candidate_profiles")
      .select("*")
      .order("created_at", { ascending: false })
    
    if (error) {
      console.error("Error fetching:", error)
    } else if (data) {
      setCandidates(data)
    }
    setLoading(false)
  }

  // 🔗 3. Generate signed URL for private CV view via API
  const viewCv = async (cvPath: string) => {
    try {
      if (!cvPath) return alert("Ingen sökväg till filen.")
        
      // Extract filename if needed, or send the whole path depending on your API logic
      // Assuming your DB saves "cvs/filename.pdf"
      const filename = cvPath.split("cvs/")[1] 
      
      if (!filename) return alert("Felaktigt filformat")

      const res = await fetch("/api/admin/view-cv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename }),
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
    sessionStorage.removeItem("admin-auth")
    router.push("/admin/login")
  }

  // Prevent flash of unstyled content if not authorized yet
  if (!isAuthorized) {
    return null // Or a generic loading spinner
  }

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-slate-900">🛠 Admin – Kandidater</h1>
          <Button variant="outline" onClick={handleLogout}>Logga ut</Button>
        </div>

        {loading && <p className="text-slate-500">Laddar kandidater...</p>}
        
        {!loading && candidates.length === 0 && (
          <div className="bg-white p-6 rounded-lg shadow-sm border text-center text-slate-500">
            Inga inskickade kandidater ännu.
          </div>
        )}

        <div className="space-y-6">
          {candidates.map((c) => (
            <div key={c.id} className="border rounded-xl p-6 shadow-sm bg-white transition-all hover:shadow-md">
              <div className="flex flex-col md:flex-row justify-between items-start gap-4">
                
                {/* Info Column */}
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xl font-bold text-slate-900">{c.full_name}</span>
                    <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">
                      Ny
                    </span>
                  </div>
                  <p className="text-slate-600 mb-1">📧 <a href={`mailto:${c.email}`} className="hover:underline">{c.email}</a></p>
                  <p className="text-sm text-slate-500">📍 {c.city} • {c.street}</p>
                  <p className="text-xs text-slate-400 mt-2">
                    Inskickad: {new Date(c.created_at).toLocaleString('sv-SE')}
                  </p>
                </div>

                {/* Action Column */}
                <div className="shrink-0">
                  {c.cv_file_url ? (
                    <Button onClick={() => viewCv(c.cv_file_url)}>
                      📄 Öppna CV
                    </Button>
                  ) : (
                    <span className="text-sm text-slate-400 italic bg-slate-100 px-3 py-2 rounded-md">
                      Inget CV
                    </span>
                  )}
                </div>
              </div>

              {/* Quiz Answers Section */}
              {c.quiz_answers && (
                <div className="mt-6 pt-4 border-t">
                  <p className="text-sm font-semibold text-slate-700 mb-2">🎯 Quiz-svar:</p>
                  <div className="bg-slate-50 p-4 rounded-lg text-sm text-slate-700 whitespace-pre-wrap font-mono border">
                    {JSON.stringify(c.quiz_answers, null, 2)}
                  </div>
                </div>
              )}

              {/* Additional Info Section */}
              {c.additional_info && (
                <div className="mt-4">
                  <p className="text-sm font-semibold text-slate-700 mb-1">📝 Meddelande:</p>
                  <p className="text-sm text-slate-600 bg-amber-50 p-3 rounded-md border border-amber-100">
                    {c.additional_info}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}