"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLanguage } from "@/components/i18n/LanguageProvider";

export default function TermsPageClient() {
  const { t } = useLanguage();

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 px-4 py-12">
      <div className="mx-auto max-w-4xl">
        <Card className="rounded-2xl border border-slate-200 shadow-lg">
          <CardHeader className="rounded-t-2xl border-b bg-slate-50">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">JobbNu</p>
            <CardTitle className="mt-1 text-3xl font-semibold text-slate-900">
              {t("Användarvillkor", "Terms of Service")}
            </CardTitle>
            <p className="mt-1 text-sm text-slate-500">
              {t("Senast uppdaterad:", "Last updated:")} <span className="font-medium">2026-03-26</span>
            </p>
          </CardHeader>

          <CardContent className="prose prose-slate max-w-none space-y-6 pt-6">
            <p>
              {t(
                "Dessa villkor gäller när du använder JobbNu för CV-generering, jobbmatchning, ansökningshjälp, e-postanslutning och relaterade funktioner.",
                "These terms apply when you use JobbNu for CV generation, job matching, application assistance, email connection and related features."
              )}
            </p>

            <h3>{t("1. Tjänsten", "1. The service")}</h3>
            <p>
              {t(
                "JobbNu hjälper användare att skapa CV, matcha mot jobb, generera ansökningsmaterial och, om användaren själv väljer det, skicka ansökningsmejl via anslutet Gmail- eller Outlook-konto.",
                "JobbNu helps users create CVs, match against jobs, generate application materials and, if the user chooses to do so, send application emails through a connected Gmail or Outlook account."
              )}
            </p>

            <h3>{t("2. Ditt ansvar", "2. Your responsibilities")}</h3>
            <ul>
              <li>
                {t(
                  "Du ansvarar för att uppgifterna du lämnar är korrekta och att du har rätt att använda dem.",
                  "You are responsible for ensuring that the information you provide is accurate and that you have the right to use it."
                )}
              </li>
              <li>
                {t(
                  "Du ansvarar för att granska ansökningsmejl, personliga brev och annat material innan du skickar eller använder det.",
                  "You are responsible for reviewing application emails, cover letters and other materials before you send or use them."
                )}
              </li>
              <li>
                {t(
                  "Du får inte använda tjänsten för spam, vilseledande ansökningar eller olagligt innehåll.",
                  "You may not use the service for spam, misleading applications or unlawful content."
                )}
              </li>
            </ul>

            <h3>{t("3. E-post via din egen mailbox", "3. Email through your own mailbox")}</h3>
            <p>
              {t(
                "Om du ansluter Gmail eller Outlook använder JobbNu endast behörigheter som behövs för att skicka e-post på ditt initiativ. JobbNu ska inte läsa din inkorg för denna funktion. E-post skickas först när du själv väljer att genomföra åtgärden.",
                "If you connect Gmail or Outlook, JobbNu uses only the permissions required to send email on your initiative. JobbNu is not intended to read your inbox for this feature. Email is only sent after you explicitly choose to complete the action."
              )}
            </p>

            <h3>{t("4. Jobbmatchning och AI-genererat material", "4. Job matching and AI-generated materials")}</h3>
            <p>
              {t(
                "Matchningar, rekommendationer, personliga brev, e-postutkast och intervjuförberedelser genereras med hjälp av automatiserade system och AI-baserad analys. Resultaten är hjälpmedel och inte en garanti för intervju, anställning eller korrekt bedömning i varje enskilt fall.",
                "Matches, recommendations, cover letters, email drafts and interview preparation are generated using automated systems and AI-based analysis. The results are tools to assist you and do not guarantee an interview, employment or a correct assessment in every individual case."
              )}
            </p>

            <h3>{t("5. Betalningar", "5. Payments")}</h3>
            <p>
              {t(
                "Betalningar för JobbNus produkter och abonnemang hanteras via externa betalningsleverantörer. Pris, bindningstid och vad som ingår framgår vid köptillfället.",
                "Payments for JobbNu products and subscriptions are handled by external payment providers. Pricing, commitment period and what is included are shown at the time of purchase."
              )}
            </p>

            <h3>{t("6. Tillgänglighet", "6. Availability")}</h3>
            <p>
              {t(
                "Vi strävar efter hög tillgänglighet men kan inte garantera att tjänsten alltid är fri från avbrott, förseningar eller fel hos tredjepartsleverantörer.",
                "We strive for high availability but cannot guarantee that the service will always be free from interruptions, delays or third-party provider errors."
              )}
            </p>

            <h3>{t("7. Personuppgifter", "7. Personal data")}</h3>
            <p>
              {t("Hur vi behandlar personuppgifter beskrivs i vår", "How we process personal data is described in our")}{" "}
              <Link href="/integritetspolicy">integritetspolicy</Link>.
            </p>

            <h3>{t("8. Kontakt", "8. Contact")}</h3>
            <p>
              {t("Frågor om tjänsten eller dessa villkor skickas till", "Questions about the service or these terms can be sent to")}{" "}
              <a href="mailto:info@jobbnu.se">info@jobbnu.se</a>.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
