"use client"

// CvPreview renders a generated CV from JSON data into a beautiful A4-style document.
// Falls back to raw text display if content is not valid JSON.

export interface CvData {
  name: string
  title: string
  email: string
  phone: string
  location?: string
  profile: string
  experience: Array<{
    title: string
    company: string
    period: string
    bullets: string[]
  }>
  education: Array<{
    degree: string
    school: string
    period: string
  }>
  skills: Record<string, string[]>
  languages?: string[]
  certifications?: string[]
  driverLicense?: string | null
}

function parseCvData(raw: string): CvData | null {
  try {
    // Strip markdown code fences if Claude wrapped the JSON
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim()
    const parsed = JSON.parse(cleaned)
    if (parsed && typeof parsed.name === "string") return parsed as CvData
    return null
  } catch {
    return null
  }
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-3 mt-6 first:mt-0">
      <span className="text-[10px] font-bold tracking-[0.15em] uppercase text-blue-700">{children}</span>
      <div className="flex-1 h-px bg-blue-100" />
    </div>
  )
}

function SkillTag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block rounded bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700 mr-1 mb-1">
      {children}
    </span>
  )
}

export function CvPreview({ raw, className = "" }: { raw: string; className?: string }) {
  const cv = parseCvData(raw)

  // Fallback: raw text display
  if (!cv) {
    return (
      <div className={`bg-white rounded-lg border border-slate-200 p-8 font-mono text-xs text-slate-700 whitespace-pre-wrap ${className}`}>
        {raw}
      </div>
    )
  }

  return (
    <div
      className={`cv-document bg-white shadow-lg print:shadow-none ${className}`}
      style={{ maxWidth: "794px", margin: "0 auto" }}
    >
      {/* Header */}
      <div className="bg-slate-900 text-white px-10 py-8 print:px-8 print:py-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight leading-tight">{cv.name}</h1>
            <p className="text-blue-300 font-medium mt-0.5 text-sm">{cv.title}</p>
          </div>
          <div className="text-right text-xs text-slate-300 space-y-0.5 shrink-0 pt-1">
            {cv.location && <p>{cv.location}</p>}
            <p>{cv.phone}</p>
            <p>{cv.email}</p>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="px-10 py-8 print:px-8 print:py-6 text-slate-800 text-[13px] leading-relaxed">

        {/* Profile */}
        {cv.profile && (
          <section>
            <SectionHeader>Profil</SectionHeader>
            <p className="text-slate-600 leading-relaxed">{cv.profile}</p>
          </section>
        )}

        {/* Experience */}
        {cv.experience?.length > 0 && (
          <section>
            <SectionHeader>Arbetslivserfarenhet</SectionHeader>
            <div className="space-y-5">
              {cv.experience.map((exp, i) => (
                <div key={i} className="relative pl-4 border-l-2 border-blue-100">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-slate-900 text-sm">{exp.title}</p>
                      <p className="text-slate-500 text-xs">{exp.company}</p>
                    </div>
                    <span className="text-xs text-slate-400 shrink-0 pt-0.5">{exp.period}</span>
                  </div>
                  {exp.bullets?.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {exp.bullets.map((b, j) => (
                        <li key={j} className="flex gap-2 text-slate-600 text-[12px]">
                          <span className="text-blue-400 mt-0.5 shrink-0">•</span>
                          <span>{b}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Education */}
        {cv.education?.length > 0 && (
          <section>
            <SectionHeader>Utbildning</SectionHeader>
            <div className="space-y-3">
              {cv.education.map((edu, i) => (
                <div key={i} className="flex items-start justify-between gap-2 relative pl-4 border-l-2 border-blue-100">
                  <div>
                    <p className="font-semibold text-slate-900 text-sm">{edu.degree}</p>
                    <p className="text-slate-500 text-xs">{edu.school}</p>
                  </div>
                  <span className="text-xs text-slate-400 shrink-0 pt-0.5">{edu.period}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Skills */}
        {cv.skills && Object.keys(cv.skills).length > 0 && (
          <section>
            <SectionHeader>Kompetenser</SectionHeader>
            <div className="space-y-2">
              {Object.entries(cv.skills).map(([category, items]) => (
                <div key={category}>
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mr-2">{category}:</span>
                  {items.map((s, i) => <SkillTag key={i}>{s}</SkillTag>)}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Languages + Certifications + License row */}
        {((cv.languages?.length ?? 0) > 0 || (cv.certifications?.length ?? 0) > 0 || cv.driverLicense) && (
          <section>
            <SectionHeader>Övrigt</SectionHeader>
            <div className="grid grid-cols-2 gap-x-8 gap-y-2 sm:grid-cols-3">
              {(cv.languages?.length ?? 0) > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Språk</p>
                  <p className="text-slate-600 text-xs">{cv.languages!.join(", ")}</p>
                </div>
              )}
              {(cv.certifications?.length ?? 0) > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Certifikat</p>
                  <p className="text-slate-600 text-xs">{cv.certifications!.join(", ")}</p>
                </div>
              )}
              {cv.driverLicense && (
                <div>
                  <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Körkort</p>
                  <p className="text-slate-600 text-xs">{cv.driverLicense}</p>
                </div>
              )}
            </div>
          </section>
        )}

      </div>

      {/* Print button — hidden when printing */}
      <div className="px-10 pb-6 print:hidden">
        <button
          onClick={() => window.print()}
          className="text-xs text-blue-600 hover:underline"
        >
          Skriv ut / Spara som PDF →
        </button>
      </div>

      <style>{`
        @media print {
          .cv-document { box-shadow: none !important; }
          body > *:not(.cv-document) { display: none !important; }
        }
      `}</style>
    </div>
  )
}

export function LetterPreview({ raw, className = "" }: { raw: string; className?: string }) {
  // Letters are plain text/markdown — render with basic styling
  return (
    <div
      className={`bg-white shadow-lg print:shadow-none ${className}`}
      style={{ maxWidth: "794px", margin: "0 auto" }}
    >
      <div className="bg-slate-900 text-white px-10 py-5 print:px-8">
        <h2 className="text-sm font-semibold tracking-wide uppercase text-blue-300">Personligt brev</h2>
      </div>
      <div className="px-10 py-8 print:px-8 text-slate-800 text-[13px] leading-relaxed whitespace-pre-wrap font-serif">
        {raw}
      </div>
      <div className="px-10 pb-6 print:hidden">
        <button
          onClick={() => window.print()}
          className="text-xs text-blue-600 hover:underline"
        >
          Skriv ut / Spara som PDF →
        </button>
      </div>
    </div>
  )
}
