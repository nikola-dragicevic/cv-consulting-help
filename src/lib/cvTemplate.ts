export interface CvTemplateData {
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

export function parseCvTemplateData(raw: string): CvTemplateData | null {
  try {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim()
    const parsed = JSON.parse(cleaned)
    if (parsed && typeof parsed.name === "string") return parsed as CvTemplateData
    return null
  } catch {
    return null
  }
}

export function cvTemplateDataToEditableText(cv: CvTemplateData): string {
  const lines: string[] = []

  if (cv.name) lines.push(cv.name)
  if (cv.title) lines.push(cv.title)
  if (cv.location) lines.push(cv.location)
  if (cv.phone) lines.push(cv.phone)
  if (cv.email) lines.push(cv.email)

  if (cv.profile) {
    lines.push("")
    lines.push("Profil")
    lines.push(cv.profile)
  }

  if ((cv.experience?.length ?? 0) > 0) {
    lines.push("")
    lines.push("Arbetslivserfarenhet")
    for (const exp of cv.experience) {
      lines.push(`${exp.title}${exp.company ? `, ${exp.company}` : ""}${exp.period ? ` (${exp.period})` : ""}`)
      for (const bullet of exp.bullets ?? []) {
        lines.push(`- ${bullet}`)
      }
      lines.push("")
    }
  }

  if ((cv.education?.length ?? 0) > 0) {
    lines.push("Utbildning")
    for (const edu of cv.education) {
      lines.push(`${edu.degree}${edu.school ? `, ${edu.school}` : ""}${edu.period ? ` (${edu.period})` : ""}`)
    }
    lines.push("")
  }

  if (cv.skills && Object.keys(cv.skills).length > 0) {
    lines.push("Kompetenser")
    for (const [category, items] of Object.entries(cv.skills)) {
      lines.push(`${category}: ${items.join(", ")}`)
    }
    lines.push("")
  }

  if ((cv.languages?.length ?? 0) > 0) {
    lines.push(`Språk: ${cv.languages!.join(", ")}`)
  }
  if ((cv.certifications?.length ?? 0) > 0) {
    lines.push(`Certifikat: ${cv.certifications!.join(", ")}`)
  }
  if (cv.driverLicense) {
    lines.push(`Körkort: ${cv.driverLicense}`)
  }

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim()
}

export function buildCvPrintHtml(cv: CvTemplateData): string {
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
      ? `<div><strong>Språk:</strong> ${escapeHtml(cv.languages!.join(", "))}</div>`
      : "",
    (cv.certifications?.length ?? 0) > 0
      ? `<div><strong>Certifikat:</strong> ${escapeHtml(cv.certifications!.join(", "))}</div>`
      : "",
    cv.driverLicense ? `<div><strong>Körkort:</strong> ${escapeHtml(cv.driverLicense)}</div>` : "",
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
      ${extras ? `<div class="section-title">Övrigt</div><div class="extras">${extras}</div>` : ""}
    </div>
  </div>
</body>
</html>`
}
