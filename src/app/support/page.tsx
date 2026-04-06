import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = {
  title: "JobbNu Support",
  description: "Support och kontakt för JobbNu.",
};

export default function SupportPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 px-4 py-12">
      <div className="mx-auto max-w-4xl">
        <Card className="rounded-2xl border border-slate-200 shadow-lg">
          <CardHeader className="rounded-t-2xl border-b bg-slate-50">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">JobbNu</p>
            <CardTitle className="mt-1 text-3xl font-semibold text-slate-900">
              Support & kontakt
            </CardTitle>
            <p className="mt-1 text-sm text-slate-500">
              Hjälp med profil, jobbmatchning, Auto Apply och Gmail/Outlook-anslutning.
            </p>
          </CardHeader>

          <CardContent className="prose prose-slate max-w-none space-y-6 pt-6">
            <h3>Kontakt</h3>
            <p>
              E-post: <a href="mailto:info@jobbnu.se">info@jobbnu.se</a>
            </p>

            <h3>Vad JobbNu hjälper till med</h3>
            <ul>
              <li>CV-generering och dokumenthjälp</li>
              <li>AI-baserad jobbmatchning</li>
              <li>Ansökningsmail och personliga brev</li>
              <li>Gmail- och Outlook-anslutning för att skicka ansökningar från användarens egen mailbox</li>
              <li>Intervjuförberedelser och ansökningsflöden</li>
            </ul>

            <h3>Hur Gmail/Outlook används</h3>
            <p>
              Om du ansluter din e-postleverantör används behörigheten enbart för att skicka e-post
              på ditt initiativ. JobbNu ska inte läsa din inkorg för denna funktion.
            </p>

            <h3>Vanliga länkar</h3>
            <ul>
              <li>
                <Link href="/integritetspolicy">Integritetspolicy</Link>
              </li>
              <li>
                <Link href="/villkor">Användarvillkor</Link>
              </li>
              <li>
                <Link href="/ai-transparens">AI-transparens</Link>
              </li>
              <li>
                <Link href="/integritetspolicy/extension">Extensionens integritetspolicy</Link>
              </li>
              <li>
                <Link href="/support/extension">Extension-support</Link>
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
