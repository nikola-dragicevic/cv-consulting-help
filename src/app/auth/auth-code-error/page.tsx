// src/app/auth/auth-code-error/page.tsx
import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function AuthCodeErrorPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md text-center">
        <h2 className="text-2xl font-bold mb-4 text-red-600">
          Bekräftelse misslyckades
        </h2>
        <p className="text-gray-600 mb-6">
          Det uppstod ett problem vid bekräftelsen av din e-postadress.
          Detta kan bero på att länken har löpt ut eller redan använts.
        </p>
        <div className="space-y-3">
          <Link href="/signup">
            <Button className="w-full">
              Registrera igen
            </Button>
          </Link>
          <Link href="/login">
            <Button variant="outline" className="w-full">
              Tillbaka till inloggning
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}
