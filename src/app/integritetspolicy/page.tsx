import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 py-12 px-4">
      <div className="container mx-auto max-w-4xl">
        <Card className="rounded-2xl border border-slate-200 shadow-lg">
          <CardHeader className="border-b bg-slate-50 rounded-t-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  CV-Hjälp
                </p>
                <CardTitle className="mt-1 text-3xl font-semibold text-slate-900">
                  Integritetspolicy &amp; Dataskydd
                </CardTitle>
                <p className="mt-1 text-sm text-slate-500">
                  Senast uppdaterad:{" "}
                  <span className="font-medium">2025-11-22</span>
                </p>
              </div>

              <div className="hidden sm:flex flex-col items-end text-right text-xs text-slate-500">
                <span className="inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-white px-3 py-1">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  GDPR-anpassad hantering
                </span>
                <span className="mt-2">
                  Personuppgiftsansvarig:{" "}
                  <span className="font-medium">Nikola Dragicevic</span>
                </span>
              </div>
            </div>
          </CardHeader>

          <CardContent className="prose prose-slate max-w-none prose-headings:scroll-mt-24 space-y-6 pt-6">
            {/* Summary / highlight box */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              <p className="mb-1 font-medium">Kort sammanfattning</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Dina uppgifter används för jobbanalys, matchning och kontakt kring tjänsten.</li>
                <li>Vi säljer inte vidare personuppgifter och delar endast med arbetsgivare efter ditt godkännande.</li>
                <li>Du kan när som helst begära utdrag, rättelse eller radering av dina uppgifter.</li>
              </ul>
            </div>

            <p>
              Denna integritetspolicy beskriver hur vi samlar in, behandlar och
              skyddar dina personuppgifter när du använder tjänsten. Vi följer
              EU:s dataskyddsförordning (GDPR), svensk dataskyddslagstiftning
              samt god branschpraxis för hantering av känslig jobb- och
              karriärinformation.
            </p>

            <h3>1. Personuppgiftsansvarig</h3>
            <p>
              Tjänsten tillhandahålls av:
              <br />
              <strong>Nikola Dragicevic</strong>
              <br />
              E-post:{" "}
              <a
                href="mailto:info@jobbnu.se"
                className="text-blue-600 hover:underline"
              >
                info@jobbnu.se
              </a>
            </p>
            <p>
              Vi är personuppgiftsansvariga för den data du skickar in via
              tjänsten och ansvarar för att behandlingen sker lagligt, korrekt
              och säkert.
            </p>

            <h3>2. Vilka personuppgifter vi behandlar</h3>
            <p>
              För att kunna erbjuda jobbrekommendationer, profilanalys och
              matchning samlar vi endast in de uppgifter som är nödvändiga för
              ändamålet. Det kan inkludera:
            </p>

            <h4>2.1 Kontakt- och kontouppgifter</h4>
            <ul className="list-disc pl-5 space-y-1">
              <li>Namn</li>
              <li>E-postadress</li>
              <li>Telefonnummer</li>
              <li>Adress (valfritt)</li>
            </ul>

            <h4>2.2 Jobb- och kompetensdata</h4>
            <ul className="list-disc pl-5 space-y-1">
              <li>Ditt CV</li>
              <li>Arbetslivserfarenhet</li>
              <li>Utbildning</li>
              <li>Kompetenser och certifikat</li>
              <li>Övriga uppgifter du själv väljer att lämna</li>
            </ul>

            <h4>2.3 Preferenser och matchningsdata</h4>
            <ul className="list-disc pl-5 space-y-1">
              <li>Önskad roll, arbetsplats, lön och arbetsmiljö</li>
              <li>Dina inmatade svar i vår profilanalys</li>
              <li>AI-genererade rekommendationer</li>
            </ul>

            <h4>2.4 Teknisk data</h4>
            <ul className="list-disc pl-5 space-y-1">
              <li>IP-adress</li>
              <li>Webbläsare och enhet</li>
              <li>
                Användarbeteenden i tjänsten (för förbättring, säkerhet och
                felsökning)
              </li>
            </ul>

            <h3>3. Ändamål med behandlingen</h3>
            <p>Vi behandlar dina uppgifter för att kunna:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                Matcha din profil mot relevanta jobb med hjälp av AI-baserad
                analys och vektorisering.
              </li>
              <li>Kommunicera med dig när det hittas passande tjänster.</li>
              <li>Tillhandahålla profilanalys, marknadsvärdering och råd.</li>
              <li>Förbättra tjänstens funktionalitet (loggar, felsökning, statistik).</li>
              <li>Fullgöra rättsliga skyldigheter enligt GDPR.</li>
            </ul>
            <p>
              Vi behandlar aldrig dina uppgifter för ändamål som är oförenliga
              med dessa utan att först informera dig och, när så krävs, inhämta
              nytt samtycke.
            </p>

            <h3>4. Rättslig grund</h3>
            <p>Vi behandlar dina personuppgifter baserat på följande grunder:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <strong>Samtycke (GDPR Art. 6.1.a):</strong> När du laddar upp
                ditt CV eller skapar en profil ger du ditt uttryckliga samtycke
                till att vi analyserar och matchar dina uppgifter.
              </li>
              <li>
                <strong>Avtal (GDPR Art. 6.1.b):</strong> Behandling som är
                nödvändig för att tillhandahålla den tjänst du efterfrågar.
              </li>
              <li>
                <strong>Berättigat intresse (GDPR Art. 6.1.f):</strong> För
                utveckling, säkerhet och förbättring av plattformen.
              </li>
            </ul>
            <p>
              Vi använder aldrig dina uppgifter för marknadsföring utan att du
              lämnat ett separat och uttryckligt samtycke. Tjänsterelaterad
              kommunikation – till exempel jobbförslag, information om din
              profil eller support – räknas inte som marknadsföring och kan
              skickas utan särskilt marknadsföringssamtycke.
            </p>

            <h3>5. Lagring och säkerhet</h3>
            <p>
              Vi vidtar tekniska och organisatoriska åtgärder för att skydda
              dina uppgifter enligt GDPR Art. 32.
            </p>

            <h4>Databas och filhantering</h4>
            <ul className="list-disc pl-5 space-y-1">
              <li>Alla uppgifter lagras inom EU/EES.</li>
              <li>
                Vi använder Supabase, driftat i Frankfurt, som uppfyller
                GDPR-krav.
              </li>
              <li>
                CV:n och andra dokument lagras krypterat och skyddas med Row
                Level Security.
              </li>
            </ul>

            <h4>Åtkomst</h4>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                Endast behörig administratör (Nikola Dragicevic) har åtkomst
                till fullständiga användaruppgifter.
              </li>
              <li>Åtkomsten loggas och kontrolleras.</li>
            </ul>

            <h4>Delning med arbetsgivare</h4>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                Vi delar endast din profil med en arbetsgivare efter att du
                uttryckligen godkänt det.
              </li>
              <li>Vi säljer aldrig personuppgifter till tredje part.</li>
            </ul>

            <h3>6. Hur länge vi sparar data</h3>
            <p>
              Vi sparar dina uppgifter så länge du använder tjänsten eller tills
              du ber oss radera dem.
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                Om du är inaktiv i 24 månader raderas kontot automatiskt, efter
                att du informerats i förväg.
              </li>
              <li>
                Tvingande lagar (t.ex. bokföringslagen) kan kräva vissa
                lagringstider för betalningsinformation – men då lagras inget CV
                eller annat karriärmaterial tillsammans med dessa uppgifter.
              </li>
            </ul>

            <h3>7. Dina rättigheter enligt GDPR</h3>
            <p>Du har rätt att:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <strong>Få tillgång till dina uppgifter (registerutdrag):</strong>{" "}
                Vi skickar all data vi har om dig.
              </li>
              <li>
                <strong>Få felaktiga uppgifter rättade.</strong>
              </li>
              <li>
                <strong>
                  Få dina uppgifter raderade (&quot;rätten att bli bortglömd&quot;).
                </strong>
              </li>
              <li>
                <strong>Återkalla samtycke:</strong> Du kan när som helst dra
                tillbaka ett givet samtycke.
              </li>
              <li>
                <strong>Begära dataportabilitet:</strong> Du kan få ut ditt CV
                och övriga uppgifter i maskinläsbart format.
              </li>
              <li>
                <strong>Begränsa behandling:</strong> Till exempel om du vill
                pausa matchningen utan att ta bort ditt konto.
              </li>
            </ul>
            <p>
              För att använda någon av dessa rättigheter, kontakta oss på{" "}
              <a
                href="mailto:info@jobbnu.se"
                className="text-blue-600 hover:underline"
              >
                info@jobbnu.se
              </a>
              .
            </p>

            <h3>8. Cookies</h3>
            <p>
              Vi använder endast nödvändiga cookies för funktionalitet och
              säkerhet. Ingen marknadsföring eller spårning sker utan samtycke.
              Fullständig cookiepolicy finns i separat dokumentation.
            </p>

            <h3>9. Överföring till tredjeland</h3>
            <p>
              All data behandlas inom EU/EES. Vi överför inte personuppgifter
              utanför EU/EES utan ditt samtycke och utan att säkerhetskraven
              enligt GDPR kapitel V är uppfyllda.
            </p>

            <h3>10. Ändringar i policyn</h3>
            <p>
              Vi kan uppdatera denna integritetspolicy vid behov. Vid större
              ändringar informeras du via e-post eller på webbplatsen. Senaste
              uppdateringsdatum anges överst.
            </p>

            <h3>11. Kontaktuppgifter till tillsynsmyndighet</h3>
            <p>
              Om du anser att vi hanterar dina data felaktigt kan du kontakta
              Integritetsskyddsmyndigheten (IMY) via{" "}
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

            <h3>12. Marknadsföring &amp; kommunikation</h3>
            <p>
              Vi kan i framtiden komma att erbjuda relaterade tjänster, till
              exempel karriärtjänster eller samarbeten med rekryterare. Sådan
              kommunikation räknas som marknadsföring och skickas endast om du
              aktivt lämnat ett separat samtycke, till exempel genom att kryssa
              i en ruta vid registrering.
            </p>
            <p>
              Du kan när som helst återkalla ditt marknadsföringssamtycke via
              länkar i e-postmeddelanden eller genom att kontakta oss på{" "}
              <a
                href="mailto:info@jobbnu.se"
                className="text-blue-600 hover:underline"
              >
                info@jobbnu.se
              </a>
              . Återkallelse påverkar inte den behandling som skett innan
              samtycket drogs tillbaka.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
