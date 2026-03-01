import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "ATS - Vad är det och hur fungerar det?",
  description:
    "Förstå ATS (Applicant Tracking System), varför kandidater rankas lågt, och hur du förbättrar din CV-matchning.",
};

export default function AtsPage() {
  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#eef2ff_45%,#f8fafc_100%)]">
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-sky-700">Jobbnu Guide</p>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">ATS: vad det är och varför det spelar roll</h1>
          <p className="mt-3 text-slate-600">
            ATS (Applicant Tracking System) är rekryteringssystem som sorterar ansökningar baserat på regler och nyckelord.
            Många kandidater får låg rankning trots relevant erfarenhet, ofta för att rätt termer saknas i CV eller personligt brev.
          </p>
        </div>

        <div className="mt-6 grid gap-4">
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-lg font-semibold text-slate-900">Vad ett basic ATS oftast gör</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-700">
              <li>Letar efter exakta ord/fraser från jobbannonsen</li>
              <li>Kontrollerar krav som utbildning, certifikat och körkort</li>
              <li>Filtrerar på titel, bransch, plats och erfarenhetsnivå</li>
              <li>Ger en rangordning baserat på träffsäkerhet i nyckelord</li>
            </ul>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-lg font-semibold text-slate-900">Varför du kan få låg ATS-score</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-700">
              <li>Du använder andra ord än annonsen (synonymer räknas inte alltid)</li>
              <li>Viktiga krav finns men är svåra att hitta i texten</li>
              <li>CV-formatet är svårt att tolka maskinellt</li>
              <li>Titlar och kompetenser är för generellt formulerade</li>
            </ul>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-lg font-semibold text-slate-900">Så förbättrar du ATS-träff</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-700">
              <li>Spegla språk från annonsen i CV och brev</li>
              <li>Lägg kravkompetenser i tydliga sektioner</li>
              <li>Använd konsekventa titlar och konkreta verktyg/tekniker</li>
              <li>Undvik överdesignade CV-mallar för ATS-versionen</li>
            </ul>
          </section>
        </div>

        <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-700">
          Jobbnu visar flera sätt att tolka matchning: ATS-score, Jobbnu score och Taxonomy fit.
          <div className="mt-3">
            <Link href="/dashboard" className="font-semibold text-sky-700 hover:text-sky-900">
              Gå till dashboard och jämför lägen
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
