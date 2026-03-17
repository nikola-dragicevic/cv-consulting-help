export type ParsedOutreachEmail = {
  subject: string
  body: string
}

export function parseGeneratedEmail(emailText: string): ParsedOutreachEmail {
  const raw = emailText.trim()
  const normalized = raw.replace(/^\*\*(Subject:\s*.+?)\*\*\s*$/im, "$1")
  const subjectMatch = normalized.match(/^Subject:\s*(.+)$/im)
  const subject = subjectMatch?.[1]?.trim() || "Kandidat från JobbNu"
  const body = stripGeneratedSignature(
    normalized
      .replace(/^\*\*?Subject:\s*.+?\*?\*?$/im, "")
      .replace(/^Subject:\s*.+$/im, "")
      .trim()
  )

  return { subject, body }
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

function linkifyText(value: string) {
  return value.replace(/https?:\/\/[^\s<]+/g, (url) => {
    const safeUrl = escapeHtml(url)
    return `<a href="${safeUrl}" style="color:#0369a1;text-decoration:underline;">${safeUrl}</a>`
  })
}

function stripGeneratedSignature(value: string) {
  return value
    .replace(/\n{2,}Med vänliga hälsningar,[\s\S]*$/i, "")
    .replace(/\n{2,}Med vänlig hälsning,[\s\S]*$/i, "")
    .trim()
}

function extractPrimaryUrl(value: string) {
  const match = value.match(/https?:\/\/[^\s]+/i)
  if (!match) return { body: value, url: null as string | null }
  const url = match[0]
  const body = value
    .replace(new RegExp(`\\n?${url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\n?`, "i"), "\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
  return { body, url }
}

function getOutreachSignatureConfig() {
  return {
    signerName: process.env.OUTREACH_SIGNER_NAME || "Nikola Dragicevic",
    signerTitle: process.env.OUTREACH_SIGNER_TITLE || "Grundare, JobbNu",
    contactEmail: process.env.OUTREACH_FROM_EMAIL || "info@jobbnu.se",
    phone: process.env.OUTREACH_PHONE || "076 172 34 73",
    siteUrl: process.env.OUTREACH_SITE_URL || process.env.NEXT_PUBLIC_BASE_URL || "https://jobbnu.se",
    logoUrl:
      process.env.OUTREACH_LOGO_URL ||
      "https://glmmegybqtqqahcbdjvz.supabase.co/storage/v1/object/public/email-assets/logo_crispy_1024x682px.png",
    badgeUrl:
      process.env.OUTREACH_BADGE_URL ||
      "https://glmmegybqtqqahcbdjvz.supabase.co/storage/v1/object/public/email-assets/sigill_348x150px.png",
  }
}

function buildOutreachSignatureHtml() {
  const signature = getOutreachSignatureConfig()
  const signerName = escapeHtml(signature.signerName)
  const signerTitle = escapeHtml(signature.signerTitle)
  const contactEmail = escapeHtml(signature.contactEmail)
  const phone = escapeHtml(signature.phone)
  const siteUrl = escapeHtml(signature.siteUrl)
  const logoUrl = escapeHtml(signature.logoUrl)
  const badgeUrl = escapeHtml(signature.badgeUrl)

  return [
    '<div style="margin-top:28px;padding-top:20px;border-top:1px solid #e2e8f0;">',
    '<table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;">',
    "<tr>",
    '<td valign="top" style="padding-right:18px;width:96px;">',
    `<img src="${logoUrl}" alt="JobbNu" style="display:block;width:84px;max-width:84px;height:auto;border:0;" />`,
    "</td>",
    '<td valign="top">',
    '<p style="margin:0 0 8px 0;font-size:14px;line-height:22px;color:#475569;">',
    "Med vänlig hälsning,<br />",
    `${signerName}<br />`,
    `${signerTitle}`,
    "</p>",
    '<p style="margin:0 0 12px 0;font-size:13px;line-height:20px;color:#64748b;">',
    `${phone}<br />`,
    `<a href="mailto:${contactEmail}" style="color:#2563eb;text-decoration:none;">${contactEmail}</a><br />`,
    `<a href="${siteUrl}" style="color:#2563eb;text-decoration:none;">${siteUrl.replace(/^https?:\/\//, "")}</a>`,
    "</p>",
    `<img src="${badgeUrl}" alt="JobbNu sigill" style="display:block;width:140px;max-width:140px;height:auto;border:0;" />`,
    "</td>",
    "</tr>",
    "</table>",
    "</div>",
  ].join("")
}

export function buildOutreachHtml(textBody: string) {
  const cleanedText = stripGeneratedSignature(textBody)
  const { body, url } = extractPrimaryUrl(cleanedText)
  const escaped = escapeHtml(body)
  const linked = linkifyText(escaped)
  const paragraphs = linked
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)

  const htmlParagraphs = paragraphs.map((paragraph) => {
    const withBreaks = paragraph.replace(/\n/g, "<br />")
    return `<p style="margin:0 0 16px;color:#0f172a;font-size:15px;line-height:1.6;">${withBreaks}</p>`
  })

  return [
    "<!doctype html>",
    '<html lang="sv">',
    '<body style="margin:0;padding:24px;background:#f8fafc;font-family:Arial,sans-serif;">',
    '<div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:32px;">',
    ...htmlParagraphs,
    url
      ? [
          '<div style="margin:8px 0 22px 0;">',
          `<a href="${escapeHtml(url)}" style="display:inline-block;padding:14px 22px;border-radius:999px;background:#0b5fff;color:#ffffff;font-size:15px;font-weight:700;line-height:20px;text-decoration:none;">Se kandidatprofil</a>`,
          '<p style="margin:12px 0 0 0;font-size:13px;line-height:20px;color:#64748b;">Länken går till jobbnu.se där ni kan läsa kandidatprofilen och boka intervju direkt.</p>',
          "</div>",
        ].join("")
      : "",
    buildOutreachSignatureHtml(),
    "</div>",
    "</body>",
    "</html>",
  ].join("")
}

export function formatFromHeader(params: { email: string; name?: string | null }) {
  const name = params.name?.trim()
  return name ? `${name} <${params.email}>` : params.email
}

export function getClientIp(req: Request) {
  const forwardedFor = req.headers.get("x-forwarded-for")
  if (!forwardedFor) return null
  return forwardedFor.split(",")[0]?.trim() || null
}
