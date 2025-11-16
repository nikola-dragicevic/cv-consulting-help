// =============================
// 1) components/ui/DebugPanel.tsx  (you said you've created this — paste to ensure parity)
// =============================
"use client"
import { useState } from "react"
import { Button } from "@/components/ui/button"

export default function DebugPanel({ profilePayload, wishPayload, jobs }: {
  profilePayload?: any
  wishPayload?: any
  jobs?: any[]
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border rounded-md bg-slate-50 p-3 mt-6">
      <Button variant="outline" size="sm" onClick={() => setOpen(o => !o)} className="mb-2">
        {open ? "Hide Debug" : "Show Debug"}
      </Button>
      {open && (
        <div className="text-xs space-y-4 max-h-96 overflow-y-auto">
          {profilePayload && (
            <pre className="bg-white p-2 border rounded">
              <strong>Profile payload:</strong>
              {JSON.stringify(profilePayload, null, 2)}
            </pre>
          )}
          {wishPayload && (
            <pre className="bg-white p-2 border rounded">
              <strong>Wish payload:</strong>
              {JSON.stringify(wishPayload, null, 2)}
            </pre>
          )}
          {jobs && (
            <pre className="bg-white p-2 border rounded">
              <strong>Jobs:</strong>
              {JSON.stringify(jobs, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}