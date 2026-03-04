"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useLanguage } from "@/components/i18n/LanguageProvider"
import { CvPreview, LetterPreview } from "@/components/cv/CvPreview"
import type { MultiLetterResult } from "@/lib/cvGenerator"

type OrderStatus = {
  id: string
  status: string
  packageFlow: string
  generationStatus: string | null
  generatedCv: string | null
  generatedLetter: string | null
  name: string | null
}

function parseMultiLetters(raw: string): MultiLetterResult[] | null {
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed[0]?.letter) return parsed as MultiLetterResult[]
    return null
  } catch {
    return null
  }
}

export default function SuccessClient({
  sessionId,
  documentOrderId,
}: {
  sessionId: string | null
  documentOrderId: string | null
}) {
  const { t } = useLanguage()
  const [order, setOrder] = useState<OrderStatus | null>(null)
  const [pollError, setPollError] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!documentOrderId) return

    const poll = async () => {
      try {
        const res = await fetch(`/api/orders/status?id=${documentOrderId}`)
        if (!res.ok) { setPollError(true); return }
        const data: OrderStatus = await res.json()
        setOrder(data)

        const done = data.generationStatus === "done" || data.generationStatus === "error"
        if (done && intervalRef.current) {
          clearInterval(intervalRef.current)
          intervalRef.current = null
        }
      } catch {
        setPollError(true)
      }
    }

    void poll() // immediate first check
    intervalRef.current = setInterval(poll, 5000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [documentOrderId])

  const isGenerating = !order || (order.generationStatus !== "done" && order.generationStatus !== "error")
  const hasContent = order?.generationStatus === "done"
  const isLetterOnly = order?.packageFlow === "letter_intake"

  // Multi-letter or single letter
  const multiLetters = order?.generatedLetter ? parseMultiLetters(order.generatedLetter) : null
  const singleLetter = !multiLetters && order?.generatedLetter ? order.generatedLetter : null

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top status bar */}
      <div className="bg-white border-b border-slate-200 px-4 py-4">
        <div className="mx-auto max-w-3xl flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-green-700">
              {t("Tack för din beställning!", "Thank you for your order!")}
            </h1>
            <p className="text-sm text-slate-600">
              {isGenerating
                ? t("Skapar ditt dokument...", "Creating your document...")
                : hasContent
                ? t("Ditt dokument är klart!", "Your document is ready!")
                : t("Något gick fel vid generering. Kontakta oss.", "Something went wrong during generation. Contact us.")}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {documentOrderId && (
              <Link href="/orders" className="text-xs text-blue-600 hover:underline">
                {t("Mina beställningar", "My orders")}
              </Link>
            )}
            <Link href="/" className="text-xs text-slate-500 hover:underline">
              {t("Startsidan", "Home")}
            </Link>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 py-8 space-y-8">

        {/* Generating spinner */}
        {documentOrderId && isGenerating && !pollError && (
          <div className="rounded-xl border border-blue-100 bg-blue-50 px-6 py-8 text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600 mb-4" />
            <p className="text-sm font-medium text-blue-800">
              {t("AI:n skapar ditt dokument – brukar ta 20–40 sekunder.", "AI is creating your document – usually takes 20–40 seconds.")}
            </p>
            <p className="text-xs text-blue-500 mt-1">
              {t("Sidan uppdateras automatiskt.", "Page updates automatically.")}
            </p>
          </div>
        )}

        {/* Poll error fallback */}
        {pollError && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-5 text-sm text-amber-800">
            {t(
              "Vi kan inte hämta statusen just nu. Ditt dokument genereras i bakgrunden och du kan se det under Mina beställningar.",
              "We cannot fetch the status right now. Your document is generating in the background and will appear under My orders."
            )}
          </div>
        )}

        {/* No document_order_id (e.g. booking) */}
        {!documentOrderId && (
          <div className="rounded-xl border border-slate-200 bg-white px-6 py-8 text-center text-slate-600 text-sm">
            {t(
              "Betalning mottagen. Vi kontaktar dig via e-post inom 24 timmar.",
              "Payment received. We will contact you by email within 24 hours."
            )}
          </div>
        )}

        {/* CV output */}
        {hasContent && !isLetterOnly && order?.generatedCv && (
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-slate-800">
              {t("Ditt CV", "Your CV")}
              <span className="ml-2 text-xs font-normal text-slate-400">
                {t("Skriv ut (Ctrl+P) för att spara som PDF", "Print (Ctrl+P) to save as PDF")}
              </span>
            </h2>
            <CvPreview raw={order.generatedCv} className="rounded-xl overflow-hidden border border-slate-200" />
          </section>
        )}

        {/* Letter output — single */}
        {hasContent && singleLetter && (
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-slate-800">
              {t("Personligt brev", "Cover letter")}
            </h2>
            <LetterPreview raw={singleLetter} className="rounded-xl overflow-hidden border border-slate-200" />
          </section>
        )}

        {/* Letter output — multi-job */}
        {hasContent && multiLetters && (
          <section className="space-y-6">
            <h2 className="text-base font-semibold text-slate-800">
              {t(`${multiLetters.length} personliga brev`, `${multiLetters.length} cover letters`)}
            </h2>
            {multiLetters.map((item, i) => (
              <div key={i} className="space-y-2">
                <p className="text-sm font-medium text-slate-700">
                  {item.headline || t(`Brev ${i + 1}`, `Letter ${i + 1}`)}
                  {item.company ? ` — ${item.company}` : ""}
                </p>
                <LetterPreview raw={item.letter} className="rounded-xl overflow-hidden border border-slate-200" />
              </div>
            ))}
          </section>
        )}

        {/* Reference IDs */}
        {(documentOrderId || sessionId) && (
          <div className="rounded-md border border-slate-200 bg-white p-3 text-xs text-slate-500 space-y-0.5">
            <p className="font-medium text-slate-600">{t("Referens", "Reference")}</p>
            {documentOrderId && <p>Order: {documentOrderId}</p>}
            {sessionId && <p>Session: {sessionId}</p>}
          </div>
        )}

      </div>
    </div>
  )
}
