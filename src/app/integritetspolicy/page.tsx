"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLanguage } from "@/components/i18n/LanguageProvider";

export default function PrivacyPolicy() {
  const { t } = useLanguage();

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 px-4 py-12">
      <div className="container mx-auto max-w-4xl">
        <Card className="rounded-2xl border border-slate-200 shadow-lg">
          <CardHeader className="rounded-t-2xl border-b bg-slate-50">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {t("JobbNu", "JobbNu")}
                </p>
                <CardTitle className="mt-1 text-3xl font-semibold text-slate-900">
                  {t("Integritetspolicy & Dataskydd", "Privacy Policy & Data Protection")}
                </CardTitle>
                <p className="mt-1 text-sm text-slate-500">
                  {t("Senast uppdaterad:", "Last updated:")}{" "}
                  <span className="font-medium">2026-03-25</span>
                </p>
              </div>

              <div className="hidden flex-col items-end text-right text-xs text-slate-500 sm:flex">
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

          <CardContent className="prose prose-slate max-w-none space-y-6 pt-6 prose-headings:scroll-mt-24">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              <p className="mb-1 font-medium">{t("Kort sammanfattning", "Short summary")}</p>
              <ul className="list-disc space-y-1 pl-5">
                <li>
                  {t(
                    "Dina uppgifter används främst för att bygga din profil, matcha dig mot relevanta jobb och hjälpa dig i din jobbsökning.",
                    "Your data is mainly used to build your profile, match you to relevant jobs, and help you in your job search."
                  )}
                </li>
                <li>
                  {t(
                    "Din profil används inte i interna kandidat- eller rekryterarsökningar om du inte lämnar ett separat frivilligt samtycke.",
                    "Your profile is not used in internal candidate or recruiter searches unless you provide separate optional consent."
                  )}
                </li>
                <li>
                  {t(
                    "Vi säljer aldrig personuppgifter. Du kan när som helst begära utdrag, rättelse eller radering av dina uppgifter.",
                    "We never sell personal data. You can request access, correction or deletion of your data at any time."
                  )}
                </li>
              </ul>
            </div>

            <p>
              {t(
                "Denna integritetspolicy beskriver hur vi samlar in, behandlar och skyddar dina personuppgifter när du använder JobbNu. Vi följer EU:s dataskyddsförordning (GDPR), svensk dataskyddslagstiftning samt god branschpraxis för hantering av jobb- och karriärrelaterad information.",
                "This privacy policy describes how we collect, process and protect your personal data when you use JobbNu. We follow the EU General Data Protection Regulation (GDPR), applicable Swedish data protection law, and good industry practice for handling job- and career-related information."
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
                "Vi är personuppgiftsansvariga för den information du skickar in via tjänsten och ansvarar för att behandlingen sker lagligt, korrekt och säkert.",
                "We are the data controller for the information you submit through the service and are responsible for ensuring that processing is lawful, correct and secure."
              )}
            </p>

            <h3>{t("2. Vilka personuppgifter vi behandlar", "2. What personal data we process")}</h3>
            <p>
              {t(
                "För att kunna erbjuda jobbrekommendationer, profilanalys, dokumentgenerering och ansökningshjälp samlar vi endast in de uppgifter som är nödvändiga för ändamålet. Det kan inkludera:",
                "To provide job recommendations, profile analysis, document generation and application assistance, we only collect the data necessary for that purpose. This may include:"
              )}
            </p>

            <h4>{t("2.1 Kontakt- och kontouppgifter", "2.1 Contact and account details")}</h4>
            <ul className="list-disc space-y-1 pl-5">
              <li>{t("Namn", "Name")}</li>
              <li>{t("E-postadress", "Email address")}</li>
              <li>{t("Telefonnummer", "Phone number")}</li>
              <li>{t("Adress (valfritt)", "Address (optional)")}</li>
            </ul>

            <h4>{t("2.2 Jobb- och kompetensdata", "2.2 Job and skills data")}</h4>
            <ul className="list-disc space-y-1 pl-5">
              <li>{t("Ditt CV och andra uppladdade dokument", "Your CV and other uploaded documents")}</li>
              <li>{t("Arbetslivserfarenhet", "Work experience")}</li>
              <li>{t("Utbildning", "Education")}</li>
              <li>{t("Kompetenser, certifikat och övriga uppgifter du själv väljer att lämna", "Skills, certifications and other information you choose to provide")}</li>
            </ul>

            <h4>{t("2.3 Preferenser och matchningsdata", "2.3 Preferences and matching data")}</h4>
            <ul className="list-disc space-y-1 pl-5">
              <li>{t("Önskad roll, arbetsplats, lön, arbetsmiljö och geografiska preferenser", "Preferred role, workplace, salary, work environment and geographic preferences")}</li>
              <li>{t("Dina svar i vår profilanalys", "Your responses in our profile analysis")}</li>
              <li>{t("AI-genererade matchningar, rekommendationer och ansökningsunderlag", "AI-generated matches, recommendations and application materials")}</li>
            </ul>

            <h4>{t("2.4 E-post- och ansökningsdata", "2.4 Email and application data")}</h4>
            <ul className="list-disc space-y-1 pl-5">
              <li>{t("Information om anslutet Gmail- eller Outlook-konto om du själv väljer att ansluta det", "Information about a connected Gmail or Outlook account if you choose to connect it")}</li>
              <li>{t("Ansökningsutkast, personliga brev, intervjuförberedelser och relaterad metadata", "Application drafts, cover letters, interview preparation content and related metadata")}</li>
              <li>{t("Information om jobb du sparar, ansöker till eller markerar som skickade", "Information about jobs you save, apply to or mark as submitted")}</li>
            </ul>

            <h4>{t("2.5 Teknisk data", "2.5 Technical data")}</h4>
            <ul className="list-disc space-y-1 pl-5">
              <li>{t("IP-adress", "IP address")}</li>
              <li>{t("Webbläsare och enhet", "Browser and device")}</li>
              <li>{t("Loggar och användarbeteenden i tjänsten för säkerhet, förbättring och felsökning", "Logs and usage behavior in the service for security, improvement and troubleshooting")}</li>
            </ul>

            <h3>{t("3. Ändamål med behandlingen", "3. Purposes of processing")}</h3>
            <p>{t("Vi behandlar dina uppgifter för att kunna:", "We process your data in order to:")}</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>{t("Bygga och lagra din kandidatprofil.", "Build and store your candidate profile.")}</li>
              <li>{t("Matcha din profil mot relevanta jobb med hjälp av AI-baserad analys, kategorisering och vektorisering.", "Match your profile to relevant jobs using AI-based analysis, categorisation and vectorisation.")}</li>
              <li>{t("Generera CV, personliga brev, ansökningsmail och intervjuförberedelser när du använder sådana funktioner.", "Generate CVs, cover letters, application emails and interview preparation when you use those features.")}</li>
              <li>{t("Hjälpa dig att ansöka till jobb, till exempel genom e-postutkast, ansökningsstatus och anslutning till din egen e-postleverantör om du väljer det.", "Help you apply to jobs, for example through email drafts, application status and connection to your own email provider if you choose to do so.")}</li>
              <li>{t("Kommunicera med dig om tjänsten, supportärenden och relevanta jobbförslag.", "Communicate with you about the service, support matters and relevant job suggestions.")}</li>
              <li>{t("Förbättra tjänstens funktionalitet, säkerhet, loggning, felsökning och statistik.", "Improve the functionality, security, logging, troubleshooting and statistics of the service.")}</li>
              <li>{t("Fullgöra rättsliga skyldigheter.", "Comply with legal obligations.")}</li>
            </ul>

            <h3>{t("4. Rättslig grund", "4. Legal basis")}</h3>
            <p>{t("Vi behandlar dina personuppgifter baserat på följande grunder:", "We process your personal data based on the following legal bases:")}</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <strong>{t("Avtal (GDPR Art. 6.1.b):", "Contract (GDPR Art. 6.1.b):")}</strong>{" "}
                {t(
                  "När du skapar profil, laddar upp CV eller använder våra jobbsökningsfunktioner behandlar vi dina uppgifter för att kunna leverera den tjänst du begär.",
                  "When you create a profile, upload a CV or use our job-search features, we process your data in order to deliver the service you request."
                )}
              </li>
              <li>
                <strong>{t("Samtycke (GDPR Art. 6.1.a):", "Consent (GDPR Art. 6.1.a):")}</strong>{" "}
                {t(
                  "För frivilliga funktioner, till exempel om du vill att din profil ska kunna användas i interna kandidat- eller rekryterarsökningar, eller om du lämnar separat samtycke till marknadsföring.",
                  "For optional features, such as allowing your profile to be used in internal candidate or recruiter searches, or where you provide separate consent for marketing."
                )}
              </li>
              <li>
                <strong>{t("Berättigat intresse (GDPR Art. 6.1.f):", "Legitimate interest (GDPR Art. 6.1.f):")}</strong>{" "}
                {t(
                  "För säkerhet, drift, missbruksförebyggande arbete och förbättring av plattformen.",
                  "For security, operations, abuse prevention and improvement of the platform."
                )}
              </li>
            </ul>
            <p>
              {t(
                "Vi använder inte dina uppgifter för marknadsföring utan separat samtycke. Tjänsterelaterad kommunikation, till exempel information om din profil, jobbförslag, driftstörningar eller support, är inte marknadsföring.",
                "We do not use your data for marketing without separate consent. Service-related communication, such as information about your profile, job suggestions, operational notices or support, is not considered marketing."
              )}
            </p>

            <h3>{t("5. Separata samtycken", "5. Separate consents")}</h3>
            <ul className="list-disc space-y-1 pl-5">
              <li>{t("Det samtycke du lämnar när du sparar din profil avser endast matchningskriterier, relevanta jobbförslag och den kärnfunktionalitet som krävs för att tjänsten ska fungera.", "The consent you provide when saving your profile only covers matching criteria, relevant job suggestions and the core functionality required for the service to work.")}</li>
              <li>{t("Om du dessutom kryssar i den frivilliga rutan på profilsidan kan din profil användas i interna sökningar för att hitta relevanta kandidater till jobb eller rekryteringsförfrågningar.", "If you also tick the optional checkbox on the profile page, your profile may be used in internal searches to identify relevant candidates for jobs or recruiter requests.")}</li>
              <li>{t("Du kan återkalla frivilliga samtycken när som helst utan att det påverkar den grundläggande matchningstjänsten.", "You can withdraw optional consents at any time without affecting the basic matching service.")}</li>
            </ul>

            <h3>{t("6. Lagring och säkerhet", "6. Storage and security")}</h3>
            <p>{t("Vi tar tekniska och organisatoriska åtgärder för att skydda dina uppgifter enligt GDPR Art. 32.", "We take technical and organizational measures to protect your data in accordance with GDPR Art. 32.")}</p>

            <h4>{t("Databas och filhantering", "Database and file handling")}</h4>
            <ul className="list-disc space-y-1 pl-5">
              <li>{t("Vi använder Supabase, driftat i Frankfurt, för databas, autentisering och lagring.", "We use Supabase, hosted in Frankfurt, for database, authentication and storage.")}</li>
              <li>{t("CV:n och andra dokument lagras krypterat och skyddas med Row Level Security.", "CVs and other documents are stored encrypted and protected by Row Level Security.")}</li>
            </ul>

            <h4>{t("Åtkomst", "Access")}</h4>
            <ul className="list-disc space-y-1 pl-5">
              <li>{t("Endast behörig administratör eller tekniskt behöriga system har åtkomst till fullständiga användaruppgifter när det krävs för drift, support eller säkerhet.", "Only the authorized administrator or technically authorised systems have access to complete user data when required for operations, support or security.")}</li>
              <li>{t("Åtkomst loggas och kontrolleras i rimlig omfattning.", "Access is logged and monitored to a reasonable extent.")}</li>
            </ul>

            <h4>{t("Delning med arbetsgivare eller rekryterare", "Sharing with employers or recruiters")}</h4>
            <ul className="list-disc space-y-1 pl-5">
              <li>{t("Vi delar inte din profil med arbetsgivare eller rekryterare utan rättslig grund och, där det krävs, ditt uttryckliga godkännande.", "We do not share your profile with employers or recruiters without a lawful basis and, where required, your explicit approval.")}</li>
              <li>{t("Vi säljer aldrig personuppgifter till tredje part.", "We never sell personal data to third parties.")}</li>
            </ul>

            <h4>{t("Tredjepartsleverantörer och underbiträden", "Third-party providers and subprocessors")}</h4>
            <ul className="list-disc space-y-1 pl-5">
              <li>{t("Supabase används för databas, autentisering och filhantering.", "Supabase is used for database, authentication and file handling.")}</li>
              <li>{t("Stripe används för betalningar.", "Stripe is used for payments.")}</li>
              <li>{t("Om du ansluter Gmail eller Outlook används respektive leverantör för att skicka e-post från ditt eget konto.", "If you connect Gmail or Outlook, the respective provider is used to send email from your own account.")}</li>
              <li>{t("Vi kan använda AI-leverantörer för att analysera CV:n, jobbannonser och skapa ansökningsunderlag. Sådana leverantörer behandlar då endast data i den utsträckning som krävs för funktionen.", "We may use AI providers to analyse CVs, job ads and generate application materials. Such providers then process data only to the extent required for the feature.")}</li>
            </ul>

            <h3>{t("7. Hur länge vi sparar data", "7. How long we store data")}</h3>
            <p>{t("Vi sparar dina uppgifter så länge du använder tjänsten eller tills du ber oss radera dem.", "We store your data for as long as you use the service or until you ask us to delete it.")}</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>{t("Om du är inaktiv i 24 månader kan kontot raderas automatiskt efter rimlig förvarning.", "If you are inactive for 24 months, the account may be deleted automatically after reasonable prior notice.")}</li>
              <li>{t("Tvingande lagar, till exempel bokföringsregler, kan kräva vissa lagringstider för betalningsinformation. Då lagras inte CV eller annat karriärmaterial tillsammans med dessa uppgifter.", "Mandatory laws, such as bookkeeping rules, may require retention periods for payment information. In such cases, CVs and other career materials are not stored together with that information.")}</li>
            </ul>

            <h3>{t("8. Dina rättigheter enligt GDPR", "8. Your rights under GDPR")}</h3>
            <p>{t("Du har rätt att:", "You have the right to:")}</p>
            <ul className="list-disc space-y-1 pl-5">
              <li><strong>{t("Få tillgång till dina uppgifter (registerutdrag):", "Access your data:")}</strong> {t("Vi tillhandahåller den data vi har om dig.", "We provide the data we hold about you.")}</li>
              <li><strong>{t("Få felaktiga uppgifter rättade.", "Have inaccurate data corrected.")}</strong></li>
              <li><strong>{t('Få dina uppgifter raderade ("rätten att bli bortglömd").', 'Have your data deleted ("right to be forgotten").')}</strong></li>
              <li><strong>{t("Återkalla samtycke.", "Withdraw consent.")}</strong></li>
              <li><strong>{t("Begära dataportabilitet.", "Request data portability.")}</strong></li>
              <li><strong>{t("Begränsa behandling.", "Restrict processing.")}</strong></li>
            </ul>
            <p>
              {t("För att utöva någon av dessa rättigheter, kontakta oss på", "To exercise any of these rights, contact us at")}{" "}
              <a href="mailto:info@jobbnu.se" className="text-blue-600 hover:underline">
                info@jobbnu.se
              </a>
              .
            </p>

            <h3>{t("9. Cookies", "9. Cookies")}</h3>
            <p>{t("Vi använder endast nödvändiga cookies för funktionalitet, inloggning och säkerhet. Ingen marknadsföring eller spårning sker utan separat samtycke.", "We only use necessary cookies for functionality, login and security. No marketing or tracking is performed without separate consent.")}</p>

            <h3>{t("10. Överföring till tredjeland", "10. Transfers to third countries")}</h3>
            <p>{t("Vi strävar efter att lagra och behandla så mycket data som möjligt inom EU/EES. Vissa leverantörer eller AI-tjänster kan dock innebära behandling utanför EU/EES. Om det sker använder vi lämpliga skyddsåtgärder enligt GDPR kapitel V, till exempel EU-kommissionens standardavtalsklausuler eller annan laglig överföringsmekanism.", "We aim to store and process as much data as possible within the EU/EEA. However, some providers or AI services may involve processing outside the EU/EEA. Where this happens, we use appropriate safeguards under GDPR Chapter V, such as the EU Commission's Standard Contractual Clauses or another lawful transfer mechanism.")}</p>

            <h3>{t("11. Ändringar i policyn", "11. Changes to this policy")}</h3>
            <p>{t("Vi kan uppdatera denna integritetspolicy vid behov. Vid större ändringar informeras du via e-post eller på webbplatsen. Senaste uppdateringsdatum anges överst.", "We may update this privacy policy when needed. For major changes, you will be informed by email or on the website. The latest update date is shown at the top.")}</p>

            <h3>{t("12. Kontaktuppgifter till tillsynsmyndighet", "12. Supervisory authority contact details")}</h3>
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

            <h3>{t("13. Marknadsföring & kommunikation", "13. Marketing & communication")}</h3>
            <p>
              {t(
                "Vi kan i framtiden erbjuda relaterade tjänster, till exempel karriärtjänster eller samarbeten med rekryterare. Sådan kommunikation räknas som marknadsföring och skickas endast om du aktivt lämnat ett separat samtycke.",
                "We may in the future offer related services, such as career services or collaborations with recruiters. Such communication is considered marketing and is only sent if you have actively given separate consent."
              )}
            </p>
            <p>
              {t("Du kan när som helst återkalla ditt marknadsföringssamtycke genom att kontakta oss på", "You can withdraw your marketing consent at any time by contacting us at")}{" "}
              <a href="mailto:info@jobbnu.se" className="text-blue-600 hover:underline">
                info@jobbnu.se
              </a>
              .{" "}
              {t(
                "Återkallelse påverkar inte behandling som redan skett innan samtycket drogs tillbaka.",
                "Withdrawal does not affect processing already carried out before the consent was withdrawn."
              )}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
