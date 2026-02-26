"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { getBrowserSupabase } from "@/lib/supabaseBrowser"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import Link from "next/link"
import { useLanguage } from "@/components/i18n/LanguageProvider"

export default function SignupPage() {
  const { t } = useLanguage()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const router = useRouter()

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setMessage("")

    const supabase = getBrowserSupabase()

    // Get the current origin for the email redirect URL
    const origin = typeof window !== 'undefined' ? window.location.origin : ''

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${origin}/api/auth/callback?next=/profile`,
      }
    })

    if (error) {
      setError(`${t("Registreringen misslyckades", "Sign up failed")}: ${error.message}`)
      console.error("Signup error:", error.message)
    } else if (data.user) {
      // Check if email confirmation is required
      if (data.user.identities && data.user.identities.length === 0) {
        setError(t("Den här e-postadressen är redan registrerad.", "This email address is already registered."))
      } else {
        setMessage(t("Registrering lyckades! Vänligen kolla din e-post för att bekräfta ditt konto.", "Sign-up successful! Please check your email to confirm your account."))
        // Redirect to login page after delay
        setTimeout(() => router.push('/login'), 3000)
      }
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-sm">
        <h2 className="text-2xl font-bold mb-6 text-center">{t("Registrera konto", "Create account")}</h2>
        <form onSubmit={handleSignup} className="space-y-4">
          <div>
            <Label htmlFor="email">{t("E-post", "Email")}</Label>
            <Input
              id="email"
              type="email"
              placeholder={t("din@epost.se", "you@email.com")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="password">{t("Lösenord", "Password")}</Label>
            <Input
              id="password"
              type="password"
              placeholder={t("Minst 6 tecken", "At least 6 characters")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <Button type="submit" className="w-full">
            {t("Registrera", "Sign up")}
          </Button>
          {error && <p className="text-red-500 text-sm mt-3">{error}</p>}
          {message && <p className="text-green-600 text-sm mt-3">{message}</p>}
        </form>
        <p className="text-center text-sm text-gray-600 mt-4">
          {t("Har du redan ett konto?", "Already have an account?")}{" "}
          <Link href="/login" className="text-blue-600 hover:underline">
            {t("Logga in", "Log in")}
          </Link>
        </p>
      </div>
    </div>
  )
}
