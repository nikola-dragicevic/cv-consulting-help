import { NextResponse } from "next/server"
import { getServerSupabase } from "@/lib/supabaseServer"
import { isAdminOrModerator } from "@/lib/admin"

export const runtime = "nodejs"
export const maxDuration = 60

type ScanInputJob = {
  id: string
  headline?: string | null
  company?: string | null
  webpage_url?: string | null
}

const ATS_DOMAINS = [
  "teamtailor.com",
  "recruitee.com",
  "workbuster.se",
  "varbi.com",
  "reachmee.com",
  "talentech.com",
  "jobylon.com",
  "hubspotpagebuilder",
  "webcruiter",
]

const EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi

function stripHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))
}

function looksLikeGenericEmail(email: string) {
  const lower = email.toLowerCase()
  return ["noreply@", "no-reply@", "donotreply@", "support@", "info@", "privacy@"].some((prefix) =>
    lower.startsWith(prefix)
  )
}

function extractEmails(html: string) {
  const found = html.match(EMAIL_REGEX) ?? []
  return uniqueStrings(found).filter((email) => !looksLikeGenericEmail(email))
}

function extractPlainEmailBlocks(html: string) {
  const text = stripHtml(html)
  const blocks: Array<{ email: string; context: string }> = []
  let match: RegExpExecArray | null
  const regex = new RegExp(EMAIL_REGEX)

  while ((match = regex.exec(text))) {
    const email = match[0]?.trim()
    if (!email || looksLikeGenericEmail(email)) continue
    const start = Math.max(0, match.index - 220)
    const end = Math.min(text.length, regex.lastIndex + 220)
    const context = text.slice(start, end).trim()
    blocks.push({ email, context })
  }

  return blocks
}

function extractMailtoBlocks(html: string) {
  const blocks: Array<{ email: string; context: string }> = []
  const regex = /<a[^>]+href=["']mailto:([^"'?#]+)[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi
  let match: RegExpExecArray | null

  while ((match = regex.exec(html))) {
    const email = match[1]?.trim()
    if (!email || looksLikeGenericEmail(email)) continue
    const start = Math.max(0, match.index - 280)
    const end = Math.min(html.length, regex.lastIndex + 280)
    const context = stripHtml(html.slice(start, end))
    blocks.push({ email, context })
  }

  return blocks
}

function extractNameAndRole(context: string) {
  const cleaned = context.replace(/\s+/g, " ").trim()
  const rolePattern =
    /(rekryterare|recruiter|hr-?chef|hr|talent acquisition|hiring manager|platschef|chef|vd|manager|konsultchef|rekryteringskonsult|kontaktperson)/i
  const namePattern =
    /([A-ZÅÄÖ][a-zåäö]+(?:\s+[A-ZÅÄÖ][a-zåäö]+){1,2})/

  const roleMatch = cleaned.match(rolePattern)
  const nameMatch = cleaned.match(namePattern)

  return {
    contact_name: nameMatch?.[1] ?? null,
    contact_role: roleMatch?.[1] ?? null,
  }
}

function scoreContactBlock(block: { email: string; context: string }) {
  const meta = extractNameAndRole(block.context)
  const lower = block.context.toLocaleLowerCase("sv-SE")
  let score = 0

  if (meta.contact_name) score += 2
  if (meta.contact_role) score += 2

  if (/\b(ansökan|ansokan|ansök|ansok|skicka din ansökan|skicka ansökan|sök jobbet|apply|application)\b/i.test(lower)) {
    score += 5
  }

  if (/\b(intervju|urval|rekrytering|rekryteringsprocess|rekryteringskonsult|kontakt|frågor besvaras)\b/i.test(lower)) {
    score += 3
  }

  if (/\b(cv|personligt brev|ansökningshandlingar)\b/i.test(lower)) {
    score += 2
  }

  if (/\b(noreply|no-reply|privacy|gdpr)\b/i.test(lower)) {
    score -= 4
  }

  return score
}

function pickBestContactBlock(blocks: Array<{ email: string; context: string }>) {
  if (blocks.length === 0) return null

  const ranked = [...blocks].sort((a, b) => scoreContactBlock(b) - scoreContactBlock(a))

  return ranked[0] || null
}

function classifyUrl(url: string | null) {
  if (!url) return { domain: null, type: "unknown" as const }

  try {
    const parsed = new URL(url)
    const domain = parsed.hostname.replace(/^www\./, "")
    const isAts = ATS_DOMAINS.some((candidate) => domain.includes(candidate))
    return {
      domain,
      type: isAts ? ("external_ats" as const) : ("company_or_direct" as const),
    }
  } catch {
    return { domain: null, type: "unknown" as const }
  }
}

async function fetchHtml(url: string) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)

  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; JobbNuBot/1.0; +https://jobbnu.se)",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: controller.signal,
      cache: "no-store",
    })

    const text = await res.text()
    return {
      ok: res.ok,
      finalUrl: res.url,
      html: text,
      status: res.status,
    }
  } finally {
    clearTimeout(timeout)
  }
}

async function scanSingleJob(job: ScanInputJob) {
  const sourceUrl = job.webpage_url?.trim() || null
  const urlMeta = classifyUrl(sourceUrl)

  if (!sourceUrl) {
    return {
      id: job.id,
      contactScanStatus: "no_url",
      outreachType: "manual_review",
      contactEmail: null,
      contactName: null,
      contactRole: null,
      contactDomain: null,
      contactNote: "Ingen annonslänk att skanna.",
    }
  }

  try {
    const page = await fetchHtml(sourceUrl)
    const finalUrlMeta = classifyUrl(page.finalUrl || sourceUrl)
    const emails = extractEmails(page.html)
    const mailtoBlocks = extractMailtoBlocks(page.html)
    const plainBlocks = extractPlainEmailBlocks(page.html)
    const bestMailto = pickBestContactBlock(mailtoBlocks)
    const bestPlain = pickBestContactBlock(plainBlocks)
    const bestBlock = bestMailto ?? bestPlain
    const bestEmail = bestBlock?.email ?? emails[0] ?? null
    const person = bestBlock ? extractNameAndRole(bestBlock.context) : { contact_name: null, contact_role: null }
    const outreachType =
      bestEmail
        ? "direct_email"
        : finalUrlMeta.type === "external_ats" || urlMeta.type === "external_ats"
          ? "external_ats"
          : "manual_review"

    return {
      id: job.id,
      contactScanStatus: page.ok ? "scanned" : "page_error",
      outreachType,
      contactEmail: bestEmail,
      contactName: person.contact_name,
      contactRole: person.contact_role,
      contactDomain: finalUrlMeta.domain ?? urlMeta.domain,
      contactNote: bestEmail
        ? "E-post hittad för direkt outreach."
        : outreachType === "external_ats"
          ? "Extern ATS/ansökningssida hittad, kontrollera manuellt."
          : "Ingen tydlig kontakt hittad.",
    }
  } catch (error) {
    return {
      id: job.id,
      contactScanStatus: "failed",
      outreachType: urlMeta.type === "external_ats" ? "external_ats" : "manual_review",
      contactEmail: null,
      contactName: null,
      contactRole: null,
      contactDomain: urlMeta.domain,
      contactNote: error instanceof Error ? error.message : "Skanning misslyckades.",
    }
  }
}

export async function POST(req: Request) {
  const supabase = await getServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!isAdminOrModerator(user)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const jobs = Array.isArray(body?.jobs) ? (body.jobs as ScanInputJob[]) : []
  const limitedJobs = jobs
    .filter((job) => job && typeof job.id === "string")
    .slice(0, 40)

  if (limitedJobs.length === 0) {
    return NextResponse.json({ error: "No jobs provided" }, { status: 400 })
  }

  const results = []
  for (const job of limitedJobs) {
    // Sequential on purpose to avoid overloading external sites.
    // This action is admin-triggered and best-effort.
    results.push(await scanSingleJob(job))
  }

  return NextResponse.json({
    scanned: results.length,
    results,
  })
}
