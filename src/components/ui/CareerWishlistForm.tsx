// src/components/ui/CareerWishlistForm.tsx
"use client"
import React from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea" // Make sure this component exists
import TagInput from "@/components/ui/TagInput"
import { useLanguage } from "@/components/i18n/LanguageProvider"

export type CompanySize = "small" | "medium" | "large" | null
export type Modality = "remote" | "hybrid" | "onsite" | null
export type Pace = "fast" | "steady" | null
export type Structure = "flat" | "corporate" | null
export type Collaboration = "collaborative" | "independent" | null

export type Wish = {
  freeText?: string // ✅ NEW: Free text field
  titles: string[]
  use_skills: string[]
  learn_skills: string[]
  industries: string[]
  company_size: CompanySize
  modality: Modality
  pace: Pace
  structure: Structure
  collaboration: Collaboration
  values?: string[]
  includeNearbyMetro: boolean
  location_city: string
}

export interface CareerWishlistFormProps {
  initial: Wish
  onCancel: () => void
  onSubmit: (wish: Wish) => void
}

export default function CareerWishlistForm({ initial, onCancel, onSubmit }: CareerWishlistFormProps) {
  const { t, lang } = useLanguage()
  // ✅ NEW: State for free text
  const [freeText, setFreeText] = React.useState<string>(initial.freeText || "")
  
  const [titles, setTitles] = React.useState<string[]>(initial.titles || [])
  const [industries, setIndustries] = React.useState<string[]>(initial.industries || [])
  const [useSkills, setUseSkills] = React.useState<string[]>(initial.use_skills || [])
  const [learnSkills, setLearnSkills] = React.useState<string[]>(initial.learn_skills || [])
  const [companySize, setCompanySize] = React.useState<CompanySize>(initial.company_size || null)
  const [modality, setModality] = React.useState<Modality>(initial.modality || null)
  const [pace, setPace] = React.useState<Pace>(initial.pace || null)
  const [structure, setStructure] = React.useState<Structure>(initial.structure || null)
  const [collab] = React.useState<Collaboration>(initial.collaboration || null)
  const [includeNearbyMetro, setIncludeNearbyMetro] = React.useState<boolean>(initial.includeNearbyMetro ?? true)

  return (
    <div className="w-full max-w-3xl rounded-xl bg-white p-6 shadow-2xl overflow-y-auto max-h-[90vh]">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-xl font-semibold">{t("Förfina dina önskemål", "Refine your preferences")}</h3>
        <button className="text-slate-500 hover:text-slate-800" onClick={onCancel}>✕</button>
      </div>

      {/* ✅ NEW: Free Text Section - The most important part */}
      <div className="mb-6 space-y-2">
        <Label className="text-base font-medium">{t("Beskriv din drömroll (Fritext)", "Describe your dream role (Free text)")}</Label>
        <p className="text-sm text-slate-500">
          {t(
            'Berätta vad du verkligen vill göra. T.ex: "Jag vill jobba som backend-utvecklare med Java och Spring Boot. Gärna inom fintech, men absolut inte med legacy-system eller support."',
            'Describe what you really want to do. Example: "I want to work as a backend developer with Java and Spring Boot. Preferably in fintech, but not legacy systems or support."'
          )}
        </p>
        <Textarea 
          value={freeText} 
          onChange={(e) => setFreeText(e.target.value)} 
          placeholder={t("Skriv fritt här...", "Write freely here...")}
          className="min-h-[100px]"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label>{t("Önskade jobbtitlar (max 3)", "Preferred job titles (max 3)")}</Label>
          <TagInput value={titles} onChange={(v) => setTitles(v.slice(0, 3))} placeholder={t("t.ex. Data Scientist", "e.g. Data Scientist")} max={3} />
        </div>
        <div>
          <Label>{t("Branscher", "Industries")}</Label>
          <TagInput value={industries} onChange={setIndustries} placeholder={t("FinTech, GreenTech…", "FinTech, GreenTech…")} />
        </div>
        <div>
          <Label>{t("Färdigheter du vill använda", "Skills you want to use")}</Label>
          <TagInput value={useSkills} onChange={setUseSkills} placeholder={t("Public speaking, Python…", "Public speaking, Python…")} />
        </div>
        <div>
          <Label>{t("Färdigheter du vill lära dig", "Skills you want to learn")}</Label>
          <TagInput value={learnSkills} onChange={setLearnSkills} placeholder={t("Machine learning…", "Machine learning…")} />
        </div>

        <div>
          <Label>{t("Företagsstorlek", "Company size")}</Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {(["small", "medium", "large"] as CompanySize[]).map((opt) => (
              <button key={String(opt)} type="button" onClick={() => setCompanySize(opt)} className={`rounded-full border px-3 py-1 text-sm ${companySize === opt ? "border-blue-600 bg-blue-50 text-blue-700" : "hover:bg-slate-50"}`}>
                {lang === "sv" ? opt : opt === "small" ? "small" : opt === "medium" ? "medium" : "large"}
              </button>
            ))}
          </div>
        </div>
        <div>
          <Label>{t("Arbetssätt", "Work style")}</Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {["remote", "hybrid", "onsite"].map((opt) => (
              <button key={opt} type="button" onClick={() => setModality(opt as Modality)} className={`rounded-full border px-3 py-1 text-sm ${modality === opt ? "border-blue-600 bg-blue-50 text-blue-700" : "hover:bg-slate-50"}`}>
                {lang === "sv" ? opt : opt}
              </button>
            ))}
          </div>
        </div>

        {/* Keeping other filters but they are secondary now */}
        <div>
          <Label>{t("Takt", "Pace")}</Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {["fast", "steady"].map((opt) => (
              <button key={opt} type="button" onClick={() => setPace(opt as Pace)} className={`rounded-full border px-3 py-1 text-sm ${pace === opt ? "border-blue-600 bg-blue-50 text-blue-700" : "hover:bg-slate-50"}`}>
                {lang === "sv" ? opt : opt}
              </button>
            ))}
          </div>
        </div>
        <div>
          <Label>{t("Struktur", "Structure")}</Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {["flat", "corporate"].map((opt) => (
              <button key={opt} type="button" onClick={() => setStructure(opt as Structure)} className={`rounded-full border px-3 py-1 text-sm ${structure === opt ? "border-blue-600 bg-blue-50 text-blue-700" : "hover:bg-slate-50"}`}>
                {lang === "sv" ? opt : opt}
              </button>
            ))}
          </div>
        </div>
        
        <div className="md:col-span-2">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" className="accent-blue-600" checked={includeNearbyMetro} onChange={(e) => setIncludeNearbyMetro(e.target.checked)} />
            {t("Inkludera närliggande storstadsområde (t.ex. Stockholm)", "Include nearby metro area (e.g. Stockholm)")}
          </label>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-end gap-3">
        <Button variant="outline" onClick={onCancel}>{t("Avbryt", "Cancel")}</Button>
        <Button className="bg-blue-600 hover:bg-blue-700" onClick={() => onSubmit({
          freeText, // ✅ Send this to backend
          titles,
          industries,
          use_skills: useSkills,
          learn_skills: learnSkills,
          company_size: companySize,
          modality,
          pace,
          structure,
          collaboration: collab,
          includeNearbyMetro,
          values: [],
          location_city: initial.location_city,
        })}>{t("Uppdatera matchningar", "Update matches")}</Button>
      </div>
    </div>
  )
}
