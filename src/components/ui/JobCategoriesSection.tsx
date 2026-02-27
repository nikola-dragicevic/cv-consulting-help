"use client"

import React, { useState, useEffect } from "react"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { Briefcase } from "lucide-react"

type CategoryData = {
  name: string
  count: number
  subcategories?: { name: string; count: number }[]
}

// Map database category names to frontend display names
const CATEGORY_NAME_MAP: Record<string, string> = {
  "Yrken med social inriktning": "Socialt arbete",
  "Pedagogik": "Pedagogiskt arbete",
  "Yrken med teknisk inriktning": "Tekniskt arbete",
  "Transport, distribution, lager": "Transport",
  "Säkerhet och bevakning": "Säkerhetsarbete",
  "Naturvetenskap": "Naturvetenskapligt arbete",
  "Hantverk": "Hantverksyrken",
  "Militära yrken": "Militärt arbete"
}

// Main categories with their subcategories - complete mapping
const CATEGORY_STRUCTURE: Record<string, string[]> = {
  "Administration, ekonomi, juridik": [
    "Advokater",
    "Affärs- och företagsjurister",
    "Arbetsförmedlare",
    "Arkeologer och specialister inom humaniora m.m.",
    "Arkiv- och biblioteksassistenter m.fl.",
    "Backofficepersonal m.fl.",
    "Chefssekreterare och VD-assistenter m.fl.",
    "Controller",
    "Domare",
    "Domstols- och juristsekreterare m.fl.",
    "Ekonomiassistenter m.fl.",
    "Finansanalytiker och investeringsrådgivare m.fl.",
    "Försäkringssäljare och försäkringsrådgivare",
    "Förvaltnings- och organisationsjurister",
    "Gruppledare för kontorspersonal",
    "Informatörer, kommunikatörer och PR-specialister",
    "Inkasserare och pantlånare m.fl.",
    "Kontorsreceptionister",
    "Lednings- och organisationsutvecklare",
    "Löne- och personaladministratörer",
    "Medicinska sekreterare, vårdadministratörer m.fl.",
    "Mäklare inom finans",
    "Nationalekonomer och makroanalytiker m.fl.",
    "Personal- och HR-specialister",
    "Planerare och utredare m.fl.",
    "Redovisningsekonomer",
    "Revisorer m.fl.",
    "Skadereglerare och värderare",
    "Skattehandläggare",
    "Skolassistenter m.fl.",
    "Socialförsäkringshandläggare",
    "Statistiker",
    "Telefonister",
    "Traders och fondförvaltare",
    "Åklagare",
    "Övriga ekonomer",
    "Övriga handläggare",
    "Övriga jurister",
    "Övriga kontorsassistenter och sekreterare"
  ],
  "Bygg och anläggning": [
    "Anläggningsarbetare",
    "Anläggningsdykare",
    "Anläggningsmaskinförare m.fl.",
    "Arbetsledare inom bygg, anläggning och gruva",
    "Betongarbetare",
    "Brunnsborrare m.fl.",
    "Byggnads- och ventilationsplåtslagare",
    "Civilingenjörsyrken inom bygg och anläggning",
    "Golvläggare",
    "Grovarbetare inom bygg och anläggning",
    "Gruv- och stenbrottsarbetare",
    "Ingenjörer och tekniker inom bygg och anläggning",
    "Isoleringsmontörer",
    "Kranförare m.fl.",
    "Kyl- och värmepumpstekniker m.fl.",
    "Murare m.fl.",
    "Målare",
    "Ställningsbyggare",
    "Takmontörer",
    "Träarbetare, snickare m.fl.",
    "VVS-montörer m.fl.",
    "Övriga byggnads- och anläggningsarbetare"
  ],
  "Chefer och verksamhetsledare": [
    "Chefer inom arkitekt- och ingenjörsverksamhet",
    "Chefer inom bank, finans och försäkring",
    "Chefer inom friskvård, sport och fritid",
    "Chefer inom förskoleverksamhet",
    "Chefer inom grund- och gymnasieskola samt vuxenutbildning",
    "Chefer inom handel",
    "Chefer inom hälso- och sjukvård",
    "Chefer inom socialt och kurativt arbete",
    "Chefer inom äldreomsorg",
    "Chefer och ledare inom trossamfund",
    "Chefstjänstemän i intresseorganisationer",
    "Driftchefer inom bygg, anläggning och gruva",
    "Ekonomi- och finanschefer",
    "Fastighets- och förvaltningschefer",
    "Forsknings- och utvecklingschefer",
    "Försäljnings- och marknadschefer",
    "Förvaltare inom skogsbruk och lantbruk m.fl.",
    "Förvaltnings- och planeringschefer",
    "General-, landstings- och kommundirektörer m.fl.",
    "Hotell- och konferenschefer",
    "IT-chefer",
    "Informations-, kommunikations- och PR-chefer",
    "Inköps-, logistik- och transportchefer",
    "Personal- och HR-chefer",
    "Politiker",
    "Produktionschefer inom tillverkning",
    "Restaurang- och kökschefer",
    "Verkställande direktörer m.fl.",
    "Övriga administrations- och servicechefer",
    "Övriga chefer inom samhällsservice",
    "Övriga chefer inom utbildning",
    "Övriga chefer inom övrig servicenäring"
  ],
  "Data/IT": [
    "Drifttekniker, IT",
    "IT-säkerhetsspecialister",
    "Mjukvaru- och systemutvecklare m.fl.",
    "Nätverks- och systemtekniker m.fl.",
    "Supporttekniker, IT",
    "Systemadministratörer",
    "Systemanalytiker och IT-arkitekter m.fl.",
    "Systemförvaltare m.fl.",
    "Systemtestare och testledare",
    "Utvecklare inom spel och digitala media",
    "Webbmaster och webbadministratörer",
    "Övriga IT-specialister"
  ],
  "Försäljning, inköp, marknadsföring": [
    "Apotekstekniker",
    "Banktjänstemän",
    "Bensinstationspersonal",
    "Butikssäljare, dagligvaror",
    "Butikssäljare, fackhandel",
    "Evenemangs- och reseproducenter m.fl.",
    "Eventsäljare och butiksdemonstratörer m.fl.",
    "Fastighetsmäklare",
    "Företagssäljare",
    "Guider och reseledare",
    "Inköpare och upphandlare",
    "Inköps- och orderassistenter",
    "Kassapersonal m.fl.",
    "Kundtjänstpersonal",
    "Marknads- och försäljningsassistenter",
    "Marknadsanalytiker och marknadsförare m.fl.",
    "Marknadsundersökare och intervjuare",
    "Optikerassistenter",
    "Ordersamordnare m.fl.",
    "Resesäljare och trafikassistenter m.fl.",
    "Speditörer och transportmäklare",
    "Säljande butikschefer och avdelningschefer i butik",
    "Telefonförsäljare m.fl.",
    "Torg- och marknadsförsäljare m.fl.",
    "Uthyrare",
    "Övriga förmedlare"
  ],
  "Hantverksyrken": [
    "Bagare och konditorer",
    "Fin-, inrednings- och möbelsnickare",
    "Finmekaniker",
    "Glastekniker",
    "Guld- och silversmeder",
    "Läderhantverkare och skomakare",
    "Manuella ytbehandlare, trä",
    "Musikinstrumentmakare och övriga konsthantverkare",
    "Skräddare och ateljésömmerskor m.fl.",
    "Smeder",
    "Sömmare",
    "Tapetserare"
  ],
  "Hotell, restaurang, storhushåll": [
    "Bartendrar",
    "Croupierer och oddssättare m.fl.",
    "Hotellreceptionister m.fl.",
    "Hovmästare och servitörer",
    "Kafé- och konditoribiträden",
    "Kockar och kallskänkor",
    "Köksmästare och souschefer",
    "Pizzabagare m.fl.",
    "Restaurang- och köksbiträden m.fl.",
    "Storhushållsföreståndare"
  ],
  "Hälso- och sjukvård": [
    "AT-läkare",
    "Ambulanssjuksköterskor m.fl.",
    "Ambulanssjukvårdare",
    "Anestesisjuksköterskor",
    "Apotekare",
    "Arbetsterapeuter",
    "Audionomer och logopeder",
    "Barnmorskor",
    "Barnsjuksköterskor",
    "Barnsköterskor",
    "Biomedicinska analytiker m.fl.",
    "Dietister",
    "Distriktssköterskor",
    "Djursjukskötare m.fl.",
    "Fysioterapeuter och sjukgymnaster",
    "Företagssköterskor",
    "Geriatriksjuksköterskor",
    "Grundutbildade sjuksköterskor",
    "Intensivvårdssjuksköterskor",
    "Kiropraktorer och naprapater m.fl.",
    "Operationssjuksköterskor",
    "Optiker",
    "Psykiatrisjuksköterskor",
    "Psykologer",
    "Psykoterapeuter",
    "Receptarier",
    "Röntgensjuksköterskor",
    "ST-läkare",
    "Skolsköterskor",
    "Skötare",
    "Specialistläkare",
    "Tandhygienister",
    "Tandläkare",
    "Tandsköterskor",
    "Terapeuter inom alternativmedicin",
    "Undersköterskor, hemtjänst, hemsjukvård, äldreboende och habilitering",
    "Undersköterskor, vård- och specialavdelning och mottagning",
    "Veterinärer",
    "Vårdbiträden",
    "Övrig vård- och omsorgspersonal",
    "Övriga läkare",
    "Övriga specialister inom hälso- och sjukvård",
    "Övriga specialistsjuksköterskor"
  ],
  "Industriell tillverkning": [
    "Arbetsledare inom tillverkning",
    "Bergsprängare",
    "Bokbindare m.fl.",
    "Fordonsmontörer",
    "Gjutare",
    "Handpaketerare och andra fabriksarbetare",
    "Lackerare och industrimålare",
    "Maskinoperatörer inom ytbehandling, trä",
    "Maskinoperatörer, blekning, färgning och tvättning",
    "Maskinoperatörer, cement-, sten- och betongvaror",
    "Maskinoperatörer, farmaceutiska produkter",
    "Maskinoperatörer, gummiindustri",
    "Maskinoperatörer, kemisktekniska och fotografiska produkter",
    "Maskinoperatörer, kvarn-, bageri- och konfektyrindustri",
    "Maskinoperatörer, kött- och fiskberedningsindustri",
    "Maskinoperatörer, mejeri",
    "Maskinoperatörer, pappersvaruindustri",
    "Maskinoperatörer, plastindustri",
    "Maskinoperatörer, påfyllning, packning och märkning",
    "Maskinoperatörer, ytbehandling",
    "Maskinsnickare och maskinoperatörer, träindustri",
    "Maskinställare och maskinoperatörer, metallarbete",
    "Montörer, elektrisk och elektronisk utrustning",
    "Montörer, metall-, gummi- och plastprodukter",
    "Montörer, träprodukter",
    "Operatörer inom sågverk, hyvleri och plywood m.m.",
    "Prepresstekniker",
    "Processoperatörer, papper",
    "Processoperatörer, pappersmassa",
    "Processoperatörer, stenkross- och malmförädling",
    "Provsmakare och kvalitetsbedömare",
    "Slaktare och styckare m.fl.",
    "Slipare m.fl.",
    "Stenhuggare m.fl.",
    "Stålkonstruktionsmontörer och grovplåtsslagare",
    "Svetsare och gasskärare",
    "Tryckare",
    "Tunnplåtslagare",
    "Valsverksoperatörer",
    "Verktygsmakare",
    "Övriga maskin- och processoperatörer vid stål- och metallverk",
    "Övriga maskinoperatörer, livsmedelsindustri m.m.",
    "Övriga maskinoperatörer, textil-, skinn- och läderindustri",
    "Övriga montörer",
    "Övriga process- och maskinoperatörer"
  ],
  "Installation, drift, underhåll": [
    "Distributionselektriker",
    "Drifttekniker vid värme- och vattenverk",
    "Elektronikreparatörer och kommunikationselektriker m.fl.",
    "Fastighetsskötare",
    "Flygmekaniker m.fl.",
    "Industrielektriker",
    "Installations- och serviceelektriker",
    "Motorfordonsmekaniker och fordonsreparatörer",
    "Processövervakare, kemisk industri",
    "Processövervakare, metallproduktion",
    "Underhållsmekaniker och maskinreparatörer",
    "Vaktmästare m.fl.",
    "Övriga drifttekniker och processövervakare",
    "Övriga servicearbetare"
  ],
  "Kropps- och skönhetsvård": [
    "Fotterapeuter",
    "Frisörer",
    "Hudterapeuter",
    "Massörer och massageterapeuter",
    "Övriga skönhets- och kroppsterapeuter"
  ],
  "Kultur, media, design": [
    "Bibliotekarier och arkivarier",
    "Bild- och sändningstekniker",
    "Bildkonstnärer m.fl.",
    "Designer inom spel och digitala medier",
    "Fotografer",
    "Författare m.fl.",
    "Grafiska formgivare m.fl.",
    "Industridesigner",
    "Inredare, dekoratörer och scenografer m.fl.",
    "Inspicienter och scriptor m.fl.",
    "Journalister m.fl.",
    "Koreografer och dansare",
    "Ljus-, ljud- och scentekniker",
    "Museiintendenter m.fl.",
    "Musiker, sångare och kompositörer",
    "Regissörer och producenter av film, teater m.m.",
    "Skådespelare",
    "Översättare, tolkar och lingvister m.fl.",
    "Övriga designer och formgivare",
    "Övriga yrken inom kultur och underhållning"
  ],
  "Militärt arbete": [
    "Officerare",
    "Soldater m.fl.",
    "Specialistofficerare"
  ],
  "Naturbruk": [
    "Bärplockare och plantörer m.fl.",
    "Fiskare",
    "Fiskodlare",
    "Förare av jordbruks- och skogsmaskiner",
    "Odlare av jordbruksväxter, frukt och bär",
    "Skogsarbetare",
    "Specialister och rådgivare inom lantbruk m.m.",
    "Specialister och rådgivare inom skogsbruk",
    "Trädgårdsanläggare m.fl.",
    "Trädgårdsodlare",
    "Uppfödare och skötare av lantbrukets husdjur",
    "Uppfödare och skötare av sällskapsdjur",
    "Växtodlare och djuruppfödare, blandad drift",
    "Övriga djuruppfödare och djurskötare"
  ],
  "Naturvetenskapligt arbete": [
    "Cell- och molekylärbiologer m.fl.",
    "Farmakologer och biomedicinare",
    "Fysiker och astronomer",
    "Geologer och geofysiker m.fl.",
    "Kemister",
    "Matematiker och aktuarier",
    "Meteorologer",
    "Miljö- och hälsoskyddsinspektörer",
    "Specialister inom miljöskydd och miljöteknik",
    "Växt- och djurbiologer"
  ],
  "Pedagogiskt arbete": [
    "Doktorander",
    "Elevassistenter m.fl.",
    "Forskarassistenter m.fl.",
    "Fritidspedagoger",
    "Förskollärare",
    "Grundskollärare",
    "Gymnasielärare",
    "Idrottstränare och instruktörer m.fl.",
    "Lärare i yrkesämnen",
    "Professionella idrottsutövare",
    "Professorer",
    "Speciallärare och specialpedagoger m.fl.",
    "Studie- och yrkesvägledare",
    "Trafiklärare",
    "Universitets- och högskolelektorer",
    "Övriga pedagoger med teoretisk specialistkompetens",
    "Övriga universitets- och högskolelärare",
    "Övriga utbildare och instruktörer"
  ],
  "Sanering och renhållning": [
    "Bilrekonditionerare, fönsterputsare m.fl.",
    "Renhållnings- och återvinningsarbetare",
    "Saneringsarbetare m.fl.",
    "Skorstensfejare",
    "Städare",
    "Städledare och husfruar",
    "Övrig hemservicepersonal m.fl."
  ],
  "Socialt arbete": [
    "Barnskötare",
    "Begravnings- och krematoriepersonal",
    "Behandlingsassistenter och socialpedagoger m.fl.",
    "Biståndsbedömare m.fl.",
    "Diakoner",
    "Friskvårdskonsulenter och hälsopedagoger m.fl.",
    "Fritidsledare m.fl.",
    "Kuratorer",
    "Pastorer m.fl.",
    "Personliga assistenter",
    "Präster",
    "Socialsekreterare",
    "Vårdare, boendestödjare",
    "Övrig servicepersonal",
    "Övriga yrken inom socialt arbete"
  ],
  "Säkerhetsarbete": [
    "Arbetsmiljöingenjörer, yrkes- och miljöhygieniker",
    "Brandingenjörer och byggnadsinspektörer m.fl.",
    "Brandmän",
    "Kriminalvårdare",
    "Poliser",
    "SOS-operatörer m.fl.",
    "Säkerhetsinspektörer m.fl.",
    "Tull- och kustbevakningstjänstemän",
    "Väktare och ordningsvakter",
    "Övrig bevaknings- och säkerhetspersonal"
  ],
  "Tekniskt arbete": [
    "Arkitekter m.fl.",
    "Civilingenjörsyrken inom elektroteknik",
    "Civilingenjörsyrken inom gruvteknik och metallurgi",
    "Civilingenjörsyrken inom kemi och kemiteknik",
    "Civilingenjörsyrken inom logistik och produktionsplanering",
    "Civilingenjörsyrken inom maskinteknik",
    "Fastighetsförvaltare",
    "Flygtekniker",
    "GIS- och kartingenjörer",
    "Ingenjörer och tekniker inom elektroteknik",
    "Ingenjörer och tekniker inom gruvteknik och metallurgi",
    "Ingenjörer och tekniker inom industri, logistik och produktionsplanering",
    "Ingenjörer och tekniker inom kemi och kemiteknik",
    "Ingenjörer och tekniker inom maskinteknik",
    "Laboratorieingenjörer",
    "Landskapsarkitekter",
    "Lantmätare",
    "Planeringsarkitekter m.fl.",
    "Tandtekniker och ortopedingenjörer m.fl.",
    "Tekniker, bilddiagnostik och medicinteknisk utrustning",
    "Övriga civilingenjörsyrken",
    "Övriga ingenjörer och tekniker"
  ],
  "Transport": [
    "Arbetsledare inom lager och terminal",
    "Bangårdspersonal",
    "Brevbärare och postterminalarbetare",
    "Buss- och spårvagnsförare",
    "Fartygsbefäl m.fl.",
    "Flygledare",
    "Hamnarbetare",
    "Kabinpersonal m.fl.",
    "Lager- och terminalpersonal",
    "Lastbilsförare m.fl.",
    "Lokförare",
    "Maskinbefäl",
    "Matroser och jungmän m.fl.",
    "Piloter m.fl.",
    "Ramppersonal, flyttkarlar och varupåfyllare m.fl.",
    "Reklamutdelare och tidningsdistributörer",
    "Taxiförare m.fl.",
    "Transportledare och transportsamordnare",
    "Truckförare",
    "Tågvärdar och ombordansvariga m.fl.",
    "Övriga bil-, motorcykel- och cykelförare"
  ]
}

export default function JobCategoriesSection() {
  const [totalJobs, setTotalJobs] = useState<number>(0)
  const [categories, setCategories] = useState<CategoryData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchJobCounts()
  }, [])

  async function fetchJobCounts() {
    try {
      setLoading(true)
      const response = await fetch("/api/job-categories")

      if (!response.ok) {
        throw new Error("Failed to fetch job categories")
      }

      const data = await response.json()
      setTotalJobs(data.total)
      setCategories(data.categories)
    } catch (err) {
      console.error("Error fetching job categories:", err)
      setError("Kunde inte hämta jobbkategorier")
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <section className="py-20 bg-white">
        <div className="container mx-auto px-4">
          <div className="text-center">
            <div className="animate-pulse space-y-4">
              <div className="h-10 bg-slate-200 rounded w-1/3 mx-auto"></div>
              <div className="h-6 bg-slate-200 rounded w-1/4 mx-auto"></div>
            </div>
          </div>
        </div>
      </section>
    )
  }

  if (error) {
    return (
      <section className="py-20 bg-white">
        <div className="container mx-auto px-4">
          <div className="text-center text-red-600">
            <p>{error}</p>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="py-20 bg-white">
      <div className="container mx-auto px-4">
        <div className="text-center space-y-4 mb-12">
          <h1 className="text-4xl lg:text-5xl font-bold text-slate-900">
            Antal Jobb: {totalJobs.toLocaleString("sv-SE")}
          </h1>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">
            Utforska alla jobbkategorier och underkategorier
          </p>
        </div>

        <div className="max-w-5xl mx-auto">
          <Accordion type="single" collapsible className="space-y-4">
            {categories.map((category, index) => {
              const mappedName = CATEGORY_NAME_MAP[category.name] || category.name
              const fallbackSubcategories = (CATEGORY_STRUCTURE[mappedName] || []).map((name) => ({ name, count: 0 }))
              const subcategories = (category.subcategories && category.subcategories.length > 0)
                ? category.subcategories
                : fallbackSubcategories

              return (
              <AccordionItem
                key={category.name}
                value={`category-${index}`}
                className="border rounded-lg bg-white shadow-sm hover:shadow-md transition-shadow"
              >
                <AccordionTrigger className="px-6 py-4 hover:no-underline">
                  <div className="flex items-center justify-between w-full pr-4">
                    <div className="flex items-center gap-3">
                      <div className="bg-blue-100 p-2 rounded-lg">
                        <Briefcase className="h-5 w-5 text-blue-600" />
                      </div>
                      <h2 className="text-xl font-semibold text-slate-900 text-left">
                        {mappedName}
                      </h2>
                    </div>
                    <Badge variant="secondary" className="ml-4 text-base px-4 py-1">
                      {category.count.toLocaleString("sv-SE")} jobb
                    </Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-6 pb-4">
                  <div className="pt-4 border-t">
                    <h3 className="text-sm font-semibold text-slate-600 mb-3 uppercase tracking-wide">
                      Underkategorier
                    </h3>
                    {subcategories.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {subcategories.map((subcategory) => {
                        return (
                          <div
                            key={subcategory.name}
                            className="flex items-center justify-between p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors"
                          >
                            <span className="text-sm text-slate-700 flex-1">{subcategory.name}</span>
                            {subcategory.count > 0 && (
                              <Badge variant="outline" className="ml-2 text-xs">
                                {subcategory.count}
                              </Badge>
                            )}
                          </div>
                        )
                      })}
                    </div>
                    ) : (
                      <p className="text-sm text-slate-500 italic">Inga underkategorier tillgängliga</p>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
              )
            })}
          </Accordion>
        </div>
      </div>
    </section>
  )
}
