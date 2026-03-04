import { StaticOrderForm } from "@/components/orders/StaticOrderForm"
import { Zap, FileSearch, Target } from "lucide-react"

const STATS = [
  { value: "75%", label: "av CV:n sållas bort av ATS-system innan en människa läser dem" },
  { value: "6 sek", label: "genomsnittlig tid en rekryterare lägger på ett CV" },
  { value: "2×", label: "högre chans att bli kallad till intervju med rätt nyckelord" },
]

const WHY_ITEMS = [
  {
    icon: FileSearch,
    title: "ATS-optimerat",
    desc: "Rätt nyckelord från jobbannonsen speglas automatiskt. Passerar maskinen – imponerar på människan.",
  },
  {
    icon: Target,
    title: "Jobbanpassat",
    desc: "Klistra in jobblänken från Arbetsförmedlingen – AI:n läser annonsen och skräddarsyr CV:t mot just den rollen.",
  },
  {
    icon: Zap,
    title: "Klart på 60 sekunder",
    desc: "Fyll i formuläret, betala, hämta PDF direkt. Spara 3–5 timmar frustration.",
  },
]

const STEPS = [
  { num: "1", title: "Fyll i formuläret", desc: "Dina erfarenheter, utbildning och kompetenser. Tydliga fält – inga konstigheter." },
  { num: "2", title: "AI bygger ditt CV", desc: "Vår AI genererar ett professionellt, ATS-optimerat CV på svenska." },
  { num: "3", title: "Ladda ner som PDF", desc: "Direkt i webbläsaren – skriv ut (Ctrl+P → Spara som PDF). Klart för ansökan." },
]

export default function CvPage() {
  return (
    <div className="min-h-screen bg-slate-50">

      {/* Hero */}
      <div className="bg-slate-900 text-white">
        <div className="mx-auto max-w-3xl px-4 py-16 text-center">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/20 px-3 py-1 text-xs font-medium text-blue-300 mb-6">
            <Zap size={11} />
            AI-genererat CV på 60 sekunder
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight leading-tight mb-4">
            Ditt professionella CV –{" "}
            <span className="text-blue-400">skrivet av AI, valt av rekryterare</span>
          </h1>
          <p className="text-slate-300 text-base sm:text-lg max-w-xl mx-auto mb-8 leading-relaxed">
            Vi skapar ett ATS-optimerat CV skräddarsytt mot jobbet du söker. Matchar nyckelorden,
            lyfter dina styrkor och passerar automatiska sållningssystem.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <a
              href="#order"
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-500 px-6 py-3 text-sm font-semibold transition-colors"
            >
              Beställ mitt CV – 119 kr →
            </a>
            <span className="text-slate-400 text-xs">Inkl. moms · Genereras direkt</span>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="bg-white border-b border-slate-200">
        <div className="mx-auto max-w-3xl px-4 py-6">
          <div className="grid grid-cols-3 gap-4 text-center">
            {STATS.map((s) => (
              <div key={s.value}>
                <p className="text-2xl font-bold text-blue-600">{s.value}</p>
                <p className="text-xs text-slate-500 mt-1 leading-snug">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Why */}
      <div className="mx-auto max-w-3xl px-4 py-12">
        <h2 className="text-xl font-bold text-slate-900 text-center mb-2">Varför ett AI-CV slår ditt eget</h2>
        <p className="text-slate-500 text-sm text-center mb-8">
          De flesta CV:n är skrivna för att se bra ut för ögat. Vårt är byggt för att klara
          maskinen <em>och</em> imponera på rekryteraren.
        </p>
        <div className="grid gap-5 sm:grid-cols-3 mb-10">
          {WHY_ITEMS.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
              <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center">
                <Icon size={18} className="text-blue-600" />
              </div>
              <h3 className="font-semibold text-slate-900 text-sm">{title}</h3>
              <p className="text-slate-500 text-xs leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>

        {/* Comparison */}
        <div className="rounded-xl overflow-hidden border border-slate-200 bg-white">
          <div className="grid grid-cols-3 text-xs font-semibold text-center bg-slate-50 border-b border-slate-200">
            <div className="p-3 text-left text-slate-500">Kriterium</div>
            <div className="p-3 text-slate-500 border-l border-slate-200">Ditt CV idag</div>
            <div className="p-3 text-blue-700 bg-blue-50 border-l border-blue-100">JobbNu AI CV</div>
          </div>
          {[
            ["Passerar ATS-filter", "❌ Ofta nej", "✅ Alltid"],
            ["Nyckelord från annonsen", "❌ Sällan", "✅ Automatiskt"],
            ["Action-verb & tydliga bullets", "🟡 Kanske", "✅ Alltid"],
            ["Professionell profiltext", "🟡 Svårt att skriva själv", "✅ Skräddarsydd"],
            ["Tid det tar", "3–5 timmar", "60 sekunder"],
          ].map(([criterion, theirs, ours]) => (
            <div key={criterion} className="grid grid-cols-3 text-xs border-t border-slate-100">
              <div className="p-3 text-slate-600">{criterion}</div>
              <div className="p-3 text-slate-500 border-l border-slate-100 text-center">{theirs}</div>
              <div className="p-3 text-slate-800 font-medium bg-blue-50/40 border-l border-blue-100 text-center">{ours}</div>
            </div>
          ))}
        </div>
      </div>

      {/* How it works */}
      <div className="bg-white border-y border-slate-200">
        <div className="mx-auto max-w-3xl px-4 py-12">
          <h2 className="text-xl font-bold text-slate-900 text-center mb-8">Så fungerar det</h2>
          <div className="grid gap-6 sm:grid-cols-3">
            {STEPS.map((step) => (
              <div key={step.num} className="flex gap-4">
                <div className="shrink-0 w-8 h-8 rounded-full bg-blue-600 text-white text-sm font-bold flex items-center justify-center">
                  {step.num}
                </div>
                <div>
                  <p className="font-semibold text-slate-900 text-sm">{step.title}</p>
                  <p className="text-slate-500 text-xs mt-1 leading-relaxed">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Trust */}
      <div className="mx-auto max-w-3xl px-4 py-6">
        <div className="flex flex-wrap justify-center gap-x-8 gap-y-2 text-xs text-slate-500">
          {[
            "✓ Inga prenumerationer – betala en gång",
            "✓ Genereras direkt – inget väntetid",
            "✓ Drivs av avancerad AI",
            "✓ GDPR-säker hantering",
          ].map((s) => <span key={s}>{s}</span>)}
        </div>
      </div>

      {/* Order form */}
      <div id="order" className="scroll-mt-6">
        <div className="mx-auto max-w-3xl px-4 pb-4 text-center">
          <h2 className="text-xl font-bold text-slate-900 mb-1">Fyll i dina uppgifter</h2>
          <p className="text-sm text-slate-500">Fält markerade med * är obligatoriska. Resten förbättrar resultatet.</p>
        </div>
        <StaticOrderForm
          config={{
            name: "CV",
            amount: 119,
            flow: "cv_intake",
            includesLetter: false,
            includesConsultation: false,
          }}
        />
      </div>

    </div>
  )
}
