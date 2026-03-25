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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function buildCvPrintHtml(cv: CvData): string {
  const skills = Object.entries(cv.skills ?? {})
    .map(([category, items]) => {
      const tags = items.map((item) => `<span class="tag">${escapeHtml(item)}</span>`).join("")
      return `<div class="skill-row"><strong>${escapeHtml(category)}:</strong> ${tags}</div>`
    })
    .join("")

  const experience = (cv.experience ?? [])
    .map(
      (exp) => `
        <section class="item">
          <div class="item-header">
            <div>
              <h3>${escapeHtml(exp.title)}</h3>
              <p>${escapeHtml(exp.company)}</p>
            </div>
            <span>${escapeHtml(exp.period)}</span>
          </div>
          <ul>
            ${(exp.bullets ?? []).map((bullet) => `<li>${escapeHtml(bullet)}</li>`).join("")}
          </ul>
        </section>
      `
    )
    .join("")

  const education = (cv.education ?? [])
    .map(
      (edu) => `
        <section class="item">
          <div class="item-header">
            <div>
              <h3>${escapeHtml(edu.degree)}</h3>
              <p>${escapeHtml(edu.school)}</p>
            </div>
            <span>${escapeHtml(edu.period)}</span>
          </div>
        </section>
      `
    )
    .join("")

  const extras = [
    (cv.languages?.length ?? 0) > 0
      ? `<div><strong>Sprak:</strong> ${escapeHtml(cv.languages!.join(", "))}</div>`
      : "",
    (cv.certifications?.length ?? 0) > 0
      ? `<div><strong>Certifikat:</strong> ${escapeHtml(cv.certifications!.join(", "))}</div>`
      : "",
    cv.driverLicense ? `<div><strong>Korkort:</strong> ${escapeHtml(cv.driverLicense)}</div>` : "",
  ]
    .filter(Boolean)
    .join("")

  return `<!DOCTYPE html>
<html lang="sv">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(cv.name)} - CV</title>
  <style>
    @page { size: A4; margin: 0; }
    html, body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: #0f172a;
      font-family: Arial, sans-serif;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .page {
      width: 210mm;
      min-height: 297mm;
      margin: 0 auto;
      background: #ffffff;
    }
    .header {
      background: #0f172a !important;
      color: #fff;
      padding: 32px 40px;
      border-bottom: 6px solid #2563eb;
    }
    .header h1 { margin: 0; font-size: 28px; }
    .header .title { color: #93c5fd !important; margin-top: 4px; font-size: 14px; font-weight: 600; }
    .header .meta { margin-top: 10px; font-size: 12px; color: #cbd5e1 !important; line-height: 1.6; }
    .body { padding: 32px 40px; font-size: 13px; line-height: 1.6; }
    .section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.14em; color: #1d4ed8 !important; margin: 28px 0 12px; border-bottom: 1px solid #dbeafe; padding-bottom: 6px; }
    .item { margin-bottom: 18px; padding-left: 14px; border-left: 2px solid #dbeafe; break-inside: avoid; }
    .item-header { display: flex; justify-content: space-between; gap: 12px; }
    .item-header h3 { margin: 0; font-size: 14px; }
    .item-header p { margin: 2px 0 0; color: #64748b; font-size: 12px; }
    .item-header span { color: #94a3b8; font-size: 12px; white-space: nowrap; }
    ul { margin: 8px 0 0; padding-left: 18px; }
    li { margin: 4px 0; }
    .tag { display: inline-block; background: #f1f5f9 !important; color: #334155; padding: 2px 8px; border-radius: 999px; margin: 2px 6px 2px 0; font-size: 11px; }
    .skill-row { margin-bottom: 8px; }
    .extras { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; font-size: 12px; }
    @media print {
      html, body { width: 210mm; height: 297mm; }
      .page { max-width: none; }
      /* Fallback when a browser ignores background graphics in print. */
      .header {
        background: #ffffff !important;
        color: #0f172a !important;
        border-top: 14px solid #0f172a;
        border-bottom: 4px solid #2563eb;
        padding-top: 22px;
      }
      .header .title {
        color: #2563eb !important;
      }
      .header .meta {
        color: #475569 !important;
      }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      <h1>${escapeHtml(cv.name)}</h1>
      <div class="title">${escapeHtml(cv.title)}</div>
      <div class="meta">
        ${cv.location ? `${escapeHtml(cv.location)}<br/>` : ""}
        ${escapeHtml(cv.phone)}<br/>
        ${escapeHtml(cv.email)}
      </div>
    </div>
    <div class="body">
      ${cv.profile ? `<div class="section-title">Profil</div><p>${escapeHtml(cv.profile)}</p>` : ""}
      ${experience ? `<div class="section-title">Arbetslivserfarenhet</div>${experience}` : ""}
      ${education ? `<div class="section-title">Utbildning</div>${education}` : ""}
      ${skills ? `<div class="section-title">Kompetenser</div>${skills}` : ""}
      ${extras ? `<div class="section-title">Ovrigt</div><div class="extras">${extras}</div>` : ""}
    </div>
  </div>
</body>
</html>`
}

function buildLetterPrintHtml(raw: string): string {
  return `<!DOCTYPE html>
<html lang="sv">
<head>
  <meta charset="utf-8" />
  <title>Personligt brev</title>
  <style>
    @page { size: A4; margin: 0; }
    html, body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: #0f172a;
      font-family: Georgia, serif;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .page { width: 210mm; min-height: 297mm; margin: 0 auto; background: #ffffff; }
    .header {
      background: #0f172a !important;
      color: #93c5fd !important;
      padding: 24px 40px;
      border-bottom: 4px solid #2563eb;
      font: 700 12px Arial, sans-serif;
      text-transform: uppercase;
      letter-spacing: 0.14em;
    }
    .body { padding: 32px 40px; font-size: 13px; line-height: 1.7; white-space: pre-wrap; }
    @media print {
      .header {
        background: #ffffff !important;
        color: #2563eb !important;
        border-top: 12px solid #0f172a;
        border-bottom: 3px solid #2563eb;
        padding-top: 18px;
      }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">Personligt brev</div>
    <div class="body">${escapeHtml(raw)}</div>
  </div>
</body>
</html>`
}

function printHtmlDocument(html: string) {
  const win = window.open("", "_blank")
  if (!win) return
  win.document.open()
  win.document.write(html)
  win.document.close()
  win.focus()
  window.setTimeout(() => {
    win.print()
  }, 300)
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
          onClick={() => printHtmlDocument(buildCvPrintHtml(cv))}
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
          onClick={() => printHtmlDocument(buildLetterPrintHtml(raw))}
          className="text-xs text-blue-600 hover:underline"
        >
          Skriv ut / Spara som PDF →
        </button>
      </div>
    </div>
  )
}
