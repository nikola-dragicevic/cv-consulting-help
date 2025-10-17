"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@supabase/supabase-js"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import Link from "next/link"

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function SignupPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const router = useRouter()

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setMessage("")

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    })

    if (error) {
      setError("Registreringen misslyckades. Försök igen.")
      console.error("Signup error:", error.message)
    } else {
        setMessage("Registrering lyckades! Vänligen kolla din e-post för att bekräfta ditt konto.")
        // Optionally redirect after a delay
        setTimeout(() => router.push('/login'), 3000);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-sm">
        <h2 className="text-2xl font-bold mb-6 text-center">Registrera konto</h2>
        <form onSubmit={handleSignup} className="space-y-4">
          <div>
            <Label htmlFor="email">E-post</Label>
            <Input
              id="email"
              type="email"
              placeholder="din@epost.se"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="password">Lösenord</Label>
            <Input
              id="password"
              type="password"
              placeholder="Minst 6 tecken"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <Button type="submit" className="w-full">
            Registrera
          </Button>
          {error && <p className="text-red-500 text-sm mt-3">{error}</p>}
          {message && <p className="text-green-600 text-sm mt-3">{message}</p>}
        </form>
        <p className="text-center text-sm text-gray-600 mt-4">
          Har du redan ett konto?{" "}
          <Link href="/login" className="text-blue-600 hover:underline">
            Logga in
          </Link>
        </p>
      </div>
    </div>
  )
}