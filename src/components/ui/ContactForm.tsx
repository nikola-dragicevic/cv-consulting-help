// src/components/ui/ContactForm.tsx
"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Loader2, CheckCircle, AlertCircle } from "lucide-react"
import { useLanguage } from "@/components/i18n/LanguageProvider"

export default function ContactForm() {
  const { t } = useLanguage()
  const [email, setEmail] = useState("")
  const [message, setMessage] = useState("")
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !message) return

    setStatus("loading")

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, message }),
      })

      if (!res.ok) throw new Error("Failed")

      setStatus("success")
      setEmail("")
      setMessage("")
      
      // Reset success message after 5 seconds
      setTimeout(() => setStatus("idle"), 5000)
    } catch {
      setStatus("error")
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <Input 
        placeholder={t("Din e-post", "Your email")} 
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-400"
        required
        disabled={status === "loading" || status === "success"}
      />
      
      <Textarea 
        placeholder={t("Ditt meddelande", "Your message")} 
        rows={3}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-400 resize-none"
        required
        disabled={status === "loading" || status === "success"}
      />

      <Button 
        type="submit" 
        className={`w-full ${status === "success" ? "bg-green-600 hover:bg-green-700" : "bg-blue-600 hover:bg-blue-700"}`}
        disabled={status === "loading" || status === "success"}
      >
        {status === "loading" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {status === "success" && <CheckCircle className="mr-2 h-4 w-4" />}
        {status === "error" && <AlertCircle className="mr-2 h-4 w-4" />}
        
        {status === "loading" ? t("Skickar...", "Sending...") : 
         status === "success" ? t("Skickat!", "Sent!") : 
         status === "error" ? t("Försök igen", "Try again") : 
         t("Skicka meddelande", "Send message")}
      </Button>
    </form>
  )
}
