// =============================
// 3) components/RemoteBoostToggle.tsx
// =============================
"use client"
import { Label } from "@/components/ui/label"

export function RemoteBoostToggle({ enabled, onChange }: { enabled: boolean, onChange: (val: boolean) => void }) {
  return (
    <label className="flex items-center gap-3 mt-4 text-sm text-slate-700">
      <input type="checkbox" className="accent-blue-600" checked={enabled} onChange={(e) => onChange(e.target.checked)} />
      Boosta fjärrjobb (+5%)
    </label>
  )
}