"use client"

import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useLanguage } from "@/components/i18n/LanguageProvider"

export default function AiTransparencyPage() {
  const { t } = useLanguage()

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 px-4 py-12">
      <div className="mx-auto max-w-4xl">
        <Card className="rounded-2xl border border-slate-200 shadow-lg">
          <CardHeader className="rounded-t-2xl border-b bg-slate-50">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">JobbNu</p>
            <CardTitle className="mt-1 text-3xl font-semibold text-slate-900">
              {t("AI-transparens", "AI Transparency")}
            </CardTitle>
            <p className="mt-1 text-sm text-slate-500">
              {t(
                "Så använder JobbNu AI-tjänster i plattformen.",
                "How JobbNu uses AI services in the platform."
              )}
            </p>
          </CardHeader>

          <CardContent className="prose prose-slate max-w-none space-y-6 pt-6">
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-slate-700">
              <p className="mb-1 font-medium">{t("Kort version", "Short version")}</p>
              <p>
                {t(
                  "JobbNu använder Anthropic Claude för vissa generativa AI-funktioner, till exempel ansökningsmail, personliga brev, intervjuförberedelser och vissa analysfunktioner.",
                  "JobbNu uses Anthropic Claude for certain generative AI features, such as application emails, cover letters, interview preparation and some analysis features."
                )}
              </p>
            </div>

            <h3>{t("AI-tjänster som används", "AI services in use")}</h3>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <strong>Anthropic Claude</strong>:{" "}
                {t(
                  "används för att generera och förbättra vissa texter och analyser i JobbNu.",
                  "used to generate and improve certain texts and analyses in JobbNu."
                )}
              </li>
              <li>
                {t(
                  "Självhostade/lokala embedding-tjänster kan användas för matchning och kategorisering, men den här sidan finns främst för att tydligt informera om Anthropic Claude eftersom det är den externa AI-tjänst som används i generativa funktioner.",
                  "Self-hosted/local embedding services may be used for matching and categorisation, but this page primarily exists to clearly disclose Anthropic Claude because it is the external AI service used in generative features."
                )}
              </li>
            </ul>

            <h3>{t("Hur AI används i JobbNu", "How AI is used in JobbNu")}</h3>
            <ul className="list-disc space-y-1 pl-5">
              <li>{t("Generera ansökningsmail och personliga brev utifrån kandidatprofil och jobbannons.", "Generate application emails and cover letters based on the candidate profile and job ad.")}</li>
              <li>{t("Generera intervjuförberedelser och sammanfattningar för utvalda jobb.", "Generate interview preparation and summaries for selected jobs.")}</li>
              <li>{t("Analysera kandidat- och jobbdata för att förbättra matchningsupplevelsen.", "Analyse candidate and job data to improve the matching experience.")}</li>
            </ul>

            <h3>{t("Hur Gmail används", "How Gmail is used")}</h3>
            <p>
              {t(
                "Om du ansluter Gmail använder JobbNu endast behörigheten för att skicka e-post från ditt eget konto när du själv väljer att skicka ett granskat ansökningsmail.",
                "If you connect Gmail, JobbNu only uses the permission required to send email from your own account when you explicitly choose to send a reviewed application email."
              )}
            </p>
            <p>
              {t(
                "JobbNu är inte avsett att läsa eller analysera din inkorg för denna funktion.",
                "JobbNu is not intended to read or analyse your inbox for this feature."
              )}
            </p>

            <h3>{t("AI och dataskydd", "AI and data protection")}</h3>
            <p>
              {t(
                "JobbNu säljer inte personuppgifter och använder inte Google-användardata från Gmail-anslutningen för att träna egna modeller eller tredje parts grundmodeller.",
                "JobbNu does not sell personal data and does not use Google user data from the Gmail connection to train our own models or third-party foundation models."
              )}
            </p>

            <h3>{t("Relaterade länkar", "Related links")}</h3>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <Link href="/integritetspolicy">{t("Integritetspolicy", "Privacy Policy")}</Link>
              </li>
              <li>
                <Link href="/villkor">{t("Användarvillkor", "Terms of Service")}</Link>
              </li>
              <li>
                <Link href="/support">{t("Support", "Support")}</Link>
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
