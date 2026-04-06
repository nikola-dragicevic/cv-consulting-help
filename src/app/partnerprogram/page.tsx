import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

export const metadata = {
  title: "Partnerprogram | JobbNu",
  description: "Tjäna pengar genom att tipsa om JobbNu till din publik.",
}

export default function PartnerProgramPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-12">
      <div className="mx-auto max-w-5xl space-y-8">
        <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="max-w-3xl space-y-4">
            <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-800">
              JobbNu Partnerprogram
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-slate-950">Tjäna pengar när din publik hittar jobb med JobbNu</h1>
            <p className="text-lg leading-8 text-slate-600">
              Vi söker creators, jobbprofiler, studentkonton och karriärinriktade influencers som vill hjälpa fler människor
              hitta jobb snabbare. Du får en egen länk och engångsprovision på första köpet från varje användare du värvar.
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <Button asChild className="bg-emerald-600 text-white hover:bg-emerald-700">
                <a href="mailto:info@jobbnu.se?subject=JobbNu%20partnerprogram">Ansök till partnerprogrammet</a>
              </Button>
              <Button asChild variant="outline">
                <Link href="/support">Ställ en fråga först</Link>
              </Button>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <Card className="border-slate-200 bg-white">
            <CardHeader>
              <CardTitle>Så fungerar det</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-slate-600">
              <p>1. Du får en egen partnerlänk</p>
              <p>2. Din publik klickar och registrerar sig</p>
              <p>3. Vi spårar första betalningen</p>
              <p>4. Du får engångsprovision på första köpet</p>
            </CardContent>
          </Card>
          <Card className="border-slate-200 bg-white">
            <CardHeader>
              <CardTitle>Ersättning</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-slate-600">
              <p>Standardnivå: 30% av första betalningen</p>
              <p>Dashboard Premium 99 kr → 30 kr</p>
              <p>Auto Apply 300 kr → 90 kr</p>
              <p>Premium till Auto Apply +200 kr → 60 kr</p>
            </CardContent>
          </Card>
          <Card className="border-slate-200 bg-white">
            <CardHeader>
              <CardTitle>Vem passar det för?</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-slate-600">
              <p>Jobb- och karriärprofiler</p>
              <p>Studentkonton</p>
              <p>Creators som pratar om arbetsliv och ekonomi</p>
              <p>Lokala profiler med publik i Sverige</p>
            </CardContent>
          </Card>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <h2 className="text-2xl font-semibold text-slate-950">Vad säljer du egentligen?</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <h3 className="font-semibold text-slate-900">Dashboard Premium</h3>
              <p className="mt-2 text-sm leading-7 text-slate-600">
                JobbNu matchar användaren mot relevanta jobb, visar direktansökningar och hjälper personen att prioritera vilka jobb
                som faktiskt är värda att söka.
              </p>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
              <h3 className="font-semibold text-emerald-950">Auto Apply</h3>
              <p className="mt-2 text-sm leading-7 text-emerald-900">
                Auto Apply hjälper användaren att generera personliga email, ladda ner underlag, förbereda intervjuer och söka många fler
                jobb snabbare.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
