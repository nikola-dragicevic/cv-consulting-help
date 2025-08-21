// =============================
// File: components/TagInput.tsx
// Lightweight, reusable tags input (Enter/Comma to add, click × to remove)
// =============================
"use client"
import React from "react"
import { X } from "lucide-react"

export interface TagInputProps {
  value: string[]
  onChange: (v: string[]) => void
  placeholder?: string
  max?: number
}

export default function TagInput({ value, onChange, placeholder, max }: TagInputProps) {
  const [draft, setDraft] = React.useState("")

  function commitDraft() {
    const t = draft.trim()
    if (!t) return setDraft("")
    if (max && value.length >= max) return setDraft("")
    if (!value.includes(t)) onChange([...value, t])
    setDraft("")
  }

  return (
    <div className="rounded-md border bg-white p-2">
      <div className="flex flex-wrap gap-2">
        {value.map((tag, i) => (
          <span key={`${tag}-${i}`} className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-3 py-1 text-sm text-blue-700">
            {tag}
            <button type="button" className="ml-1 text-blue-700/70 hover:text-blue-900" onClick={() => onChange(value.filter((t) => t !== tag))}>
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          className="flex-1 min-w-[160px] outline-none bg-transparent px-2 py-1 text-sm"
          value={draft}
          placeholder={placeholder ?? "Add and press Enter"}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault()
              commitDraft()
            }
          }}
          onBlur={commitDraft}
        />
      </div>
    </div>
  )
}