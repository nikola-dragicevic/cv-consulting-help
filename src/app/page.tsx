"use client"

import type React from "react"

import { useState } from "react"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { RadioGroup } from "@/components/ui/radio-group" // <-- , RadioGroupItem inside parentesis// 
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { CheckCircle, Star, Mail, Phone, FileText, Users, Award } from "lucide-react"

export default function CVConsultationService() {
  const [selectedPackage, setSelectedPackage] = useState("")
  const [showCheckout, setShowCheckout] = useState(false)
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)

  const packages = [
    {
      id: "full-consultation",
      name: "CV + Personligt Brev + Konsultation",
      price: 1300,
      description:
        "Fullständig hjälp där jag coachar dig, ger dig strategier och bygger din ansökan tillsammans med dig",
      features: [
        "Professionellt CV",
        "Personligt brev",
        "60 min personlig konsultation",
        "Jobbsökningsstrategier",
        "Intervjuförberedelse",
        "Personlig coaching",
        "Leverans inom 7-10 dagar",
      ],
      recommended: true,
    },
    {
      id: "cv-letter",
      name: "CV + Personligt Brev",
      price: 1000,
      description: "Ett paket med CV och skräddarsytt personligt brev",
      features: [
        "Professionellt CV",
        "Skräddarsytt personligt brev",
        "Matchat till specifik tjänst",
        "Leverans inom 5-7 dagar",
      ],
    },
    {
      id: "cv-only",
      name: "CV",
      price: 750,
      description: "Professionellt skrivet CV",
      features: ["Skräddarsytt CV", "Professionell layout", "ATS-optimerat", "Leverans inom 3-5 dagar"],
    },
  ]

  const selectedPkg = packages.find((pkg) => pkg.id === selectedPackage)

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      setUploadedFile(file)
    }
  }

  const handlePackageSelect = () => {
    if (selectedPackage) {
      setShowCheckout(true)
    }
  }

  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" })
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-amber-50">
        <div className="container mx-auto px-4 grid lg:grid-cols-2 gap-12 items-center">
          <div className="text-center lg:text-left space-y-6">
            <h1 className="text-4xl lg:text-6xl font-bold text-slate-900 leading-tight">
              Hej! Jag heter <span className="text-blue-600">Nikola</span> – låt mig hjälpa dig att få jobbet du vill
              ha.
            </h1>
            <div className="space-y-4">
              <p className="text-xl text-slate-600 max-w-2xl">Jag har hjälpt många – nu är det din tur.</p>
              <div className="bg-blue-50 p-6 rounded-lg border-l-4 border-blue-600">
                <p className="text-lg text-slate-700 font-medium leading-relaxed">
                  Det viktigaste jag erbjuder är inte bara texten – det är{" "}
                  <span className="text-blue-600 font-semibold">vägledning</span>. Jag visar dig hur du söker jobb
                  effektivt, hur du sticker ut, och hur du får intervju.
                </p>
              </div>
              <p className="text-base text-slate-500 italic">
                &quot;Varje person har en historia – min uppgift är att få den att sticka ut. &quot;
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
              <Button
                size="lg"
                className="bg-blue-600 hover:bg-blue-700 hover:scale-105 transition-all duration-200 text-white px-8 py-4 text-lg shadow-lg hover:shadow-xl"
                onClick={() => scrollToSection("packages")}
              >
                🎯 Välj ditt paket
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="border-blue-600 text-blue-600 hover:bg-blue-50 hover:scale-105 transition-all duration-200 px-8 py-4 text-lg bg-transparent"
                onClick={() => scrollToSection("about")}
              >
                📘 Läs mer om mig
              </Button>
            </div>
          </div>
          <div className="flex justify-center">
            <div className="relative">
              <Image
                src="/portrait.jpeg"
                alt="Nikola - Professionell CV-konsult"
                width={400}
                height={500}
                className="rounded-2xl shadow-2xl"
                priority
              />
              <div className="absolute -bottom-4 -right-4 bg-white p-4 rounded-xl shadow-lg">
                <div className="flex items-center gap-2">
                  <Star className="h-5 w-5 text-yellow-500 fill-current" />
                  <span className="font-semibold">4.9/5</span>
                  <span className="text-slate-600">från 50+ kunder</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* About Me Section */}
      <section id="about" className="py-20 bg-white">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center space-y-8">
            <h2 className="text-3xl lg:text-4xl font-bold text-slate-900">Varför välja mig?</h2>
            <div className="grid md:grid-cols-3 gap-8 mt-12">
              <div className="text-center space-y-4">
                <div className="bg-blue-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto">
                  <Users className="h-8 w-8 text-blue-600" />
                </div>
                <h3 className="text-xl font-semibold">50+ Nöjda Kunder</h3>
                <p className="text-slate-600">
                  Jag har hjälpt över 50 personer att landa sina drömjobb med personlig coaching och skräddarsydda
                  ansökningar.
                </p>
              </div>
              <div className="text-center space-y-4">
                <div className="bg-blue-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto">
                  <FileText className="h-8 w-8 text-blue-600" />
                </div>
                <h3 className="text-xl font-semibold">Svenska & Engelska</h3>
                <p className="text-slate-600">
                  Alla tjänster levereras på svenska som standard, med möjlighet till engelska vid behov. Anpassat för
                  den svenska arbetsmarknaden.
                </p>
              </div>
              <div className="text-center space-y-4">
                <div className="bg-blue-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto">
                  <Award className="h-8 w-8 text-blue-600" />
                </div>
                <h3 className="text-xl font-semibold">Personlig Coaching</h3>
                <p className="text-slate-600">
                  Mitt fokus ligger på att ge dig verktyg och strategier som fungerar långsiktigt, inte bara en
                  engångstext.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
      {/* === MATCHING + PAID SIDE-BY-SIDE SECTION === */}
      <section id="match-vs-paid" className="py-20 bg-white">
  <div className="container mx-auto px-4">
    <div className="grid lg:grid-cols-2 gap-12 items-start">
      
      {/* 🔍 FREE MATCHING FORM */}
      <div className="bg-slate-50 rounded-xl p-6 shadow-md border">
        <h2 className="text-2xl font-bold mb-4 text-slate-900 text-center">
          🔍 Matcha dig med rätt jobb (gratis)
        </h2>
        <p className="text-center text-slate-600 mb-6">
          Ladda upp ditt CV, fyll i dina uppgifter och få jobbförslag baserat på dina preferenser – helt kostnadsfritt.
        </p>

        <div className="space-y-4">
          <div>
            <Label htmlFor="fullName">Fullständigt namn</Label>
            <Input id="fullName" placeholder="Förnamn Efternamn" />
          </div>

          <div>
            <Label htmlFor="emailFree">E-postadress</Label>
            <Input id="emailFree" type="email" placeholder="din@email.se" />
          </div>

          <div>
            <Label htmlFor="phoneFree">Telefonnummer</Label>
            <Input id="phoneFree" placeholder="070-123 45 67" />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="city">Stad</Label>
              <Input id="city" placeholder="Stockholm, Göteborg etc." />
            </div>
            <div>
              <Label htmlFor="street">Gata (utan nummer)</Label>
              <Input id="street" placeholder="Ex: Klarabergsgatan" />
            </div>
          </div>

          <div>
            <Label htmlFor="cvUpload">CV (PDF, DOCX, TXT)</Label>
            <Input
              id="cvUpload"
              type="file"
              accept=".pdf,.doc,.docx,.txt"
              className="file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
          </div>

          <div className="space-y-6 mt-6">
  <h3 className="text-lg font-semibold text-slate-800">Matchningsquiz (Rekommenderas starkt för bästa matchning)</h3>
  <p className="text-sm text-slate-500 -mt-2">
    Du kan hoppa över detta – men ju mer vi vet, desto bättre blir dina jobbförslag.
  </p>

  {/* Archetype Ranking */}
  <div>
    <Label>Vilken typ av arbete gillar du mest?</Label>
    <select className="mt-2 w-full border rounded-md px-3 py-2 text-sm">
      <option value="">Välj ett alternativ</option>
      <option value="creator">Skapa och bygga (t.ex. hantverk, praktiskt arbete)</option>
      <option value="organizer">Planera och organisera (t.ex. logistik, administration)</option>
      <option value="helper">Hjälpa andra (t.ex. vård, kundsupport)</option>
      <option value="analyst">Analysera och tänka (t.ex. teknik, forskning)</option>
      <option value="communicator">Kommunicera och övertyga (t.ex. försäljning, PR)</option>
      <option value="artist">Skapa och uttrycka kreativitet (t.ex. design, konst)</option>
    </select>
  </div>

  {/* Workplace Preference Sliders (simplified) */}
  <div>
    <Label>Arbetsmiljö</Label>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2 text-sm">
      <div>
        <Label htmlFor="pace">Tempo</Label>
        <select id="pace" className="mt-1 w-full border rounded-md px-3 py-2">
          <option value="">–</option>
          <option value="relaxed">Lugnt och stabilt</option>
          <option value="fast">Snabbt och dynamiskt</option>
        </select>
      </div>
      <div>
        <Label htmlFor="collab">Samarbete</Label>
        <select id="collab" className="mt-1 w-full border rounded-md px-3 py-2">
          <option value="">–</option>
          <option value="independent">Självständigt arbete</option>
          <option value="collaborative">Tätt samarbete i team</option>
        </select>
      </div>
      <div>
        <Label htmlFor="structure">Struktur</Label>
        <select id="structure" className="mt-1 w-full border rounded-md px-3 py-2">
          <option value="">–</option>
          <option value="flexible">Flexibelt och spontant</option>
          <option value="structured">Tydligt och förutsägbart</option>
        </select>
      </div>
      <div>
        <Label htmlFor="companySize">Företagsstorlek</Label>
        <select id="companySize" className="mt-1 w-full border rounded-md px-3 py-2">
          <option value="">–</option>
          <option value="small">Litet team (2–20)</option>
          <option value="medium">Mellanstort (20–200)</option>
          <option value="large">Stort företag (1000+)</option>
        </select>
      </div>
    </div>
  </div>

  {/* Values (checkbox multi-select) */}
  <div>
    <Label>Vad är viktigast för dig i ett jobb?</Label>
    <div className="mt-2 space-y-2 text-sm">
      {[
        "Balans mellan jobb och fritid",
        "Hög lön",
        "Stabilitet och trygghet",
        "Personlig utveckling",
        "Ledarskapsmöjligheter",
        "Göra nytta för samhället",
        "Frihet och självständighet",
        "Status och erkännande",
        "Kreativitet och innovation",
        "Stark teamkänsla",
      ].map((label, i) => (
        <div key={i} className="flex items-center space-x-2">
          <input type="checkbox" id={`val-${i}`} className="w-4 h-4" />
          <label htmlFor={`val-${i}`} className="text-slate-700">{label}</label>
        </div>
      ))}
    </div>
  </div>
  <div>
  <Label htmlFor="additionalInfo">Övrig information (Lite extra som höjer matchningsförmåga)</Label>
  <Textarea
    id="additionalInfo"
    placeholder="Skriv vad du vill – extra detaljer, drömjobb, situation osv."
    rows={4}
/>
</div>
</div>

          <Button
  className="w-full bg-blue-600 hover:bg-blue-700 text-white text-lg py-3"
  onClick={async () => {
    const form = new FormData()
    form.append("fullName", (document.getElementById("fullName") as HTMLInputElement)?.value)
    form.append("email", (document.getElementById("emailFree") as HTMLInputElement)?.value)
    form.append("phone", (document.getElementById("phoneFree") as HTMLInputElement)?.value)
    form.append("city", (document.getElementById("city") as HTMLInputElement)?.value)
    form.append("street", (document.getElementById("street") as HTMLInputElement)?.value)
    form.append("additionalInfo", (document.getElementById("additionalInfo") as HTMLTextAreaElement)?.value)

    const file = (document.getElementById("cvUpload") as HTMLInputElement)?.files?.[0]
    if (file) form.append("cv", file)

    form.append("archetype", (document.querySelector("select") as HTMLSelectElement)?.value || "")

    form.append("pace", (document.getElementById("pace") as HTMLSelectElement)?.value)
    form.append("collab", (document.getElementById("collab") as HTMLSelectElement)?.value)
    form.append("structure", (document.getElementById("structure") as HTMLSelectElement)?.value)
    form.append("companySize", (document.getElementById("companySize") as HTMLSelectElement)?.value)

    document.querySelectorAll('input[type="checkbox"]:checked').forEach((el) => {
      form.append("values", (el.nextElementSibling as HTMLLabelElement)?.innerText)
    })

    const res = await fetch("/api/create-candidate-profile", {
      method: "POST",
      body: form,
    })

    const result = await res.json()

    if (result.success) {
      alert("✅ Tack! Vi återkommer med matchningar inom kort.")
    } else {
      alert("❌ Något gick fel. Försök igen.")
    }
  }}
>
  Skicka in för matchning (gratis)
</Button>
        </div>
      </div>

      {/* 🎯 PAID PACKAGE SELECTION */}
      <div className="bg-slate-50 rounded-xl p-6 shadow-md border">
        <h2 className="text-2xl font-bold mb-4 text-slate-900 text-center">🎯 Behöver du mer hjälp?</h2>
        <p className="text-center text-slate-600 mb-6">
          Jag hjälper dig att skapa ett professionellt CV, personligt brev och förbereder dig inför intervjuer.
        </p>

        <div className="space-y-6">
          <RadioGroup value={selectedPackage} onValueChange={setSelectedPackage} className="space-y-6">
            {packages.map((pkg) => (
              <label key={pkg.id} htmlFor={pkg.id} className="block cursor-pointer">
                <input
                  type="radio"
                  id={pkg.id}
                  value={pkg.id}
                  checked={selectedPackage === pkg.id}
                  onChange={() => setSelectedPackage(pkg.id)}
                  className="sr-only"
                />
                <Card
                  className={`transition-all duration-200 hover:shadow-md relative ${
                    selectedPackage === pkg.id
                      ? pkg.recommended
                        ? "ring-2 ring-amber-400 shadow-lg"
                        : "ring-2 ring-blue-500 shadow-lg"
                      : ""
                  }`}
                >
                  {pkg.recommended && (
                    <div className="absolute -top-3 left-6">
                      <Badge className="bg-amber-500 text-white">⭐ Rekommenderas</Badge>
                    </div>
                  )}
                  <CardHeader className="pb-4">
                    <div className="flex items-start gap-4">
                      <div className="mt-1">
                        <div
                          className={`w-4 h-4 rounded-full border-2 ${
                            selectedPackage === pkg.id
                              ? "bg-blue-500 border-blue-600"
                              : "border-gray-400"
                          }`}
                        />
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between items-start mb-2">
                          <CardTitle className="text-xl">{pkg.name}</CardTitle>
                          <div className="text-2xl font-bold text-blue-600">{pkg.price} kr</div>
                        </div>
                        <CardDescription className="text-base">{pkg.description}</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <ul className="ml-8 space-y-2">
                      {pkg.features.map((feature, index) => (
                        <li key={index} className="flex items-center gap-3">
                          <CheckCircle className="h-4 w-4 text-green-500" />
                          <span className="text-sm">{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </label>
            ))}
          </RadioGroup>

          <div className="text-center">
            <Button
              size="lg"
              className="bg-blue-600 hover:bg-blue-700 text-white px-12 py-4 text-lg"
              onClick={handlePackageSelect}
              disabled={!selectedPackage}
            >
              Välj paket och fortsätt
            </Button>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>
      
      {/* Checkout Form */}
      {showCheckout && selectedPkg && (
        <section className="py-20 bg-blue-50">
          <div className="container mx-auto px-4">
            <div className="max-w-2xl mx-auto">
              <Card>
                <CardHeader>
                  <CardTitle className="text-2xl text-center">Slutför din beställning</CardTitle>
                  <CardDescription className="text-center">
                    Du har valt: <span className="font-semibold">{selectedPkg.name}</span> för {selectedPkg.price} kr
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="firstName">Förnamn *</Label>
                      <Input id="firstName" placeholder="Ditt förnamn" required />
                    </div>
                    <div>
                      <Label htmlFor="lastName">Efternamn *</Label>
                      <Input id="lastName" placeholder="Ditt efternamn" required />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="email">E-post *</Label>
                    <Input id="email" type="email" placeholder="din@email.se" required />
                  </div>

                  <div>
                    <Label htmlFor="phone">Telefonnummer</Label>
                    <Input id="phone" placeholder="070-123 45 67" />
                  </div>

                  <div>
                    <Label htmlFor="file-upload">Ladda upp befintligt CV eller jobbannonser (valfritt)</Label>
                    <div className="mt-2">
                      <Input
                        id="file-upload"
                        type="file"
                        accept=".pdf,.doc,.docx,.txt"
                        onChange={handleFileUpload}
                        className="file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                      />
                      {uploadedFile && (
                        <p className="text-sm text-green-600 mt-2 flex items-center gap-2">
                          <CheckCircle className="h-4 w-4" />
                          Fil uppladdad: {uploadedFile.name}
                        </p>
                      )}
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="preferred-time">Föredragen kontakttid</Label>
                    <div className="grid grid-cols-2 gap-4 mt-2">
                      <div className="flex items-center space-x-2">
                        <input type="radio" id="morning" name="time" value="morning" />
                        <Label htmlFor="morning">Förmiddag (9-12)</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <input type="radio" id="afternoon" name="time" value="afternoon" />
                        <Label htmlFor="afternoon">Eftermiddag (13-17)</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <input type="radio" id="evening" name="time" value="evening" />
                        <Label htmlFor="evening">Kväll (18-20)</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <input type="radio" id="flexible" name="time" value="flexible" />
                        <Label htmlFor="flexible">Flexibel</Label>
                      </div>
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="message">Ytterligare information (valfritt)</Label>
                    <Textarea
                      id="message"
                      placeholder="Berätta om din bakgrund, vilken typ av jobb du söker, eller andra önskemål..."
                      rows={4}
                    />
                  </div>

                  <Button
  className="w-full bg-blue-600 hover:bg-blue-700 text-lg py-3"
onClick={async () => {
  try {
    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        packageName: selectedPkg.name,
        amount: selectedPkg.price,
        description: selectedPkg.description,
        firstName: (document.getElementById("firstName") as HTMLInputElement)?.value,
        lastName: (document.getElementById("lastName") as HTMLInputElement)?.value,
        email: (document.getElementById("email") as HTMLInputElement)?.value,
        phone: (document.getElementById("phone") as HTMLInputElement)?.value,
      }),
    });

    const data = await res.json();
    console.log("Stripe response:", data); // ✅ Debug log

    if (data.url) {
      window.location.href = data.url;
    } else {
      alert("Något gick fel. Försök igen.");
    }
  } catch (error) {
    console.error("Fetch error:", error); // ✅ Debug log
    alert("Kunde inte skapa beställningen.");
  }
}}

>
  Bekräfta beställning – {selectedPkg.price} kr
</Button>



                  <p className="text-sm text-slate-600 text-center">
                    Vi kontaktar dig inom 24 timmar för att bekräfta din beställning och planera nästa steg.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>
      )}

      {/* Testimonials Section */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-4">
          <div className="text-center space-y-4 mb-16">
            <h2 className="text-3xl lg:text-4xl font-bold text-slate-900">Vad mina kunder säger</h2>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            <Card className="bg-slate-50">
              <CardContent className="pt-6">
                <div className="flex mb-4">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="h-5 w-5 text-yellow-500 fill-current" />
                  ))}
                </div>
                <p className="text-slate-700 mb-4">
  &quot;Nikolas konsultation var guld värd! Han hjälpte mig inte bara med CV:t utan gav mig konkreta strategier för hur jag skulle söka jobb. Fick tre intervjuer inom två veckor!&quot;
</p>
                <div className="font-semibold">- Emma S., Stockholm</div>
              </CardContent>
            </Card>

            <Card className="bg-slate-50">
              <CardContent className="pt-6">
                <div className="flex mb-4">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="h-5 w-5 text-yellow-500 fill-current" />
                  ))}
                </div>
                <p className="text-slate-700 mb-4">
  &quot;Som nyutexaminerad var jag helt vilsen. Nikola gav mig självförtroende och visade hur jag skulle presentera mina praktikperioder. Nu har jag mitt drömjobb!&quot;
</p>
                <div className="font-semibold">- David L., Göteborg</div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-20 bg-slate-50">
        <div className="container mx-auto px-4">
          <div className="text-center space-y-4 mb-16">
            <h2 className="text-3xl lg:text-4xl font-bold text-slate-900">Vanliga frågor</h2>
          </div>

          <div className="max-w-3xl mx-auto">
            <Accordion type="single" collapsible>
              <AccordionItem value="item-1">
                <AccordionTrigger>Vad ingår i konsultationen?</AccordionTrigger>
                <AccordionContent>
                  Konsultationen är ett 60-minuters personligt möte (video eller telefon) där vi går igenom din karriär,
                  diskuterar dina mål, och skapar en konkret jobbsökningsstrategi. Du får tips om hur du söker
                  effektivt, hur du sticker ut bland andra kandidater, och hur du förbereder dig för intervjuer.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-2">
                <AccordionTrigger>Hur lång tid tar det att få mina dokument?</AccordionTrigger>
                <AccordionContent>
                  CV endast: 3-5 dagar. CV + Personligt brev: 5-7 dagar. Fullständigt paket med konsultation: 7-10
                  dagar. Konsultationen bokas vanligtvis inom första veckan efter beställning.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-3">
                <AccordionTrigger>Skriver du på engelska också?</AccordionTrigger>
                <AccordionContent>
                  Ja, jag kan skriva CV och personliga brev på engelska vid behov. Alla dokument anpassas dock för den
                  svenska arbetsmarknaden oavsett språk. Standard är svenska.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-4">
                <AccordionTrigger>Vad händer om jag inte är nöjd?</AccordionTrigger>
                <AccordionContent>
                  Jag erbjuder en kostnadsfri revision om du inte är helt nöjd med resultatet. Din tillfredsställelse är
                  min prioritet, och jag arbetar tills du känner dig trygg med dina dokument.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-5">
                <AccordionTrigger>Varför är konsultationen så viktig?</AccordionTrigger>
                <AccordionContent>
                  Ett bra CV är bara början. Konsultationen ger dig verktyg för hela jobbsökningsprocessen: hur du
                  hittar rätt jobb, hur du anpassar din ansökan, hur du nätverkar, och hur du lyckas i intervjuer. Det
                  är skillnaden mellan att få ett dokument och att få en komplett strategi.
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        </div>
      </section>

      {/* Contact Footer */}
      <footer className="bg-slate-900 text-white py-16">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-3 gap-8">
            <div>
              <h3 className="text-xl font-bold mb-4">Kontakta Nikola</h3>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Mail className="h-5 w-5" />
                  <span>nikola@cvhjälp.se</span>
                </div>
                <div className="flex items-center gap-3">
                  <Phone className="h-5 w-5" />
                  <span>070-123 45 67</span>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-xl font-bold mb-4">Snabbkontakt</h3>
              <div className="space-y-3">
                <Input placeholder="Din e-post" className="bg-slate-800 border-slate-700" />
                <Textarea placeholder="Ditt meddelande" className="bg-slate-800 border-slate-700" rows={3} />
                <Button className="bg-blue-600 hover:bg-blue-700">Skicka meddelande</Button>
              </div>
            </div>

            <div>
              <h3 className="text-xl font-bold mb-4">Tjänster</h3>
              <div className="space-y-2 text-slate-300">
                <p>Professionell CV-skrivning</p>
                <p>Personliga brev</p>
                <p>Jobbkonsultation & coaching</p>
                <p>Intervjuförberedelse</p>
                <p>Jobbsökningsstrategier</p>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-700 mt-12 pt-8 text-center text-slate-400">
            <p>&copy; 2024 Nikola - CV & Jobbkonsultation. Alla rättigheter förbehållna.</p>
            <p className="mt-2 text-sm">
              Denna sida använder cookies för att förbättra användarupplevelsen. Vi följer GDPR och behandlar dina
              personuppgifter säkert.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
