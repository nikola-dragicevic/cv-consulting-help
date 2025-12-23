// src/app/admin/page.tsx
"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@supabase/supabase-js"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function AdminDashboard() {
  const router = useRouter()
  const [candidates, setCandidates] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [isAuthorized, setIsAuthorized] = useState(false)
  
  // Admin Calendar State
  const [blockDate, setBlockDate] = useState("")
  const [blockTime, setBlockTime] = useState("")
  const [blocks, setBlocks] = useState<any[]>([])

  useEffect(() => {
    const auth = sessionStorage.getItem("admin-auth")
    if (auth !== "true") {
      router.push("/admin/login")
    } else {
      setIsAuthorized(true)
      fetchCandidates()
      fetchBlocks() // Fetch blocked times
    }
  }, [router])

  const fetchCandidates = async () => {
    setLoading(true)
    const { data } = await supabase.from("candidate_profiles").select("*").order("created_at", { ascending: false })
    if (data) setCandidates(data)
    setLoading(false)
  }
  
  const fetchBlocks = async () => {
    const { data } = await supabase.from("availability_blocks").select("*").order("block_date", { ascending: true })
    if (data) setBlocks(data)
  }

  const handleBlockTime = async () => {
    if (!blockDate) return alert("Välj datum")
    
    // If no time is selected, block entire day logic could be implemented, 
    // but here we simply insert what we have.
    // Assuming "HELA_DAGEN" logic is handled if blockTime is empty string in your calendar component,
    // or you can enforce specific times.
    
    const { error } = await supabase.from("availability_blocks").insert({
        block_date: blockDate,
        start_time: blockTime ? `${blockTime}:00` : null // null = hela dagen check
    })

    if (error) alert("Fel vid blockering: " + error.message)
    else {
        alert("Tid blockerad!")
        fetchBlocks()
    }
  }

  const handleDeleteBlock = async (id: number) => {
      await supabase.from("availability_blocks").delete().eq("id", id)
      fetchBlocks()
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

  if (!isAuthorized) return null

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-slate-900">🛠 Admin Dashboard</h1>
          <Button variant="outline" onClick={handleLogout}>Logga ut</Button>
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
                            {c.cv_file_url && <Button size="sm" variant="link" onClick={() => viewCv(c.cv_file_url)}>Visa CV</Button>}
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
                    {blocks.map(b => (
                        <div key={b.id} className="flex justify-between items-center p-3 border-b last:border-0">
                            <span>{b.block_date} {b.start_time ? `kl ${b.start_time}` : "(Hela dagen)"}</span>
                            <Button variant="destructive" size="sm" onClick={() => handleDeleteBlock(b.id)}>Ta bort</Button>
                        </div>
                    ))}
                    {blocks.length === 0 && <p className="p-4 text-gray-500 text-sm">Inga blockeringar.</p>}
                </div>
            </div>
        </div>
      </div>
    </div>
  )
}