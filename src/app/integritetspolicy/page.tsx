"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLanguage } from "@/components/i18n/LanguageProvider";

export default function PrivacyPolicy() {
  const { t } = useLanguage();

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 py-12 px-4">
      <div className="container mx-auto max-w-4xl">
        <Card className="rounded-2xl border border-slate-200 shadow-lg">
          <CardHeader className="border-b bg-slate-50 rounded-t-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {t("CV-Hjälp", "CV Help")}
                </p>
                <CardTitle className="mt-1 text-3xl font-semibold text-slate-900">
                  {t("Integritetspolicy & Dataskydd", "Privacy Policy & Data Protection")}
                </CardTitle>
                <p className="mt-1 text-sm text-slate-500">
                  {t("Senast uppdaterad:", "Last updated:")}{" "}
                  <span className="font-medium">2025-11-22</span>
                </p>
              </div>

              <div className="hidden sm:flex flex-col items-end text-right text-xs text-slate-500">
                <span className="inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-white px-3 py-1">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  {t("GDPR-anpassad hantering", "GDPR-aligned handling")}
                </span>
                <span className="mt-2">
                  {t("Personuppgiftsansvarig:", "Data controller:")}{" "}
                  <span className="font-medium">Nikola Dragicevic</span>
                </span>
              </div>
            </div>
          </CardHeader>

          <CardContent className="prose prose-slate max-w-none prose-headings:scroll-mt-24 space-y-6 pt-6">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              <p className="mb-1 font-medium">{t("Kort sammanfattning", "Short summary")}</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>{t("Dina uppgifter används för jobbanalys, matchning och kontakt kring tjänsten.", "Your data is used for job analysis, matching and service-related contact.")}</li>
                <li>{t("Vi säljer inte vidare personuppgifter och delar endast med arbetsgivare efter ditt godkännande.", "We do not sell personal data and only share with employers after your approval.")}</li>
                <li>{t("Du kan när som helst begära utdrag, rättelse eller radering av dina uppgifter.", "You can request access, correction or deletion of your data at any time.")}</li>
              </ul>
            </div>

            <p>
              {t(
                "Denna integritetspolicy beskriver hur vi samlar in, behandlar och skyddar dina personuppgifter när du använder tjänsten. Vi följer EU:s dataskyddsförordning (GDPR), svensk dataskyddslagstiftning samt god branschpraxis för hantering av känslig jobb- och karriärinformation.",
                "This privacy policy describes how we collect, process and protect your personal data when you use the service. We follow the EU General Data Protection Regulation (GDPR), applicable Swedish data protection law, and good industry practice for handling sensitive job and career information."
              )}
            </p>

            <h3>{t("1. Personuppgiftsansvarig", "1. Data controller")}</h3>
            <p>
              {t("Tjänsten tillhandahålls av:", "The service is provided by:")}
              <br />
              <strong>Nikola Dragicevic</strong>
              <br />
              {t("E-post:", "Email:")}{" "}
              <a href="mailto:info@jobbnu.se" className="text-blue-600 hover:underline">
                info@jobbnu.se
              </a>
            </p>
            <p>
              {t(
                "Vi är personuppgiftsansvariga för den data du skickar in via tjänsten och ansvarar för att behandlingen sker lagligt, korrekt och säkert.",
                "We are the data controller for the information you submit through the service and are responsible for ensuring that processing is lawful, correct and secure."
              )}
            </p>

            <h3>{t("2. Vilka personuppgifter vi behandlar", "2. What personal data we process")}</h3>
            <p>
              {t(
                "För att kunna erbjuda jobbrekommendationer, profilanalys och matchning samlar vi endast in de uppgifter som är nödvändiga för ändamålet. Det kan inkludera:",
                "To provide job recommendations, profile analysis and matching, we only collect data necessary for the purpose. This may include:"
              )}
            </p>

            <h4>{t("2.1 Kontakt- och kontouppgifter", "2.1 Contact and account details")}</h4>
            <ul className="list-disc pl-5 space-y-1">
              <li>{t("Namn", "Name")}</li>
              <li>{t("E-postadress", "Email address")}</li>
              <li>{t("Telefonnummer", "Phone number")}</li>
              <li>{t("Adress (valfritt)", "Address (optional)")}</li>
            </ul>

            <h4>{t("2.2 Jobb- och kompetensdata", "2.2 Job and skills data")}</h4>
            <ul className="list-disc pl-5 space-y-1">
              <li>{t("Ditt CV", "Your CV")}</li>
              <li>{t("Arbetslivserfarenhet", "Work experience")}</li>
              <li>{t("Utbildning", "Education")}</li>
              <li>{t("Kompetenser och certifikat", "Skills and certifications")}</li>
              <li>{t("Övriga uppgifter du själv väljer att lämna", "Other information you choose to provide")}</li>
            </ul>

            <h4>{t("2.3 Preferenser och matchningsdata", "2.3 Preferences and matching data")}</h4>
            <ul className="list-disc pl-5 space-y-1">
              <li>{t("Önskad roll, arbetsplats, lön och arbetsmiljö", "Preferred role, workplace, salary and work environment")}</li>
              <li>{t("Dina inmatade svar i vår profilanalys", "Your responses in our profile analysis")}</li>
              <li>{t("AI-genererade rekommendationer", "AI-generated recommendations")}</li>
            </ul>

            <h4>{t("2.4 Teknisk data", "2.4 Technical data")}</h4>
            <ul className="list-disc pl-5 space-y-1">
              <li>{t("IP-adress", "IP address")}</li>
              <li>{t("Webbläsare och enhet", "Browser and device")}</li>
              <li>
                {t(
                  "Användarbeteenden i tjänsten (för förbättring, säkerhet och felsökning)",
                  "Usage behavior in the service (for improvement, security and troubleshooting)"
                )}
              </li>
            </ul>

            <h3>{t("3. Ändamål med behandlingen", "3. Purposes of processing")}</h3>
            <p>{t("Vi behandlar dina uppgifter för att kunna:", "We process your data in order to:")}</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>{t("Matcha din profil mot relevanta jobb med hjälp av AI-baserad analys och vektorisering.", "Match your profile to relevant jobs using AI-based analysis and vectorization.")}</li>
              <li>{t("Kommunicera med dig när det hittas passande tjänster.", "Communicate with you when suitable roles are found.")}</li>
              <li>{t("Tillhandahålla profilanalys, marknadsvärdering och råd.", "Provide profile analysis, market valuation and guidance.")}</li>
              <li>{t("Förbättra tjänstens funktionalitet (loggar, felsökning, statistik).", "Improve service functionality (logs, troubleshooting, statistics).")}</li>
              <li>{t("Fullgöra rättsliga skyldigheter enligt GDPR.", "Comply with legal obligations under GDPR.")}</li>
            </ul>
            <p>
              {t(
                "Vi behandlar aldrig dina uppgifter för ändamål som är oförenliga med dessa utan att först informera dig och, när så krävs, inhämta nytt samtycke.",
                "We never process your data for purposes incompatible with these without first informing you and, where required, obtaining new consent."
              )}
            </p>

            <h3>{t("4. Rättslig grund", "4. Legal basis")}</h3>
            <p>{t("Vi behandlar dina personuppgifter baserat på följande grunder:", "We process your personal data based on the following legal bases:")}</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <strong>{t("Samtycke (GDPR Art. 6.1.a):", "Consent (GDPR Art. 6.1.a):")}</strong>{" "}
                {t(
                  "När du laddar upp ditt CV eller skapar en profil ger du ditt uttryckliga samtycke till att vi analyserar och matchar dina uppgifter.",
                  "When you upload your CV or create a profile, you give explicit consent for us to analyze and match your information."
                )}
              </li>
              <li>
                <strong>{t("Avtal (GDPR Art. 6.1.b):", "Contract (GDPR Art. 6.1.b):")}</strong>{" "}
                {t(
                  "Behandling som är nödvändig för att tillhandahålla den tjänst du efterfrågar.",
                  "Processing necessary to provide the service you request."
                )}
              </li>
              <li>
                <strong>{t("Berättigat intresse (GDPR Art. 6.1.f):", "Legitimate interest (GDPR Art. 6.1.f):")}</strong>{" "}
                {t("För utveckling, säkerhet och förbättring av plattformen.", "For development, security and improvement of the platform.")}
              </li>
            </ul>
            <p>
              {t(
                "Vi använder aldrig dina uppgifter för marknadsföring utan att du lämnat ett separat och uttryckligt samtycke. Tjänsterelaterad kommunikation – till exempel jobbförslag, information om din profil eller support – räknas inte som marknadsföring och kan skickas utan särskilt marknadsföringssamtycke.",
                "We never use your data for marketing without separate and explicit consent. Service-related communication, such as job suggestions, profile information or support, is not considered marketing and may be sent without separate marketing consent."
              )}
            </p>

            <h3>{t("5. Lagring och säkerhet", "5. Storage and security")}</h3>
            <p>{t("Vi vidtar tekniska och organisatoriska åtgärder för att skydda dina uppgifter enligt GDPR Art. 32.", "We take technical and organizational measures to protect your data in accordance with GDPR Art. 32.")}</p>

            <h4>{t("Databas och filhantering", "Database and file handling")}</h4>
            <ul className="list-disc pl-5 space-y-1">
              <li>{t("Alla uppgifter lagras inom EU/EES.", "All data is stored within the EU/EEA.")}</li>
              <li>{t("Vi använder Supabase, driftat i Frankfurt, som uppfyller GDPR-krav.", "We use Supabase, hosted in Frankfurt, which meets GDPR requirements.")}</li>
              <li>{t("CV:n och andra dokument lagras krypterat och skyddas med Row Level Security.", "CVs and other documents are stored encrypted and protected by Row Level Security.")}</li>
            </ul>

            <h4>{t("Åtkomst", "Access")}</h4>
            <ul className="list-disc pl-5 space-y-1">
              <li>{t("Endast behörig administratör (Nikola Dragicevic) har åtkomst till fullständiga användaruppgifter.", "Only the authorized administrator (Nikola Dragicevic) has access to complete user data.")}</li>
              <li>{t("Åtkomsten loggas och kontrolleras.", "Access is logged and monitored.")}</li>
            </ul>

            <h4>{t("Delning med arbetsgivare", "Sharing with employers")}</h4>
            <ul className="list-disc pl-5 space-y-1">
              <li>{t("Vi delar endast din profil med en arbetsgivare efter att du uttryckligen godkänt det.", "We only share your profile with an employer after you have explicitly approved it.")}</li>
              <li>{t("Vi säljer aldrig personuppgifter till tredje part.", "We never sell personal data to third parties.")}</li>
            </ul>

            <h3>{t("6. Hur länge vi sparar data", "6. How long we store data")}</h3>
            <p>{t("Vi sparar dina uppgifter så länge du använder tjänsten eller tills du ber oss radera dem.", "We store your data for as long as you use the service or until you ask us to delete it.")}</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>{t("Om du är inaktiv i 24 månader raderas kontot automatiskt, efter att du informerats i förväg.", "If you are inactive for 24 months, the account is automatically deleted after prior notice.")}</li>
              <li>{t("Tvingande lagar (t.ex. bokföringslagen) kan kräva vissa lagringstider för betalningsinformation – men då lagras inget CV eller annat karriärmaterial tillsammans med dessa uppgifter.", "Mandatory laws (e.g. bookkeeping rules) may require retention periods for payment information, but no CV or other career materials are stored together with that information.")}</li>
            </ul>

            <h3>{t("7. Dina rättigheter enligt GDPR", "7. Your rights under GDPR")}</h3>
            <p>{t("Du har rätt att:", "You have the right to:")}</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>{t("Få tillgång till dina uppgifter (registerutdrag):", "Access your data (data access request):")}</strong> {t("Vi skickar all data vi har om dig.", "We provide all data we hold about you.")}</li>
              <li><strong>{t("Få felaktiga uppgifter rättade.", "Have inaccurate data corrected.")}</strong></li>
              <li><strong>{t('Få dina uppgifter raderade ("rätten att bli bortglömd").', 'Have your data deleted ("right to be forgotten").')}</strong></li>
              <li><strong>{t("Återkalla samtycke:", "Withdraw consent:")}</strong> {t("Du kan när som helst dra tillbaka ett givet samtycke.", "You can withdraw any given consent at any time.")}</li>
              <li><strong>{t("Begära dataportabilitet:", "Request data portability:")}</strong> {t("Du kan få ut ditt CV och övriga uppgifter i maskinläsbart format.", "You can receive your CV and other data in a machine-readable format.")}</li>
              <li><strong>{t("Begränsa behandling:", "Restrict processing:")}</strong> {t("Till exempel om du vill pausa matchningen utan att ta bort ditt konto.", "For example, if you want to pause matching without deleting your account.")}</li>
            </ul>
            <p>
              {t("För att använda någon av dessa rättigheter, kontakta oss på", "To exercise any of these rights, contact us at")}{" "}
              <a href="mailto:info@jobbnu.se" className="text-blue-600 hover:underline">
                info@jobbnu.se
              </a>
              .
            </p>

            <h3>{t("8. Cookies", "8. Cookies")}</h3>
            <p>{t("Vi använder endast nödvändiga cookies för funktionalitet och säkerhet. Ingen marknadsföring eller spårning sker utan samtycke. Fullständig cookiepolicy finns i separat dokumentation.", "We only use necessary cookies for functionality and security. No marketing or tracking is performed without consent. A full cookie policy is available in separate documentation.")}</p>

            <h3>{t("9. Överföring till tredjeland", "9. Transfers to third countries")}</h3>
            <p>{t("All data behandlas inom EU/EES. Vi överför inte personuppgifter utanför EU/EES utan ditt samtycke och utan att säkerhetskraven enligt GDPR kapitel V är uppfyllda.", "All data is processed within the EU/EEA. We do not transfer personal data outside the EU/EEA without your consent and without the safeguards required under GDPR Chapter V.")}</p>

            <h3>{t("10. Ändringar i policyn", "10. Changes to this policy")}</h3>
            <p>{t("Vi kan uppdatera denna integritetspolicy vid behov. Vid större ändringar informeras du via e-post eller på webbplatsen. Senaste uppdateringsdatum anges överst.", "We may update this privacy policy when needed. For major changes, you will be informed by email or on the website. The latest update date is shown at the top.")}</p>

            <h3>{t("11. Kontaktuppgifter till tillsynsmyndighet", "11. Supervisory authority contact details")}</h3>
            <p>
              {t("Om du anser att vi hanterar dina data felaktigt kan du kontakta Integritetsskyddsmyndigheten (IMY) via", "If you believe we handle your data incorrectly, you can contact the Swedish Authority for Privacy Protection (IMY) via")}{" "}
              <a
                href="https://www.imy.se"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                www.imy.se
              </a>
              .
            </p>

            <h3>{t("12. Marknadsföring & kommunikation", "12. Marketing & communication")}</h3>
            <p>
              {t(
                "Vi kan i framtiden komma att erbjuda relaterade tjänster, till exempel karriärtjänster eller samarbeten med rekryterare. Sådan kommunikation räknas som marknadsföring och skickas endast om du aktivt lämnat ett separat samtycke, till exempel genom att kryssa i en ruta vid registrering.",
                "We may in the future offer related services, such as career services or collaborations with recruiters. Such communication is considered marketing and is only sent if you have actively given separate consent, for example by ticking a checkbox at registration."
              )}
            </p>
            <p>
              {t("Du kan när som helst återkalla ditt marknadsföringssamtycke via länkar i e-postmeddelanden eller genom att kontakta oss på", "You can withdraw your marketing consent at any time via links in emails or by contacting us at")}{" "}
              <a href="mailto:info@jobbnu.se" className="text-blue-600 hover:underline">
                info@jobbnu.se
              </a>
              .{" "}
              {t(
                "Återkallelse påverkar inte den behandling som skett innan samtycket drogs tillbaka.",
                "Withdrawal does not affect processing carried out before the consent was withdrawn."
              )}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
