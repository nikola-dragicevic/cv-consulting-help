// =============================
// 2) components/ScoreLegend.tsx
// =============================
"use client"
export function ScoreLegend() {
  return (
    <div className="flex flex-wrap gap-6 text-sm text-slate-600 mt-4">
      <div><span className="font-semibold">Profile %</span> – match mot din erfarenhet</div>
      <div><span className="font-semibold">Wish %</span> – match mot dina önskemål</div>
      <div><span className="font-semibold">Final %</span> – viktat betyg 70/30</div>
    </div>
  )
}