// src/app/login/LoginForm.tsx
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { getBrowserSupabase } from "@/lib/supabaseBrowser"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import Link from "next/link"

export default function LoginForm() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const router = useRouter()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    const supabase = getBrowserSupabase()
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      // Check if it's an email not confirmed error
      if (error.message.includes("Email not confirmed")) {
        setError("Vänligen bekräfta din e-postadress först. Kontrollera din inkorg.")
      } else {
        setError(`Inloggningen misslyckades: ${error.message}`)
      }
      console.error("Login error:", error.message)
    } else if (data.user) {
      router.replace("/profile") // use replace to avoid back-nav to login
      router.refresh() // refresh server components
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-sm">
        <h2 className="text-2xl font-bold mb-6 text-center">Logga in</h2>
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <Label htmlFor="email">E-post</Label>
            <Input id="email" type="email" placeholder="din@epost.se"
              value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="password">Lösenord</Label>
            <Input id="password" type="password" placeholder="••••••••"
              value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <Button type="submit" className="w-full">Logga in</Button>
          {error && <p className="text-red-500 text-sm mt-3">{error}</p>}
        </form>
        <p className="text-center text-sm text-gray-600 mt-4">
          Har du inget konto?{" "}
          <Link href="/signup" className="text-blue-600 hover:underline">Registrera dig</Link>
        </p>
      </div>
    </div>
  )
}
