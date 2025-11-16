
// =============================
// File: components/CareerWishlistForm.tsx
// The popup content extracted into a clean component
// =============================
"use client"
import React from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import TagInput from "@/components/ui/TagInput"

export type CompanySize = "small" | "medium" | "large" | null
export type Modality = "remote" | "hybrid" | "onsite" | null
export type Pace = "fast" | "steady" | null
export type Structure = "flat" | "corporate" | null
export type Collaboration = "collaborative" | "independent" | null

export type Wish = {
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
  const [titles, setTitles] = React.useState<string[]>(initial.titles || [])
  const [industries, setIndustries] = React.useState<string[]>(initial.industries || [])
  const [useSkills, setUseSkills] = React.useState<string[]>(initial.use_skills || [])
  const [learnSkills, setLearnSkills] = React.useState<string[]>(initial.learn_skills || [])
  const [companySize, setCompanySize] = React.useState<CompanySize>(initial.company_size || null)
  const [modality, setModality] = React.useState<Modality>(initial.modality || null)
  const [pace, setPace] = React.useState<Pace>(initial.pace || null)
  const [structure, setStructure] = React.useState<Structure>(initial.structure || null)
  const [collab, setCollab] = React.useState<Collaboration>(initial.collaboration || null)
  const [includeNearbyMetro, setIncludeNearbyMetro] = React.useState<boolean>(initial.includeNearbyMetro ?? true)

  return (
    <div className="w-full max-w-3xl rounded-xl bg-white p-6 shadow-2xl">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-xl font-semibold">Career Wishlist</h3>
        <button className="text-slate-500 hover:text-slate-800" onClick={onCancel}>✕</button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label>Önskade jobbtitlar (max 3)</Label>
          <TagInput value={titles} onChange={(v) => setTitles(v.slice(0, 3))} placeholder="t.ex. Data Scientist" max={3} />
        </div>
        <div>
          <Label>Branscher</Label>
          <TagInput value={industries} onChange={setIndustries} placeholder="FinTech, GreenTech…" />
        </div>
        <div>
          <Label>Färdigheter du vill använda</Label>
          <TagInput value={useSkills} onChange={setUseSkills} placeholder="Public speaking, Python…" />
        </div>
        <div>
          <Label>Färdigheter du vill lära dig</Label>
          <TagInput value={learnSkills} onChange={setLearnSkills} placeholder="Machine learning…" />
        </div>

        <div>
          <Label>Företagsstorlek</Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {(["small", "medium", "large"] as CompanySize[]).map((opt) => (
              <button key={String(opt)} type="button" onClick={() => setCompanySize(opt)} className={`rounded-full border px-3 py-1 text-sm ${companySize === opt ? "border-blue-600 bg-blue-50 text-blue-700" : "hover:bg-slate-50"}`}>
                {opt}
              </button>
            ))}
          </div>
        </div>
        <div>
          <Label>Arbetssätt</Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {["remote", "hybrid", "onsite"].map((opt) => (
              <button key={opt} type="button" onClick={() => setModality(opt as Modality)} className={`rounded-full border px-3 py-1 text-sm ${modality === opt ? "border-blue-600 bg-blue-50 text-blue-700" : "hover:bg-slate-50"}`}>
                {opt}
              </button>
            ))}
          </div>
        </div>

        <div>
          <Label>Takt</Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {["fast", "steady"].map((opt) => (
              <button key={opt} type="button" onClick={() => setPace(opt as Pace)} className={`rounded-full border px-3 py-1 text-sm ${pace === opt ? "border-blue-600 bg-blue-50 text-blue-700" : "hover:bg-slate-50"}`}>
                {opt}
              </button>
            ))}
          </div>
        </div>
        <div>
          <Label>Struktur</Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {["flat", "corporate"].map((opt) => (
              <button key={opt} type="button" onClick={() => setStructure(opt as Structure)} className={`rounded-full border px-3 py-1 text-sm ${structure === opt ? "border-blue-600 bg-blue-50 text-blue-700" : "hover:bg-slate-50"}`}>
                {opt}
              </button>
            ))}
          </div>
        </div>
        <div>
          <Label>Samarbete</Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {["collaborative", "independent"].map((opt) => (
              <button key={opt} type="button" onClick={() => setCollab(opt as Collaboration)} className={`rounded-full border px-3 py-1 text-sm ${collab === opt ? "border-blue-600 bg-blue-50 text-blue-700" : "hover:bg-slate-50"}`}>
                {opt}
              </button>
            ))}
          </div>
        </div>

        <div className="md:col-span-2">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" className="accent-blue-600" checked={includeNearbyMetro} onChange={(e) => setIncludeNearbyMetro(e.target.checked)} />
            Inkludera närliggande storstadsområde (t.ex. Stockholm)
          </label>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-end gap-3">
        <Button variant="outline" onClick={onCancel}>Avbryt</Button>
        <Button className="bg-blue-600 hover:bg-blue-700" onClick={() => onSubmit({
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
        })}>Uppdatera matchningar</Button>
      </div>
    </div>
  )
}