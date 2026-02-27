"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { getBrowserSupabase } from "@/lib/supabaseBrowser"
import { getUserRole, isAdminUser } from "@/lib/admin"

export default function AdminLoginPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState("")

  useEffect(() => {
    const supabase = getBrowserSupabase()

    supabase.auth.getUser().then(({ data }) => {
      const user = data.user ?? null
      if (!user) {
        setMessage("Logga in med ett konto som har rollen admin för att öppna admin.")
        setLoading(false)
        return
      }

      if (!isAdminUser(user)) {
        const role = getUserRole(user) || "none"
        setMessage(`Inloggad som ${user.email ?? "okänd användare"}, men rollen är '${role}'. Endast role=admin har adminåtkomst.`)
        setLoading(false)
        return
      }

      router.replace("/admin")
    }).catch(() => {
      setMessage("Kunde inte kontrollera inloggning.")
      setLoading(false)
    })
  }, [router])

  if (loading) return null

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 px-4">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
        <h2 className="text-2xl font-bold mb-3 text-center">Admin Access</h2>
        <p className="text-sm text-slate-600 text-center mb-6">
          Endast användare med <span className="font-medium">app_metadata.role = admin</span> har adminbehörighet.
        </p>
        {message && <p className="text-sm text-slate-700 mb-4 text-center">{message}</p>}
        <div className="grid gap-3">
          <Button asChild>
            <Link href="/login">Gå till inloggning</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/">Till startsidan</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
