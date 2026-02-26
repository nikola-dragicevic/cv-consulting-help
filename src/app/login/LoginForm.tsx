// src/app/login/LoginForm.tsx
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { getBrowserSupabase } from "@/lib/supabaseBrowser"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import Link from "next/link"
import { useLanguage } from "@/components/i18n/LanguageProvider"

export default function LoginForm() {
  const { t } = useLanguage()
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
        setError(t("Vänligen bekräfta din e-postadress först. Kontrollera din inkorg.", "Please confirm your email address first. Check your inbox."))
      } else {
        setError(`${t("Inloggningen misslyckades", "Login failed")}: ${error.message}`)
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
        <h2 className="text-2xl font-bold mb-6 text-center">{t("Logga in", "Log in")}</h2>
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <Label htmlFor="email">{t("E-post", "Email")}</Label>
            <Input id="email" type="email" placeholder={t("din@epost.se", "you@email.com")}
              value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="password">{t("Lösenord", "Password")}</Label>
            <Input id="password" type="password" placeholder="••••••••"
              value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <Button type="submit" className="w-full">{t("Logga in", "Log in")}</Button>
          {error && <p className="text-red-500 text-sm mt-3">{error}</p>}
        </form>
        <p className="text-center text-sm text-gray-600 mt-4">
          {t("Har du inget konto?", "Don't have an account?")}{" "}
          <Link href="/signup" className="text-blue-600 hover:underline">{t("Registrera dig", "Sign up")}</Link>
        </p>
      </div>
    </div>
  )
}
