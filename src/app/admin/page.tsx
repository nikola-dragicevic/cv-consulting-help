// src/app/admin/page.tsx
"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import type { User } from "@supabase/supabase-js"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { isAdminUser, isAdminOrModerator } from "@/lib/admin"
import { parseGeneratedEmail } from "@/lib/outreach"
import { formatEmployerFollowupStatus } from "@/lib/interviewFollowup"
import { getBrowserSupabase } from "@/lib/supabaseBrowser"

const supabase = getBrowserSupabase()

type CandidateRow = {
  id: string
  user_id: string | null
  full_name: string | null
  email: string | null
  age: number | null
  city: string | null
  street: string | null
  location_lat: number | null
  location_lon: number | null
  commute_radius_km: number | null
  cv_file_url: string | null
  cv_bucket_path: string | null
  category_tags: string[] | null
  primary_occupation_field: string | string[] | null
  search_keywords: string[] | null
  experience_titles: string[] | null
  education_titles: string[] | null
  seniority_reason: string | null
  relevant_experience_years: Record<string, number | string> | null
  candidate_text_vector: string | null
  manual_premium: boolean | null
  representation_active: boolean | null
  representation_status: string | null
  representation_current_period_end: string | null
  created_at: string | null
}

type AvailabilityBlockRow = {
  id: number
  block_date: string
  start_time: string | null
}

type AdminDocumentOrderRow = {
  id: string
  status: string
  package_name: string
  package_flow: string
  amount_sek: number
  target_role: string | null
  target_job_link: string | null
  intake_full_name: string | null
  intake_email: string | null
  letter_job_title: string | null
  stripe_customer_email: string | null
  stripe_checkout_session_id: string | null
  paid_at: string | null
  delivery_notes: string | null
  delivered_at: string | null
  created_at: string | null
}

type JobResult = {
  id: string
  headline: string | null
  company: string | null
  city: string | null
  occupation_field_label: string | null
  occupation_group_label: string | null
  occupation_label: string | null
  distance_km: number | null
  webpage_url: string | null
  application_deadline?: string | null
  // Semantic scoring (present in semantic mode only)
  display_score?: number | null
  jobbnu_score?: number | null
  vector_similarity?: number | null
  keyword_hit_rate?: number | null
  keyword_miss_rate?: number | null
  keyword_hits?: string[] | null
  contactScanStatus?: string | null
  outreachType?: string | null
  contactEmail?: string | null
  contactName?: string | null
  contactRole?: string | null
  contactDomain?: string | null
  contactNote?: string | null
}

type TabKey = "candidates" | "jobsearch" | "orders" | "calendar" | "cvgen" | "cvmatch" | "savedjobs"
type SavedJobsCategory = "all" | "unsent" | "has_comment" | "email_sent"

type SavedJob = {
  id: string
  created_at: string
  candidate_label: string
  candidate_profile_id: string | null
  job_id: string
  headline: string | null
  company: string | null
  city: string | null
  distance_km: number | null
  webpage_url: string | null
  occupation_group_label: string | null
  notes: string | null
  interview_analysis: string | null
  application_reference: string | null
  manual_contact_email: string | null
  interview_slot_count?: number | null
  email_sent: boolean
  email_sent_at: string | null
  search_mode: string | null
  search_keyword: string | null
  search_address: string | null
  search_radius_km: number | null
  candidate_cv_text: string | null
  latest_outreach_message?: {
    id: string
    recipient_email: string
    subject: string
    text_body: string
    send_status: string
    sent_at: string | null
    created_at: string
  } | null
  outreach_summary?: {
    messagesSent: number
    deliveredMessages: number
    openedMessages: number
    clickedMessages: number
    pageViews: number
    acceptances: number
    bookings: number
    lastSentAt: string | null
    lastRecipient: string | null
    lastSendStatus: string | null
  } | null
}

type InterviewBooking = {
  id: string
  admin_saved_job_id: string | null
  candidate_profile_id: string | null
  company_name: string
  contact_name: string
  contact_email: string
  contact_phone: string | null
  meeting_link: string | null
  booking_date: string
  start_time: string
  end_time: string
  status: string
  admin_followup_status?: string | null
  followup_token?: string | null
  followup_url?: string | null
  employer_followup_email_sent_at?: string | null
  employer_followup_completed_at?: string | null
  employer_followup_notes?: string | null
  agreed_base_salary_sek?: number | null
  employment_start_date?: string | null
  employment_type?: string | null
  employment_contract_signed?: boolean | null
  proof_document_name?: string | null
  proof_document_url?: string | null
  salary_confirmed_at?: string | null
  active_billing_at?: string | null
  employment_ended_at?: string | null
  created_at: string
}

type ContactScanResult = {
  contactScanStatus?: string | null
  outreachType?: string | null
  contactEmail?: string | null
  contactName?: string | null
  contactRole?: string | null
  contactDomain?: string | null
  contactNote?: string | null
}

type CvMatchMode = "freetext" | "user"

function normalizeKeywordSeed(value: string | string[] | null | undefined): string {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean)
      .join(", ")
  }

  return typeof value === "string" ? value.trim() : ""
}

function normalizeKeywordCandidates(candidate: CandidateRow): string {
  const ranked = Array.isArray(candidate.search_keywords)
    ? candidate.search_keywords
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    : []

  if (ranked.length > 0) {
    return ranked.join(", ")
  }

  return normalizeKeywordSeed(candidate.primary_occupation_field)
}

function buildGmailComposeUrl(params: { to: string; subject: string; body: string }) {
  const url = new URL("https://mail.google.com/mail/")
  url.searchParams.set("view", "cm")
  url.searchParams.set("fs", "1")
  url.searchParams.set("to", params.to)
  url.searchParams.set("su", params.subject)
  url.searchParams.set("body", params.body)
  return url.toString()
}

export default function AdminDashboard() {
  const router = useRouter()
  const [tab, setTab] = useState<TabKey>("candidates")
  const [isAuthorized, setIsAuthorized] = useState(false)
  const [authLoading, setAuthLoading] = useState(true)
  const [adminUser, setAdminUser] = useState<User | null>(null)

  // Candidates
  const [candidates, setCandidates] = useState<CandidateRow[]>([])
  const [candidatesLoading, setCandidatesLoading] = useState(false)
  const [candidateSearch, setCandidateSearch] = useState("")
  const [expandedCandidate, setExpandedCandidate] = useState<string | null>(null)
  const [moderatorIds, setModeratorIds] = useState<Set<string>>(new Set())
  const [passwordResetLoadingId, setPasswordResetLoadingId] = useState<string | null>(null)

  // Document orders
  const [documentOrders, setDocumentOrders] = useState<AdminDocumentOrderRow[]>([])
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [orderNotesDraft, setOrderNotesDraft] = useState<Record<string, string>>({})

  // Calendar
  const [blockDate, setBlockDate] = useState("")
  const [blockTime, setBlockTime] = useState("")
  const [blocks, setBlocks] = useState<AvailabilityBlockRow[]>([])

  // CV Generator
  const [cvGenText, setCvGenText] = useState("")
  const [cvGenResult, setCvGenResult] = useState("")
  const [cvGenLoading, setCvGenLoading] = useState(false)
  const [cvGenError, setCvGenError] = useState("")

  // CV Match tab
  const [cmMode, setCmMode] = useState<CvMatchMode>("freetext")
  const [cmCandidate, setCmCandidate] = useState<CandidateRow | null>(null)
  const [cmCandidateSearch, setCmCandidateSearch] = useState("")
  const [cmCvText, setCmCvText] = useState("")
  const [cmAddress, setCmAddress] = useState("")
  const [cmKeywords, setCmKeywords] = useState("")
  const [cmRadius, setCmRadius] = useState("50")
  const [cmResults, setCmResults] = useState<JobResult[]>([])
  const [cmLoading, setCmLoading] = useState(false)
  const [cmError, setCmError] = useState("")
  const [cmTotal, setCmTotal] = useState<number | null>(null)
  const [cmExtractedAddress, setCmExtractedAddress] = useState("")
  const [cmExtractedKeywords, setCmExtractedKeywords] = useState("")
  const [cmSavedJobIds, setCmSavedJobIds] = useState<Set<string>>(new Set())
  // occupation_group_label values from candidate.category_tags (comma-separated text)
  const [cmGroupNames, setCmGroupNames] = useState("")
  const [cmLastSearchMode, setCmLastSearchMode] = useState<"semantic" | "keyword" | null>(null)
  const [cmSaveThreshold, setCmSaveThreshold] = useState("75")
  const [cmBulkSaving, setCmBulkSaving] = useState(false)
  const [cmContactScanLoading, setCmContactScanLoading] = useState(false)

  // Saved jobs
  const [savedJobs, setSavedJobs] = useState<SavedJob[]>([])
  const [savedJobsCandidateFilter, setSavedJobsCandidateFilter] = useState<string>("")
  const [savedJobsCandidateOptions, setSavedJobsCandidateOptions] = useState<Array<{ id: string; label: string }>>([])
  const [deleteAllSavedJobsLoading, setDeleteAllSavedJobsLoading] = useState(false)
  const [savedJobNotes, setSavedJobNotes] = useState<Record<string, string>>({})
  const [savedJobInterviewAnalysis, setSavedJobInterviewAnalysis] = useState<Record<string, string>>({})
  const [savedJobApplicationReferences, setSavedJobApplicationReferences] = useState<Record<string, string>>({})
  const [savedJobManualEmails, setSavedJobManualEmails] = useState<Record<string, string>>({})
  const [savedJobContactScans, setSavedJobContactScans] = useState<Record<string, ContactScanResult>>({})
  const [savedJobContactScanLoading, setSavedJobContactScanLoading] = useState<string | null>(null)
  const [savedJobsContactBatchLoading, setSavedJobsContactBatchLoading] = useState(false)
  const [interviewBookings, setInterviewBookings] = useState<InterviewBooking[]>([])
  const [dueFollowupLoading, setDueFollowupLoading] = useState(false)
  const [dueFollowupMessage, setDueFollowupMessage] = useState("")
  const [bookingStatusLoadingId, setBookingStatusLoadingId] = useState<string | null>(null)
  const [emailGenLoading, setEmailGenLoading] = useState<string | null>(null)
  const [emailSendLoading, setEmailSendLoading] = useState<string | null>(null)
  const [emailPreviewLoading, setEmailPreviewLoading] = useState<string | null>(null)
  const [generatedEmails, setGeneratedEmails] = useState<Record<string, string>>({})
  const [emailPreviews, setEmailPreviews] = useState<Record<string, {
    subject: string
    textBody: string
    htmlBody: string
    bookingLink: string | null
  }>>({})
  const [introLinkLoading, setIntroLinkLoading] = useState<string | null>(null)
  const [employerIntroLinks, setEmployerIntroLinks] = useState<Record<string, string>>({})
  const [savedJobsCategoryFilter, setSavedJobsCategoryFilter] = useState<SavedJobsCategory>("all")

  // Job search
  const [jsAddress, setJsAddress] = useState("")
  const [jsRadius, setJsRadius] = useState("50")
  const [jsKeyword, setJsKeyword] = useState("")
  const [jsResults, setJsResults] = useState<JobResult[]>([])
  const [jsLoading, setJsLoading] = useState(false)
  const [jsError, setJsError] = useState("")
  const [jsTotal, setJsTotal] = useState<number | null>(null)

  useEffect(() => {
    let mounted = true

    async function bootstrap() {
      const { data } = await supabase.auth.getUser()
      const user = data.user ?? null

      if (!mounted) return

      if (!user) {
        router.push("/admin/login")
        setAuthLoading(false)
        return
      }

      if (!isAdminOrModerator(user)) {
        router.push("/")
        setAuthLoading(false)
        return
      }

      setAdminUser(user)
      setIsAuthorized(true)
      setAuthLoading(false)
      fetchCandidates()
      fetchBlocks()
      fetchDocumentOrders()
      fetchSavedJobs()
      fetchInterviewBookings()
    }

    bootstrap()

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        setIsAuthorized(false)
        setAdminUser(null)
        router.push("/admin/login")
        return
      }
      const user = session?.user ?? null
      if (!user) return // transient state during token refresh — bootstrap() handles initial check
      if (!isAdminOrModerator(user)) {
        setIsAuthorized(false)
        setAdminUser(null)
        router.push("/")
        return
      }
      setAdminUser(user)
      setIsAuthorized(true)
    })

    return () => {
      mounted = false
      authListener.subscription.unsubscribe()
    }
  }, [router])

  const fetchCandidates = async () => {
    setCandidatesLoading(true)
    try {
      const res = await fetch("/api/admin/candidates")
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || "Failed to fetch candidates")
      setCandidates((json.data || []) as CandidateRow[])
    } catch (err) {
      console.error(err)
      alert("Kunde inte hämta kandidater")
    } finally {
      setCandidatesLoading(false)
    }
  }

  const fetchBlocks = async () => {
    try {
      const res = await fetch("/api/admin/availability-blocks")
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || "Failed to fetch availability blocks")
      setBlocks((json.data || []) as AvailabilityBlockRow[])
    } catch (err) {
      console.error(err)
    }
  }

  const fetchDocumentOrders = async () => {
    setOrdersLoading(true)
    try {
      const res = await fetch("/api/admin/document-orders")
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || "Failed to fetch document orders")
      setDocumentOrders(json.data || [])
      setOrderNotesDraft((prev) => {
        const next = { ...prev }
        for (const o of json.data || []) {
          if (!(o.id in next)) next[o.id] = o.delivery_notes || ""
        }
        return next
      })
    } catch (err: unknown) {
      console.error(err)
    } finally {
      setOrdersLoading(false)
    }
  }

  const fetchSavedJobs = async (candidateProfileId?: string | null) => {
    try {
      const query = candidateProfileId ? `?candidateProfileId=${encodeURIComponent(candidateProfileId)}` : ""
      const res = await fetch(`/api/admin/saved-jobs${query}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || "Failed")
      const jobs: SavedJob[] = json.data || []
      setSavedJobs(jobs)
      if (!candidateProfileId) {
        const options = new Map<string, string>()
        for (const job of jobs) {
          if (!job.candidate_profile_id) continue
          options.set(job.candidate_profile_id, job.candidate_label || "Okänd kandidat")
        }
        setSavedJobsCandidateOptions(
          Array.from(options.entries())
            .map(([id, label]) => ({ id, label }))
            .sort((a, b) => a.label.localeCompare(b.label, "sv"))
        )
      }
      setSavedJobNotes((prev) => {
        const next = { ...prev }
        for (const j of jobs) {
          if (!(j.id in next)) next[j.id] = j.notes || ""
        }
        return next
      })
      setSavedJobInterviewAnalysis((prev) => {
        const next = { ...prev }
        for (const j of jobs) {
          if (!(j.id in next)) next[j.id] = j.interview_analysis || ""
        }
        return next
      })
      setSavedJobApplicationReferences((prev) => {
        const next = { ...prev }
        for (const j of jobs) {
          if (!(j.id in next)) next[j.id] = j.application_reference || ""
        }
        return next
      })
      setSavedJobManualEmails((prev) => {
        const next = { ...prev }
        for (const j of jobs) {
          if (!(j.id in next)) next[j.id] = j.manual_contact_email || ""
        }
        return next
      })
      setGeneratedEmails((prev) => {
        const next = { ...prev }
        for (const j of jobs) {
          if (next[j.id]) continue
          const latest = j.latest_outreach_message
          if (!latest?.subject || !latest?.text_body) continue
          next[j.id] = `Subject: ${latest.subject}\n\n${latest.text_body}`
        }
        return next
      })
    } catch (err) {
      console.error("fetchSavedJobs:", err)
    }
  }

  const fetchInterviewBookings = async (candidateProfileId?: string | null) => {
    try {
      const query = candidateProfileId ? `?candidateProfileId=${encodeURIComponent(candidateProfileId)}` : ""
      const res = await fetch(`/api/admin/interview-bookings${query}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || "Failed")
      setInterviewBookings((json.data || []) as InterviewBooking[])
    } catch (err) {
      console.error("fetchInterviewBookings:", err)
    }
  }

  useEffect(() => {
    const candidateProfileId = cmMode === "user" ? cmCandidate?.id ?? null : null
    void fetchSavedJobs(candidateProfileId)
    void fetchInterviewBookings(candidateProfileId)
  }, [cmMode, cmCandidate?.id])

  useEffect(() => {
    if (!savedJobsCandidateFilter && cmMode === "user" && cmCandidate?.id) {
      setSavedJobsCandidateFilter(cmCandidate.id)
    }
  }, [cmMode, cmCandidate, savedJobsCandidateFilter])

  useEffect(() => {
    const relevantSavedJobs = savedJobs.filter((job) =>
      cmMode === "user" && cmCandidate ? job.candidate_profile_id === cmCandidate.id : true
    )
    setCmSavedJobIds(new Set(relevantSavedJobs.map((job) => job.job_id).filter(Boolean)))
  }, [savedJobs, cmMode, cmCandidate])

  const savedJobsCategoryCounts = useMemo(() => {
    let unsent = 0
    let hasComment = 0
    let emailSent = 0

    for (const job of savedJobs) {
      const hasCommentFlag = Boolean((job.notes || "").trim())
      const emailSentFlag = Boolean(job.email_sent || (job.outreach_summary?.messagesSent || 0) > 0)
      if (!emailSentFlag) unsent += 1
      if (hasCommentFlag) hasComment += 1
      if (emailSentFlag) emailSent += 1
    }

    return {
      all: savedJobs.length,
      unsent,
      has_comment: hasComment,
      email_sent: emailSent,
    }
  }, [savedJobs])

  const filteredSavedJobs = useMemo(() => {
    return savedJobs.filter((job) => {
      const hasCommentFlag = Boolean((job.notes || "").trim())
      const emailSentFlag = Boolean(job.email_sent || (job.outreach_summary?.messagesSent || 0) > 0)

      if (savedJobsCategoryFilter === "unsent") return !emailSentFlag
      if (savedJobsCategoryFilter === "has_comment") return hasCommentFlag
      if (savedJobsCategoryFilter === "email_sent") return emailSentFlag
      return true
    })
  }, [savedJobs, savedJobsCategoryFilter])

  const handleCvMatch = async (mode: "semantic" | "keyword") => {
    if (mode === "keyword" && !cmKeywords.trim()) {
      return setCmError("Ange yrke/nyckelord för yrkes-sökning")
    }
    if (!cmAddress.trim() && !cmCvText.trim() && !cmCandidate?.candidate_text_vector?.trim() && !cmCandidate?.location_lat) {
      return setCmError("Ange adress, välj kandidat med sparad adress, eller klistra in CV-text")
    }
    setCmLoading(true)
    setCmError("")
    setCmResults([])
    setCmTotal(null)
    setCmLastSearchMode(mode)
    setCmExtractedAddress("")
    setCmExtractedKeywords("")
    const groupNamesArr = cmGroupNames
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
    try {
      const res = await fetch("/api/admin/cv-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          searchMode: mode,
          cvText: cmCvText.trim(),
          candidateProfileId: cmMode === "user" && cmCandidate ? cmCandidate.id : null,
          address: cmAddress.trim(),
          keywords: cmKeywords.trim(),
          groupNames: groupNamesArr,
          radiusKm: Number(cmRadius),
          limit: 100,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || "Matchning misslyckades")
      setCmResults(json.results || [])
      setCmTotal(json.total)
      if (json.extractedAddress) setCmExtractedAddress(json.extractedAddress)
      if (json.extractedKeywords) setCmExtractedKeywords(json.extractedKeywords)
      if (!cmAddress.trim() && json.address) setCmAddress(json.address)
      if (!cmKeywords.trim() && json.keywords) setCmKeywords(json.keywords)
    } catch (err: unknown) {
      setCmError(err instanceof Error ? err.message : "Okänt fel")
    } finally {
      setCmLoading(false)
    }
  }

  const handleSaveJob = async (job: JobResult) => {
    const candidateLabel =
      cmMode === "user" && cmCandidate
        ? cmCandidate.full_name || cmCandidate.email || "Kandidat"
        : "Inklistrad CV"
    const candidateCvText =
      cmCvText.trim() ||
      (cmMode === "user" ? cmCandidate?.candidate_text_vector?.trim() || "" : "")
    try {
      const res = await fetch("/api/admin/saved-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateLabel,
          candidateProfileId: cmMode === "user" ? cmCandidate?.id : null,
          jobId: job.id,
          headline: job.headline,
          company: job.company,
          city: job.city,
          distanceKm: job.distance_km,
          webpageUrl: job.webpage_url,
          occupationGroupLabel: job.occupation_group_label,
          searchMode: cmLastSearchMode,
          searchKeyword: cmKeywords.trim() || null,
          searchAddress: cmAddress.trim() || null,
          searchRadiusKm: Number(cmRadius),
          candidateCvText: candidateCvText || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || "Save failed")
      setCmSavedJobIds((prev) => new Set(prev).add(job.id))
      await fetchSavedJobs(cmMode === "user" ? cmCandidate?.id ?? null : null)
    } catch (err) {
      console.error(err)
      alert("Kunde inte spara jobbet")
    }
  }

  const handleSaveJobsByScore = async () => {
    const threshold = Number(cmSaveThreshold)
    if (!Number.isFinite(threshold)) {
      setCmError("Ange en giltig scoregräns")
      return
    }

    const jobsToSave = cmResults.filter((job) => {
      if (cmSavedJobIds.has(job.id)) return false
      const score = job.display_score ?? job.jobbnu_score
      return typeof score === "number" && score >= threshold
    })

    if (jobsToSave.length === 0) {
      setCmError(`Inga osparade jobb hittades över ${threshold}%`)
      return
    }

    const candidateLabel =
      cmMode === "user" && cmCandidate
        ? cmCandidate.full_name || cmCandidate.email || "Kandidat"
        : "Inklistrad CV"
    const candidateCvText =
      cmCvText.trim() ||
      (cmMode === "user" ? cmCandidate?.candidate_text_vector?.trim() || "" : "")

    setCmBulkSaving(true)
    setCmError("")

    try {
      const savedIds = new Set<string>()

      for (const job of jobsToSave) {
        const res = await fetch("/api/admin/saved-jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            candidateLabel,
            candidateProfileId: cmMode === "user" ? cmCandidate?.id : null,
            jobId: job.id,
            headline: job.headline,
            company: job.company,
            city: job.city,
            distanceKm: job.distance_km,
            webpageUrl: job.webpage_url,
            occupationGroupLabel: job.occupation_group_label,
            searchMode: cmLastSearchMode,
            searchKeyword: cmKeywords.trim() || null,
            searchAddress: cmAddress.trim() || null,
            searchRadiusKm: Number(cmRadius),
            candidateCvText: candidateCvText || null,
          }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json?.error || "Bulk save failed")
        savedIds.add(job.id)
      }

      setCmSavedJobIds((prev) => {
        const next = new Set(prev)
        for (const id of savedIds) next.add(id)
        return next
      })
      await fetchSavedJobs(cmMode === "user" ? cmCandidate?.id ?? null : null)
    } catch (err) {
      console.error(err)
      setCmError(err instanceof Error ? err.message : "Kunde inte spara jobb")
    } finally {
      setCmBulkSaving(false)
    }
  }

  const handleScanJobContacts = async () => {
    if (cmResults.length === 0) {
      setCmError("Inga jobb att skanna")
      return
    }

    setCmContactScanLoading(true)
    setCmError("")

    try {
      const res = await fetch("/api/admin/job-contact-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobs: cmResults.map((job) => ({
            id: job.id,
            headline: job.headline,
            company: job.company,
            webpage_url: job.webpage_url,
          })),
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || "Kontakt-scan misslyckades")

      const byId = new Map<string, Record<string, unknown>>()
      for (const row of json.results || []) {
        if (row?.id) byId.set(String(row.id), row)
      }

      setCmResults((prev) =>
        prev.map((job) => {
          const scan = byId.get(job.id)
          if (!scan) return job
          return {
            ...job,
            contactScanStatus: typeof scan.contactScanStatus === "string" ? scan.contactScanStatus : null,
            outreachType: typeof scan.outreachType === "string" ? scan.outreachType : null,
            contactEmail: typeof scan.contactEmail === "string" ? scan.contactEmail : null,
            contactName: typeof scan.contactName === "string" ? scan.contactName : null,
            contactRole: typeof scan.contactRole === "string" ? scan.contactRole : null,
            contactDomain: typeof scan.contactDomain === "string" ? scan.contactDomain : null,
            contactNote: typeof scan.contactNote === "string" ? scan.contactNote : null,
          }
        })
      )
    } catch (err) {
      setCmError(err instanceof Error ? err.message : "Kontakt-scan misslyckades")
    } finally {
      setCmContactScanLoading(false)
    }
  }

  const handleDeleteSavedJob = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/saved-jobs/${id}`, { method: "DELETE" })
      if (!res.ok) throw new Error("Delete failed")
      setSavedJobs((prev) => prev.filter((j) => j.id !== id))
    } catch (err) {
      console.error(err)
      alert("Kunde inte ta bort")
    }
  }

  const handleDeleteAllSavedJobs = async () => {
    const targetLabel = savedJobsCandidateFilter
      ? savedJobsCandidateOptions.find((option) => option.id === savedJobsCandidateFilter)?.label || "vald kandidat"
      : "alla kandidater"

    const confirmed = window.confirm(
      savedJobsCandidateFilter
        ? `Ta bort alla sparade jobb för ${targetLabel}?`
        : "Ta bort alla sparade jobb?"
    )

    if (!confirmed) return

    setDeleteAllSavedJobsLoading(true)
    try {
      const query = savedJobsCandidateFilter
        ? `?candidateProfileId=${encodeURIComponent(savedJobsCandidateFilter)}`
        : ""
      const res = await fetch(`/api/admin/saved-jobs${query}`, { method: "DELETE" })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || "Bulk delete failed")

      setSavedJobs([])
      setSavedJobNotes({})
      setSavedJobInterviewAnalysis({})
      setSavedJobManualEmails({})
      setSavedJobContactScans({})
      setGeneratedEmails({})
      setEmployerIntroLinks((prev) => {
        if (!savedJobsCandidateFilter) return {}
        const next = { ...prev }
        for (const job of savedJobs) {
          delete next[job.id]
        }
        return next
      })
      await fetchSavedJobs(savedJobsCandidateFilter || null)
    } catch (err) {
      alert("Kunde inte ta bort sparade jobb: " + (err instanceof Error ? err.message : "okänt fel"))
    } finally {
      setDeleteAllSavedJobsLoading(false)
    }
  }

  const handleSaveJobNotes = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/saved-jobs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: savedJobNotes[id] ?? "" }),
      })
      if (!res.ok) throw new Error("Update failed")
      setSavedJobs((prev) =>
        prev.map((j) => (j.id === id ? { ...j, notes: savedJobNotes[id] ?? "" } : j))
      )
    } catch (err) {
      console.error(err)
      alert("Kunde inte spara anteckning")
    }
  }

  const handleSaveInterviewAnalysis = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/saved-jobs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interviewAnalysis: savedJobInterviewAnalysis[id] ?? "" }),
      })
      if (!res.ok) throw new Error("Update failed")
      setSavedJobs((prev) =>
        prev.map((j) =>
          j.id === id ? { ...j, interview_analysis: savedJobInterviewAnalysis[id] ?? "" } : j
        )
      )
    } catch (err) {
      console.error(err)
      alert("Kunde inte spara intervjuanalys")
    }
  }

  const handleSaveApplicationReference = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/saved-jobs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicationReference: savedJobApplicationReferences[id] ?? "" }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || "Save failed")
      setSavedJobs((prev) =>
        prev.map((j) =>
          j.id === id ? { ...j, application_reference: savedJobApplicationReferences[id] ?? "" } : j
        )
      )
    } catch (err) {
      alert("Kunde inte spara ansökningsreferens")
      console.error(err)
    }
  }

  const handleSaveManualContactEmail = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/saved-jobs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manualContactEmail: savedJobManualEmails[id] ?? "" }),
      })
      if (!res.ok) throw new Error("Update failed")
      setSavedJobs((prev) =>
        prev.map((j) =>
          j.id === id ? { ...j, manual_contact_email: savedJobManualEmails[id] ?? "" } : j
        )
      )
    } catch (err) {
      console.error(err)
      alert("Kunde inte spara manuellt kontaktmail")
    }
  }

  const handleMarkEmailSent = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/saved-jobs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailSent: true }),
      })
      if (!res.ok) throw new Error("Update failed")
      setSavedJobs((prev) =>
        prev.map((j) => (j.id === id ? { ...j, email_sent: true } : j))
      )
    } catch (err) {
      console.error(err)
      alert("Kunde inte markera e-post som skickad")
    }
  }

  const handleSendOutreachEmail = async (job: SavedJob) => {
    const generated = generatedEmails[job.id]
    if (!generated?.trim()) {
      alert("Generera e-post först.")
      return
    }

    const contact = savedJobContactScans[job.id]
    const recipientEmail = (savedJobManualEmails[job.id] || job.manual_contact_email || contact?.contactEmail || "").trim()
    if (!recipientEmail) {
      alert("Ange manuellt kontaktmail eller skanna kontaktinfo först.")
      return
    }

    setEmailSendLoading(job.id)
    try {
      const res = await fetch("/api/admin/send-outreach-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          savedJobId: job.id,
          recipientEmail,
          recipientName: contact?.contactName || "",
          emailText: generated,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || "Kunde inte skicka e-post")

      await fetchSavedJobs(savedJobsCandidateFilter || null)
      alert(`E-post skickad till ${recipientEmail}`)
    } catch (err) {
      alert("Kunde inte skicka e-post: " + (err instanceof Error ? err.message : "okänt fel"))
    } finally {
      setEmailSendLoading(null)
    }
  }

  const handlePreviewOutreachEmail = async (job: SavedJob) => {
    const generated = generatedEmails[job.id]
    if (!generated?.trim()) {
      alert("Generera e-post först.")
      return
    }

    setEmailPreviewLoading(job.id)
    try {
      const res = await fetch("/api/admin/outreach-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          savedJobId: job.id,
          emailText: generated,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || "Kunde inte skapa förhandsgranskning")

      const preview = json?.data
      if (preview?.bookingLink) {
        setEmployerIntroLinks((prev) => ({ ...prev, [job.id]: preview.bookingLink }))
      }
      setEmailPreviews((prev) => ({
        ...prev,
        [job.id]: {
          subject: preview?.subject || "",
          textBody: preview?.textBody || "",
          htmlBody: preview?.htmlBody || "",
          bookingLink: preview?.bookingLink || null,
        },
      }))
    } catch (err) {
      alert("Kunde inte skapa förhandsgranskning: " + (err instanceof Error ? err.message : "okänt fel"))
    } finally {
      setEmailPreviewLoading(null)
    }
  }

  const handleScanSavedJobsContacts = async (jobIds?: string[]) => {
    const targetJobs = savedJobs.filter((job) => !jobIds || jobIds.includes(job.id))
    if (targetJobs.length === 0) return

    if (jobIds && jobIds.length === 1) {
      setSavedJobContactScanLoading(jobIds[0])
    } else {
      setSavedJobsContactBatchLoading(true)
    }

    try {
      const res = await fetch("/api/admin/job-contact-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobs: targetJobs.map((job) => ({
            id: job.id,
            headline: job.headline,
            company: job.company,
            webpage_url: job.webpage_url,
          })),
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || "Kontakt-scan misslyckades")

      const next: Record<string, ContactScanResult> = {}
      for (const result of json.results || []) {
        if (!result?.id) continue
        next[result.id] = {
          contactScanStatus: typeof result.contactScanStatus === "string" ? result.contactScanStatus : null,
          outreachType: typeof result.outreachType === "string" ? result.outreachType : null,
          contactEmail: typeof result.contactEmail === "string" ? result.contactEmail : null,
          contactName: typeof result.contactName === "string" ? result.contactName : null,
          contactRole: typeof result.contactRole === "string" ? result.contactRole : null,
          contactDomain: typeof result.contactDomain === "string" ? result.contactDomain : null,
          contactNote: typeof result.contactNote === "string" ? result.contactNote : null,
        }
      }
      setSavedJobContactScans((prev) => ({ ...prev, ...next }))
    } catch (err) {
      alert("Kunde inte skanna kontaktinfo: " + (err instanceof Error ? err.message : "okänt fel"))
    } finally {
      setSavedJobContactScanLoading(null)
      setSavedJobsContactBatchLoading(false)
    }
  }

  const handleGenerateEmail = async (job: SavedJob) => {
    setEmailGenLoading(job.id)
    try {
      const linkRes = await fetch("/api/admin/employer-intro-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ savedJobId: job.id }),
      })
      const linkJson = await linkRes.json()
      if (!linkRes.ok) throw new Error(linkJson?.error || "Kunde inte skapa introduktionslänk")
      const bookingLink = linkJson?.data?.publicUrl || ""
      if (bookingLink) {
        setEmployerIntroLinks((prev) => ({ ...prev, [job.id]: bookingLink }))
      }

      const cvText =
        job.candidate_cv_text ||
        (cmMode === "user" && cmCandidate
          ? cmCvText || cmCandidate.candidate_text_vector || `Kandidat med kompetenser: ${cmCandidate.category_tags?.join(", ") || ""}`
          : cmCvText)
      const res = await fetch("/api/admin/generate-outreach-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: job.job_id,
          candidateLabel: job.candidate_label,
          candidateProfileId: job.candidate_profile_id,
          cvText,
          jobHeadline: job.headline,
          company: job.company,
          distanceKm: job.distance_km,
          occupationGroupLabel: job.occupation_group_label,
          bookingLink,
          interviewAnalysis: savedJobInterviewAnalysis[job.id] ?? job.interview_analysis ?? "",
          applicationReference: savedJobApplicationReferences[job.id] ?? job.application_reference ?? "",
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || "Generation failed")
      setGeneratedEmails((prev) => ({ ...prev, [job.id]: json.email || "" }))
    } catch (err) {
      alert("Kunde inte generera e-post: " + (err instanceof Error ? err.message : "okänt fel"))
    } finally {
      setEmailGenLoading(null)
    }
  }

  const handleCreateEmployerIntroLink = async (job: SavedJob) => {
    setIntroLinkLoading(job.id)
    try {
      const res = await fetch("/api/admin/employer-intro-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ savedJobId: job.id }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || "Kunde inte skapa länk")
      const publicUrl = json?.data?.publicUrl
      if (publicUrl) {
        setEmployerIntroLinks((prev) => ({ ...prev, [job.id]: publicUrl }))
        await navigator.clipboard.writeText(publicUrl)
      }
    } catch (err) {
      alert("Kunde inte skapa introduktionslänk: " + (err instanceof Error ? err.message : "okänt fel"))
    } finally {
      setIntroLinkLoading(null)
    }
  }

  const handleOpenInGmail = (job: SavedJob) => {
    const generated = generatedEmails[job.id]
    if (!generated?.trim()) {
      alert("Generera e-post först.")
      return
    }

    const contact = savedJobContactScans[job.id]
    const recipient = (savedJobManualEmails[job.id] || job.manual_contact_email || contact?.contactEmail || "").trim()
    if (!recipient) {
      alert("Ange manuellt kontaktmail eller skanna kontaktinfo först.")
      return
    }

    const { subject, body } = parseGeneratedEmail(generated)
    const gmailUrl = buildGmailComposeUrl({
      to: recipient,
      subject,
      body,
    })

    window.open(gmailUrl, "_blank", "noopener,noreferrer")
  }

  const handleUpdateInterviewFollowup = async (bookingId: string, adminFollowupStatus: string) => {
    setBookingStatusLoadingId(bookingId)
    try {
      const res = await fetch(`/api/admin/interview-bookings/${bookingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminFollowupStatus }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || "Update failed")
      setInterviewBookings((prev) =>
        prev.map((booking) =>
          booking.id === bookingId
            ? { ...booking, ...(json.data || {}), admin_followup_status: adminFollowupStatus }
            : booking
        )
      )
    } catch (err) {
      alert("Kunde inte uppdatera kandidatstatus: " + (err instanceof Error ? err.message : "okänt fel"))
    } finally {
      setBookingStatusLoadingId(null)
    }
  }

  const handleSendDueInterviewFollowups = async () => {
    setDueFollowupLoading(true)
    setDueFollowupMessage("")
    try {
      const res = await fetch("/api/interview-followups/run", { method: "POST" })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || "Could not send follow-up emails")
      setDueFollowupMessage(`Skickade ${json.sent ?? 0} uppföljningsmail${json.due ? ` av ${json.due} förfallna` : ""}.`)
      await fetchInterviewBookings(savedJobsCandidateFilter || null)
    } catch (err) {
      setDueFollowupMessage(err instanceof Error ? err.message : "Okänt fel")
    } finally {
      setDueFollowupLoading(false)
    }
  }

  const isSuperAdmin = isAdminUser(adminUser)
  const candidatesWithInterviewReady = new Set(
    interviewBookings
      .filter((booking) => booking.candidate_profile_id && booking.admin_followup_status !== "interview_completed")
      .map((booking) => booking.candidate_profile_id as string)
  )
  const savedJobsLabel = savedJobsCandidateFilter
    ? `Sparade Jobb för ${
        savedJobsCandidateOptions.find((option) => option.id === savedJobsCandidateFilter)?.label || "vald kandidat"
      }`
    : "Sparade Jobb"

  const togglePremium = async (candidate: CandidateRow) => {
    const newValue = !candidate.manual_premium
    try {
      const res = await fetch(`/api/admin/candidates/${candidate.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manual_premium: newValue }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || "Update failed")
      setCandidates((prev) =>
        prev.map((c) => (c.id === candidate.id ? { ...c, manual_premium: newValue } : c))
      )
    } catch (err) {
      console.error(err)
      alert("Kunde inte uppdatera premium-status")
    }
  }

  const toggleModerator = async (candidate: CandidateRow, currentlyModerator: boolean) => {
    if (!candidate.user_id) return alert("Användaren saknar user_id")
    const uid = candidate.user_id
    const newRole = currentlyModerator ? null : "moderator"
    try {
      const res = await fetch(`/api/admin/users/${uid}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || "Update failed")
      setModeratorIds((prev) => {
        const next = new Set(prev)
        if (newRole) {
          next.add(uid)
        } else {
          next.delete(uid)
        }
        return next
      })
    } catch (err) {
      console.error(err)
      alert("Kunde inte uppdatera roll")
    }
  }

  const sendPasswordReset = async (candidate: CandidateRow) => {
    if (!candidate.email) {
      return alert("Kandidaten saknar e-postadress")
    }

    setPasswordResetLoadingId(candidate.id)
    try {
      const res = await fetch("/api/admin/users/send-password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: candidate.email }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || "Kunde inte skicka återställningslänk")
      alert(`Återställningslänk skickad till ${candidate.email}`)
    } catch (err) {
      alert(
        "Kunde inte skicka återställningslänk: " +
          (err instanceof Error ? err.message : "okänt fel")
      )
    } finally {
      setPasswordResetLoadingId(null)
    }
  }

  const viewCv = async (cvPath?: string | null, cvBucketPath?: string | null) => {
    try {
      const path = cvBucketPath || cvPath || ""
      if (!path) return alert("Ingen sökväg till filen.")
      const res = await fetch("/api/admin/view-cv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
      })
      const json = await res.json()
      if (json.signedUrl) {
        window.open(json.signedUrl, "_blank")
      } else {
        alert("Kunde inte hämta filen.")
      }
    } catch (err) {
      console.error(err)
      alert("Fel vid öppning av CV.")
    }
  }

  const handleBlockTime = async () => {
    if (!blockDate) return alert("Välj datum")
    try {
      const res = await fetch("/api/admin/availability-blocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blockDate, blockTime }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || "Fel vid blockering")
      alert("Tid blockerad!")
      fetchBlocks()
    } catch (err) {
      console.error(err)
      alert("Fel vid blockering")
    }
  }

  const handleDeleteBlock = async (id: number) => {
    try {
      const res = await fetch(`/api/admin/availability-blocks/${id}`, { method: "DELETE" })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || "Delete failed")
      fetchBlocks()
    } catch (err) {
      console.error(err)
      alert("Kunde inte ta bort blockering")
    }
  }

  const updateDocumentOrder = async (id: string, patch: { status?: string; deliveryNotes?: string }) => {
    try {
      const res = await fetch(`/api/admin/document-orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || "Update failed")
      await fetchDocumentOrders()
    } catch (err: unknown) {
      console.error(err)
      alert("Kunde inte uppdatera: " + (err instanceof Error ? err.message : "okänt fel"))
    }
  }

  const handleJobSearch = async () => {
    if (!jsAddress.trim()) return setJsError("Ange en adress eller stad")
    setJsLoading(true)
    setJsError("")
    setJsResults([])
    setJsTotal(null)
    try {
      const res = await fetch("/api/admin/job-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: jsAddress.trim(),
          radiusKm: Number(jsRadius),
          keyword: jsKeyword.trim(),
          limit: 100,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || "Search failed")
      setJsResults(json.results || [])
      setJsTotal(json.total)
    } catch (err: unknown) {
      setJsError(err instanceof Error ? err.message : "Okänt fel")
    } finally {
      setJsLoading(false)
    }
  }

  const handleLogout = () => {
    supabase.auth.signOut().finally(() => {
      setIsAuthorized(false)
      setAdminUser(null)
      router.push("/login")
    })
  }

  if (authLoading) return null
  if (!isAuthorized) return null

  const filteredCandidates = candidates.filter((c) => {
    if (!candidateSearch) return true
    const q = candidateSearch.toLowerCase()
    return (
      c.full_name?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.city?.toLowerCase().includes(q) ||
      c.category_tags?.some((t) => t.toLowerCase().includes(q))
    )
  })

  const handleCvGen = async () => {
    if (!cvGenText.trim()) return setCvGenError("Klistra in text först")
    setCvGenLoading(true)
    setCvGenError("")
    setCvGenResult("")
    try {
      const res = await fetch("/api/admin/generate-cv-freetext", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: cvGenText }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || "Generation failed")
      setCvGenResult(json.cv || "")
    } catch (err) {
      setCvGenError(err instanceof Error ? err.message : "Okänt fel")
    } finally {
      setCvGenLoading(false)
    }
  }

  const downloadTxt = () => {
    const blob = new Blob([cvGenResult], { type: "text/plain;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "cv.txt"
    a.click()
    URL.revokeObjectURL(url)
  }

  const downloadPdf = () => {
    const html = `<!DOCTYPE html>
<html lang="sv">
<head>
<meta charset="utf-8">
<title>CV</title>
<style>
  body { font-family: Arial, sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; font-size: 13px; line-height: 1.5; color: #111; }
  h1 { font-size: 22px; margin-bottom: 2px; }
  h2 { font-size: 15px; border-bottom: 1px solid #ccc; padding-bottom: 3px; margin-top: 18px; }
  h3 { font-size: 13px; margin-bottom: 2px; }
  hr { border: none; border-top: 1px solid #ddd; margin: 10px 0; }
  ul { margin: 4px 0; padding-left: 18px; }
  li { margin-bottom: 2px; }
  strong { font-weight: 600; }
  @media print { body { margin: 0; } }
</style>
</head>
<body>
<pre style="white-space:pre-wrap;font-family:inherit">${cvGenResult.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre>
</body>
</html>`
    const win = window.open("", "_blank")
    if (!win) return alert("Tillåt popups för att ladda ner PDF")
    win.document.write(html)
    win.document.close()
    win.focus()
    setTimeout(() => win.print(), 300)
  }

  const TAB_LABELS: { key: TabKey; label: string }[] = [
    { key: "candidates", label: "Kandidater" },
    { key: "cvmatch", label: "CV Matchning" },
    { key: "savedjobs", label: "Sparade Jobb" },
    { key: "orders", label: "Beställningar" },
    { key: "calendar", label: "Kalender" },
    { key: "cvgen", label: "CV-generator" },
  ]

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top bar */}
      <div className="bg-white border-b px-6 py-3 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">Admin Dashboard</h1>
        <div className="flex items-center gap-3">
          {adminUser?.email && <span className="text-sm text-slate-500">{adminUser.email}</span>}
          <Button variant="outline" size="sm" onClick={handleLogout}>Logga ut</Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b px-6">
        <div className="flex gap-0">
          {TAB_LABELS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => {
                setTab(key)
                if (key === "savedjobs") {
                  const candidateProfileId = savedJobsCandidateFilter || (cmMode === "user" ? cmCandidate?.id ?? null : null)
                  void fetchSavedJobs(candidateProfileId)
                  void fetchInterviewBookings(candidateProfileId)
                }
              }}
              className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === key
                  ? "border-blue-600 text-blue-700"
                  : "border-transparent text-slate-600 hover:text-slate-900"
              }`}
            >
              {label}
              {key === "candidates" && candidates.length > 0 && (
                <span className="ml-1.5 text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full">
                  {candidates.length}
                </span>
              )}
              {key === "orders" && documentOrders.length > 0 && (
                <span className="ml-1.5 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">
                  {documentOrders.length}
                </span>
              )}
              {key === "savedjobs" && savedJobs.length > 0 && (
                <span className="ml-1.5 text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">
                  {savedJobs.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6">

        {/* ═══ TAB: Candidates ═══ */}
        {tab === "candidates" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Kandidater ({filteredCandidates.length})</h2>
              <div className="flex gap-2">
                <Input
                  placeholder="Sök namn, e-post, stad, kategori..."
                  className="w-72"
                  value={candidateSearch}
                  onChange={(e) => setCandidateSearch(e.target.value)}
                />
                <Button variant="outline" size="sm" onClick={fetchCandidates} disabled={candidatesLoading}>
                  {candidatesLoading ? "Laddar..." : "Uppdatera"}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              {filteredCandidates.map((c) => (
                <div key={c.id} className="bg-white rounded-lg border shadow-sm">
                  <div
                    className="flex items-center justify-between p-4 cursor-pointer hover:bg-slate-50"
                    onClick={() => setExpandedCandidate(expandedCandidate === c.id ? null : c.id)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 truncate">
                          {c.full_name || "(inget namn)"}
                          {c.age != null ? `, ${c.age}` : ""}
                        </p>
                        <p className="text-sm text-slate-500 truncate">{c.email} {c.city ? `• ${c.city}` : ""}</p>
                        {candidatesWithInterviewReady.has(c.id) && (
                          <p className="text-xs font-medium text-red-600 mt-0.5">Interview ready</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 ml-4">
                      {c.manual_premium && (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                          Premium
                        </span>
                      )}
                      {c.representation_active && (
                        <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
                          Representation aktiv
                        </span>
                      )}
                      {c.category_tags && c.category_tags.length > 0 && (
                        <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
                          {c.category_tags.length} tags
                        </span>
                      )}
                      <span className="text-slate-400 text-sm">{expandedCandidate === c.id ? "▲" : "▼"}</span>
                    </div>
                  </div>

                  {expandedCandidate === c.id && (
                    <div className="border-t px-4 pb-4 pt-3 space-y-3 bg-slate-50 rounded-b-lg">
                      {/* Category tags */}
                      {c.category_tags && c.category_tags.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-slate-500 mb-1">Yrkeskategorier</p>
                          <div className="flex flex-wrap gap-1.5">
                            {c.category_tags.map((tag) => (
                              <span key={tag} className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {c.primary_occupation_field && (
                        <p className="text-xs text-slate-600">
                          <span className="font-medium">Primärt fält:</span> {c.primary_occupation_field}
                        </p>
                      )}

                      {c.representation_status && (
                        <p className="text-xs text-slate-600">
                          <span className="font-medium">Kandidatrepresentation:</span> {c.representation_active ? "Betald" : c.representation_status}
                          {c.representation_current_period_end
                            ? ` · aktiv till ${new Date(c.representation_current_period_end).toLocaleDateString("sv-SE")}`
                            : ""}
                        </p>
                      )}

                      {/* Actions row */}
                      <div className="flex flex-wrap gap-2 pt-1">
                        {isSuperAdmin && (
                          <Button
                            size="sm"
                            variant={c.manual_premium ? "destructive" : "default"}
                            onClick={() => togglePremium(c)}
                          >
                            {c.manual_premium ? "Ta bort Premium" : "Ge Premium"}
                          </Button>
                        )}
                        {isSuperAdmin && c.user_id && (
                          <Button
                            size="sm"
                            variant={moderatorIds.has(c.user_id!) ? "destructive" : "outline"}
                            onClick={() => toggleModerator(c, moderatorIds.has(c.user_id!))}
                          >
                            {moderatorIds.has(c.user_id) ? "Ta bort Moderator" : "Ge Moderator"}
                          </Button>
                        )}
                        {(c.cv_file_url || c.cv_bucket_path) && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => viewCv(c.cv_file_url, c.cv_bucket_path)}
                          >
                            Visa CV
                          </Button>
                        )}
                        {c.email && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => sendPasswordReset(c)}
                            disabled={passwordResetLoadingId === c.id}
                          >
                            {passwordResetLoadingId === c.id ? "Skickar..." : "Byt lösenord"}
                          </Button>
                        )}
                      </div>

                      <p className="text-xs text-slate-400">
                        Registrerad: {c.created_at ? new Date(c.created_at).toLocaleString("sv-SE") : "—"}
                      </p>
                    </div>
                  )}
                </div>
              ))}

              {filteredCandidates.length === 0 && !candidatesLoading && (
                <div className="bg-white rounded-lg border p-6 text-center text-slate-400">
                  Inga kandidater hittades.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══ TAB: CV Matchning ═══ */}
        {tab === "cvmatch" && (
          <div>
            <h2 className="text-lg font-semibold mb-4">CV Matchning</h2>

            {/* Mode selector */}
            <div className="flex gap-2 mb-5">
              <button
                onClick={() => { setCmMode("freetext"); setCmCandidate(null); setCmCandidateSearch("") }}
                className={`px-4 py-2 rounded-md text-sm font-medium border transition-colors ${
                  cmMode === "freetext"
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
                }`}
              >
                Klistra in CV-text
              </button>
              <button
                onClick={() => setCmMode("user")}
                className={`px-4 py-2 rounded-md text-sm font-medium border transition-colors ${
                  cmMode === "user"
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
                }`}
              >
                Välj kandidat
              </button>
            </div>

            <div className="bg-white rounded-lg border p-5 shadow-sm mb-4 space-y-4">

              {/* Mode: select candidate */}
              {cmMode === "user" && (
                <div>
                  <Label>Sök kandidat</Label>
                  <Input
                    placeholder="Sök namn, e-post, stad..."
                    value={cmCandidateSearch}
                    onChange={(e) => setCmCandidateSearch(e.target.value)}
                    className="mb-2"
                  />
                  {cmCandidateSearch.trim() && (
                    <div className="border rounded-md max-h-48 overflow-y-auto divide-y bg-white shadow-sm">
                      {candidates
                        .filter((c) => {
                          const q = cmCandidateSearch.toLowerCase()
                          return (
                            c.full_name?.toLowerCase().includes(q) ||
                            c.email?.toLowerCase().includes(q) ||
                            c.city?.toLowerCase().includes(q)
                          )
                        })
                        .slice(0, 20)
                        .map((c) => (
                          <button
                            key={c.id}
                            className="w-full text-left px-3 py-2 hover:bg-slate-50 text-sm"
                            onClick={() => {
                              setCmCandidate(c)
                              setCmCandidateSearch("")
                              // Address: street + city if available
                              const fullAddress = c.street
                                ? `${c.street}, ${c.city ?? ""}`.trim()
                                : (c.city ?? "")
                              setCmAddress(fullAddress)
                              // Radius: from profile or default 50
                              if (c.commute_radius_km) setCmRadius(String(c.commute_radius_km))
                              // Keywords: from primary_occupation_field
                              setCmKeywords(normalizeKeywordCandidates(c))
                              // Group names: from category_tags (occupation_group_label values)
                              if (c.category_tags && c.category_tags.length > 0) {
                                setCmGroupNames(c.category_tags.join(", "))
                              }
                            }}
                          >
                            <span className="font-medium">{c.full_name || "(inget namn)"}</span>
                            <span className="text-slate-500 ml-2">{c.email}</span>
                            {c.city && <span className="text-slate-400 ml-2">• {c.city}</span>}
                          </button>
                        ))}
                    </div>
                  )}

                  {cmCandidate && (
                    <div className="mt-2 p-3 bg-blue-50 rounded-md flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 text-sm">{cmCandidate.full_name}</p>
                        <p className="text-xs text-slate-500">
                          {cmCandidate.email}
                          {cmCandidate.street ? ` • ${cmCandidate.street}, ${cmCandidate.city ?? ""}` : cmCandidate.city ? ` • ${cmCandidate.city}` : ""}
                        </p>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {cmCandidate.commute_radius_km && (
                            <span className="text-xs text-slate-500">Radie: {cmCandidate.commute_radius_km} km</span>
                          )}
                          {cmCandidate.location_lat ? (
                            <span className="text-xs text-green-700">Koordinater sparade</span>
                          ) : (
                            <span className="text-xs text-amber-600">Inga koordinater – geokodas från adress</span>
                          )}
                        </div>
                        {cmCandidate.category_tags && cmCandidate.category_tags.length > 0 && (
                          <p className="text-xs text-slate-500 mt-0.5">
                            Grupper: {cmCandidate.category_tags.join(", ")}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col gap-2 shrink-0">
                        {(cmCandidate.cv_file_url || cmCandidate.cv_bucket_path) && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => viewCv(cmCandidate.cv_file_url, cmCandidate.cv_bucket_path)}
                          >
                            Visa nuvarande CV
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setCmCandidate(null)
                            setCmAddress("")
                            setCmKeywords("")
                            setCmGroupNames("")
                          }}
                        >
                          Byt
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* CV text area (always shown in freetext mode, optional in user mode) */}
              <div>
                <Label htmlFor="cm-cvtext">
                  {cmMode === "freetext" ? "CV-text (klistra in PDF-text, LinkedIn eller anteckningar)" : "CV-text (valfritt – lämna tomt för att använda kandidatens sparade CV-text)"}
                </Label>
                <textarea
                  id="cm-cvtext"
                  className="mt-1 w-full min-h-[140px] rounded-md border border-slate-300 px-3 py-2 text-sm font-mono resize-y"
                  placeholder="Klistra in CV-text här för att extrahera adress och yrkestitel automatiskt..."
                  value={cmCvText}
                  onChange={(e) => setCmCvText(e.target.value)}
                />
                {cmMode === "user" && !cmCvText.trim() && cmCandidate?.candidate_text_vector?.trim() && (
                  <p className="text-xs text-slate-500 mt-1">
                    Kandidatens sparade CV-text används automatiskt om du lämnar detta tomt.
                  </p>
                )}
                {cmCvText.trim() && !cmAddress && (
                  <p className="text-xs text-slate-500 mt-1">
                    Adress och nyckelord extraheras automatiskt med Claude om du inte fyller i dem nedan.
                  </p>
                )}
              </div>

              {/* Address + Keywords + Radius */}
              <div className="grid sm:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="cm-address">Adress / Stad</Label>
                  <Input
                    id="cm-address"
                    placeholder="t.ex. Stockholm, Göteborg..."
                    value={cmAddress}
                    onChange={(e) => setCmAddress(e.target.value)}
                  />
                  {cmExtractedAddress && (
                    <p className="text-xs text-green-700 mt-1">Extraherad: {cmExtractedAddress}</p>
                  )}
                </div>
              <div>
                <Label htmlFor="cm-keywords">Yrke / Nyckelord</Label>
                <Input
                  id="cm-keywords"
                  placeholder="t.ex. elektriker, sjuksköterska..."
                  value={cmKeywords}
                  onChange={(e) => setCmKeywords(e.target.value)}
                />
                  {cmExtractedKeywords && (
                    <p className="text-xs text-green-700 mt-1">Extraherat: {cmExtractedKeywords}</p>
                  )}
                  <p className="text-xs text-slate-500 mt-1">
                    Används i AI Manager-sorteringen tillsammans med taxonomi, radie och vektormatchning.
                  </p>
                </div>
                <div>
                  <Label htmlFor="cm-radius">Radie (km)</Label>
                  <Input
                    id="cm-radius"
                    type="number"
                    min={1}
                    max={500}
                    value={cmRadius}
                    onChange={(e) => setCmRadius(e.target.value)}
                  />
                </div>
              </div>

              {/* Category group filter */}
              <div>
                <Label htmlFor="cm-groups">
                  Yrkesgrupper (occupation_group_label)
                </Label>
                <Input
                  id="cm-groups"
                  placeholder="t.ex. Installations- och driftsarbete, El- och energiarbete (kommaseparerat)"
                  value={cmGroupNames}
                  onChange={(e) => setCmGroupNames(e.target.value)}
                />
                <p className="text-xs text-slate-500 mt-1">
                  Fylls i automatiskt från kandidatens `category_tags` och används som taxonomifilter i båda sökvägarna.
                </p>
              </div>

              {/* Two search buttons */}
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  onClick={() => handleCvMatch("semantic")}
                  disabled={cmLoading}
                >
                  {cmLoading && cmLastSearchMode === "semantic" ? "Matchar..." : "Matcha jobb"}
                </Button>
                <Button
                  variant="outline"
                  onClick={handleScanJobContacts}
                  disabled={cmContactScanLoading || cmResults.length === 0}
                >
                  {cmContactScanLoading ? "Skannar kontaktinfo..." : "Skanna kontaktinfo"}
                </Button>
                {cmLoading && (
                  <span className="text-sm text-slate-500">
                    Bygger taxonomipool + rankar som i dashboarden...
                  </span>
                )}
              </div>

              {cmLastSearchMode === "semantic" && cmResults.length > 0 && (
                <div className="flex flex-wrap items-end gap-3 rounded-md border border-slate-200 bg-slate-50 p-3">
                  <div>
                    <Label htmlFor="cm-save-threshold">Spara jobb över score</Label>
                    <Input
                      id="cm-save-threshold"
                      type="number"
                      min={0}
                      max={100}
                      value={cmSaveThreshold}
                      onChange={(e) => setCmSaveThreshold(e.target.value)}
                      className="w-28"
                    />
                  </div>
                  <Button
                    variant="outline"
                    onClick={handleSaveJobsByScore}
                    disabled={cmBulkSaving}
                  >
                    {cmBulkSaving ? "Sparar..." : "Spara alla över gränsen"}
                  </Button>
                </div>
              )}

              {cmError && <p className="text-sm text-red-600">{cmError}</p>}
            </div>

            {/* Results */}
            {cmTotal !== null && (
              <p className="text-sm text-slate-600 mb-3">
                {cmLastSearchMode === "semantic" ? "AI Manager-sortering" : "Hard keyword filter"} —{" "}
                {cmTotal} jobb
                {cmKeywords ? ` för "${cmKeywords}"` : ""}
                {" "}inom {cmRadius} km från {cmAddress}
              </p>
            )}

            <div className="space-y-2 mb-8">
              {cmResults.map((job) => {
                const alreadySaved = cmSavedJobIds.has(job.id)
                const score = job.display_score ?? job.jobbnu_score
                return (
                  <div key={job.id} className="bg-white rounded-lg border p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900">{job.headline}</p>
                        <p className="text-sm text-slate-600">
                          {job.company && <span>{job.company} • </span>}
                          {job.city && <span>{job.city} • </span>}
                          {job.distance_km != null ? (
                            <span className="text-blue-700">{job.distance_km.toFixed(1)} km</span>
                          ) : score != null ? (
                            <span className="text-blue-700">Score: {score.toFixed(1)}</span>
                          ) : null}
                        </p>
                        {job.occupation_group_label && (
                          <p className="text-xs text-slate-500 mt-0.5">{job.occupation_group_label}</p>
                        )}
                        {job.vector_similarity != null && (
                          <div className="flex gap-3 mt-1">
                            <span className="text-xs text-slate-400">
                              Vektor: {(job.vector_similarity * 100).toFixed(0)}%
                            </span>
                            {job.keyword_hit_rate != null && (
                              <span className="text-xs text-slate-400">
                                Nyckelord: {(job.keyword_hit_rate * 100).toFixed(0)}%
                              </span>
                            )}
                            {job.keyword_miss_rate != null && (
                              <span className="text-xs text-slate-400">
                                Miss: {(job.keyword_miss_rate * 100).toFixed(0)}%
                              </span>
                            )}
                          </div>
                        )}
                        {job.keyword_hits && job.keyword_hits.length > 0 && (
                          <p className="text-xs text-slate-500 mt-2">
                            Träffade ord: {job.keyword_hits.join(", ")}
                          </p>
                        )}
                        {(job.contactEmail || job.contactNote) && (
                          <div className="mt-2 space-y-1">
                            {job.contactEmail && (
                              <p className="text-xs text-emerald-700">
                                Direkt outreach: {job.contactEmail}
                                {job.contactName ? ` · ${job.contactName}` : ""}
                                {job.contactRole ? ` · ${job.contactRole}` : ""}
                              </p>
                            )}
                            {!job.contactEmail && job.contactNote && (
                              <p className="text-xs text-amber-700">
                                {job.contactNote}
                                {job.contactDomain ? ` · ${job.contactDomain}` : ""}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="shrink-0 flex flex-col items-end gap-2">
                        {score != null && (
                          <span className="text-xs font-bold text-green-700 bg-green-50 px-2 py-0.5 rounded">
                            {score.toFixed(1)}
                          </span>
                        )}
                        <Button
                          size="sm"
                          variant={alreadySaved ? "outline" : "default"}
                          disabled={alreadySaved}
                          onClick={() => handleSaveJob(job)}
                        >
                          {alreadySaved ? "Sparad" : "Spara"}
                        </Button>
                        {job.webpage_url && (
                          <a
                            href={job.webpage_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-blue-600 underline whitespace-nowrap"
                          >
                            Öppna annons
                          </a>
                        )}
                        {job.application_deadline && (
                          <span className="text-xs text-slate-400">
                            Sök senast {new Date(job.application_deadline).toLocaleDateString("sv-SE")}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}

              {cmTotal === 0 && (
                <div className="bg-white rounded-lg border p-6 text-center text-slate-400">
                  Inga jobb hittades för dessa kriterier.
                </div>
              )}
            </div>

            {/* Link to saved jobs tab */}
            {savedJobs.length > 0 && (
              <div className="border-t pt-4">
                <button
                  className="text-sm text-amber-700 underline"
                  onClick={() => {
                    if (cmMode === "user" && cmCandidate?.id) {
                      setSavedJobsCandidateFilter(cmCandidate.id)
                    }
                    setTab("savedjobs")
                    void fetchSavedJobs(cmMode === "user" ? cmCandidate?.id ?? null : null)
                  }}
                >
                  {savedJobs.length} sparade jobb → gå till Sparade Jobb
                </button>
              </div>
            )}
          </div>
        )}

        {/* ═══ TAB: Sparade Jobb ═══ */}
        {tab === "savedjobs" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">{savedJobsLabel}</h2>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void handleScanSavedJobsContacts()}
                  disabled={savedJobsContactBatchLoading || savedJobs.length === 0}
                >
                  {savedJobsContactBatchLoading ? "Skannar kontaktinfo..." : "Skanna kontaktinfo"}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => void handleDeleteAllSavedJobs()}
                  disabled={deleteAllSavedJobsLoading || savedJobs.length === 0}
                >
                  {deleteAllSavedJobsLoading ? "Tar bort..." : "Ta bort alla"}
                </Button>
                <select
                  className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm"
                  value={savedJobsCandidateFilter}
                  onChange={(e) => {
                    const nextValue = e.target.value
                    setSavedJobsCandidateFilter(nextValue)
                    void fetchSavedJobs(nextValue || null)
                    void fetchInterviewBookings(nextValue || null)
                  }}
                >
                  <option value="">Alla kandidater</option>
                  {savedJobsCandidateOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void fetchSavedJobs(savedJobsCandidateFilter || null)
                    void fetchInterviewBookings(savedJobsCandidateFilter || null)
                  }}
                >
                  Uppdatera
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void handleSendDueInterviewFollowups()}
                  disabled={dueFollowupLoading}
                >
                  {dueFollowupLoading ? "Skickar uppföljningar..." : "Skicka förfallna uppföljningar"}
                </Button>
                {dueFollowupMessage ? <p className="text-xs text-slate-500">{dueFollowupMessage}</p> : null}
              </div>
            </div>

            <div className="mb-4 flex flex-wrap gap-2">
              <Button
                variant={savedJobsCategoryFilter === "all" ? "default" : "outline"}
                size="sm"
                onClick={() => setSavedJobsCategoryFilter("all")}
              >
                Alla ({savedJobsCategoryCounts.all})
              </Button>
              <Button
                variant={savedJobsCategoryFilter === "unsent" ? "default" : "outline"}
                size="sm"
                onClick={() => setSavedJobsCategoryFilter("unsent")}
              >
                Unsent ({savedJobsCategoryCounts.unsent})
              </Button>
              <Button
                variant={savedJobsCategoryFilter === "has_comment" ? "default" : "outline"}
                size="sm"
                onClick={() => setSavedJobsCategoryFilter("has_comment")}
              >
                Has comment ({savedJobsCategoryCounts.has_comment})
              </Button>
              <Button
                variant={savedJobsCategoryFilter === "email_sent" ? "default" : "outline"}
                size="sm"
                onClick={() => setSavedJobsCategoryFilter("email_sent")}
              >
                Email sent ({savedJobsCategoryCounts.email_sent})
              </Button>
            </div>

            <div className="space-y-3">
              {filteredSavedJobs.length === 0 && (
                <div className="bg-white rounded-lg border p-6 text-center text-slate-400">
                  Inga sparade jobb ännu. Spara jobb från CV Matchning-fliken.
                </div>
              )}
              {filteredSavedJobs.map((job) => (
                <div key={job.id} className="bg-white rounded-lg border shadow-sm">
                  <div className="p-4">
                    {(() => {
                      const booking = interviewBookings.find((item) => item.admin_saved_job_id === job.id)
                      return booking ? (
                        <div className="mb-3 rounded-md border border-emerald-200 bg-emerald-50 p-3">
                          <p className="text-sm font-medium text-emerald-800">
                            Intervju bokad {booking.booking_date} kl. {booking.start_time.slice(0, 5)}-{booking.end_time.slice(0, 5)}
                          </p>
                          <p className="mt-1 text-xs text-emerald-700">
                            Bokad av {booking.contact_name} ({booking.contact_email})
                            {booking.contact_phone ? ` · ${booking.contact_phone}` : ""}
                          </p>
                          {booking.meeting_link ? (
                            <p className="mt-1 text-xs text-emerald-700">
                              Möteslänk:{" "}
                              <a
                                href={booking.meeting_link}
                                target="_blank"
                                rel="noreferrer"
                                className="underline"
                              >
                                Öppna länk
                              </a>
                            </p>
                          ) : null}
                          <p className="mt-1 text-xs text-emerald-700">
                            Status: {formatEmployerFollowupStatus(booking.admin_followup_status)}
                          </p>
                          {booking.followup_url ? (
                            <p className="mt-1 text-xs text-emerald-700">
                              Uppföljningslänk:{" "}
                              <a href={booking.followup_url} target="_blank" rel="noreferrer" className="underline">
                                Öppna formulär
                              </a>
                            </p>
                          ) : null}
                          {booking.employer_followup_email_sent_at ? (
                            <p className="mt-1 text-xs text-emerald-700">
                              Uppföljningsmail skickat: {new Date(booking.employer_followup_email_sent_at).toLocaleString("sv-SE")}
                            </p>
                          ) : null}
                          {booking.employer_followup_completed_at ? (
                            <p className="mt-1 text-xs text-emerald-700">
                              Arbetsgivaren svarade: {new Date(booking.employer_followup_completed_at).toLocaleString("sv-SE")}
                            </p>
                          ) : null}
                          {typeof booking.agreed_base_salary_sek === "number" ? (
                            <p className="mt-1 text-xs text-emerald-700">
                              Grundlön: {booking.agreed_base_salary_sek.toLocaleString("sv-SE")} kr/mån
                              {booking.employment_start_date ? ` · Start ${booking.employment_start_date}` : ""}
                              {booking.employment_type ? ` · ${booking.employment_type}` : ""}
                            </p>
                          ) : null}
                          {booking.employment_contract_signed ? (
                            <p className="mt-1 text-xs text-emerald-700">Signerat anställningsavtal bekräftat</p>
                          ) : null}
                          {booking.proof_document_url ? (
                            <p className="mt-1 text-xs text-emerald-700">
                              Underlag:{" "}
                              <a href={booking.proof_document_url} target="_blank" rel="noreferrer" className="underline">
                                {booking.proof_document_name || "Öppna fil"}
                              </a>
                            </p>
                          ) : null}
                          {booking.employer_followup_notes ? (
                            <p className="mt-1 text-xs text-emerald-700">Kommentar: {booking.employer_followup_notes}</p>
                          ) : null}
                          <div className="mt-2 flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleUpdateInterviewFollowup(booking.id, "active_billing")}
                              disabled={bookingStatusLoadingId === booking.id}
                            >
                              Aktivera debitering
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleUpdateInterviewFollowup(booking.id, "employment_ended")}
                              disabled={bookingStatusLoadingId === booking.id}
                            >
                              Anställning avslutad
                            </Button>
                          </div>
                        </div>
                      ) : null
                    })()}
                    {job.interview_slot_count === 0 ? (
                      <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 p-3">
                        <p className="text-sm font-medium text-amber-800">
                          Kandidaten har inte lagt in några intervjutider ännu.
                        </p>
                        <p className="mt-1 text-xs text-amber-700">
                          Arbetsgivaren kommer inte kunna boka intervju förrän kandidaten har valt tider i sin profil.
                        </p>
                      </div>
                    ) : null}
                    {(() => {
                      const contact = savedJobContactScans[job.id]
                      return contact ? (
                        <div className="mb-3 rounded-md border border-slate-200 bg-slate-50 p-3">
                          {contact.contactEmail ? (
                            <p className="text-xs text-emerald-700">
                              Direkt outreach: {contact.contactEmail}
                              {contact.contactName ? ` · ${contact.contactName}` : ""}
                              {contact.contactRole ? ` · ${contact.contactRole}` : ""}
                            </p>
                          ) : (
                            <p className="text-xs text-amber-700">
                              {contact.contactNote || "Ingen tydlig kontakt hittad."}
                              {contact.contactDomain ? ` · ${contact.contactDomain}` : ""}
                            </p>
                          )}
                        </div>
                      ) : null
                    })()}
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900">{job.headline}</p>
                        <p className="text-sm text-slate-600">
                          {job.company && <span>{job.company} • </span>}
                          {job.city && <span>{job.city} • </span>}
                          {job.distance_km != null && (
                            <span className="text-blue-700">{Number(job.distance_km).toFixed(1)} km</span>
                          )}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Kandidat: <span className="font-medium text-slate-700">{job.candidate_label}</span>
                          {" · "}
                          {new Date(job.created_at).toLocaleDateString("sv-SE")}
                        </p>
                        {(job.search_mode || job.search_keyword || job.search_address) && (
                          <p className="text-xs text-slate-500 mt-0.5">
                            Källa: {job.search_mode === "keyword" ? "Keyword Match" : "AI Manager"}
                            {job.search_keyword ? ` · ${job.search_keyword}` : ""}
                            {job.search_address ? ` · ${job.search_address}` : ""}
                            {job.search_radius_km != null ? ` · ${job.search_radius_km} km` : ""}
                          </p>
                        )}
                        {job.occupation_group_label && (
                          <p className="text-xs text-slate-400">{job.occupation_group_label}</p>
                        )}
                        {job.email_sent && (
                          <p className="text-xs text-green-700 mt-0.5">
                            E-post skickad {job.email_sent_at ? new Date(job.email_sent_at).toLocaleDateString("sv-SE") : ""}
                          </p>
                        )}
                        {job.outreach_summary && (
                          <p className="mt-1 text-xs text-slate-600">
                            Funnel: skickade {job.outreach_summary.messagesSent} · levererade {job.outreach_summary.deliveredMessages} · öppnade {job.outreach_summary.openedMessages} · klick {job.outreach_summary.clickedMessages} · sidvisningar {job.outreach_summary.pageViews} · godkännanden {job.outreach_summary.acceptances} · bokningar {job.outreach_summary.bookings}
                          </p>
                        )}
                        {job.outreach_summary?.lastRecipient && (
                          <p className="text-xs text-slate-500 mt-0.5">
                            Senaste mottagare: {job.outreach_summary.lastRecipient}
                          </p>
                        )}
                        {job.notes && (
                          <p className="text-xs text-slate-600 mt-1 italic">{job.notes}</p>
                        )}
                        {job.interview_analysis && (
                          <p className="mt-1 text-xs text-slate-700">
                            <span className="font-medium">JobbNu intervjuanalys:</span> {job.interview_analysis}
                          </p>
                        )}
                      </div>
                      <div className="shrink-0 flex flex-col items-end gap-1">
                        {job.webpage_url && (
                          <a
                            href={job.webpage_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-blue-600 underline whitespace-nowrap"
                          >
                            Öppna annons
                          </a>
                        )}
                      </div>
                    </div>

                    {/* Notes */}
                    <div className="flex gap-2 mb-3">
                      <Input
                        placeholder="Anteckningar om uppföljning..."
                        value={savedJobNotes[job.id] ?? ""}
                        onChange={(e) =>
                          setSavedJobNotes((prev) => ({ ...prev, [job.id]: e.target.value }))
                        }
                        className="text-sm"
                      />
                      <Button size="sm" variant="outline" onClick={() => handleSaveJobNotes(job.id)}>
                        Spara
                      </Button>
                    </div>

                    <div className="mb-3 space-y-2">
                      <Label htmlFor={`application-reference-${job.id}`}>Ansökningsreferens</Label>
                      <div className="flex gap-2">
                        <Input
                          id={`application-reference-${job.id}`}
                          placeholder="t.ex. teamtailor-7178648-1890940"
                          value={savedJobApplicationReferences[job.id] ?? ""}
                          onChange={(e) =>
                            setSavedJobApplicationReferences((prev) => ({ ...prev, [job.id]: e.target.value }))
                          }
                          className="text-sm"
                        />
                        <Button size="sm" variant="outline" onClick={() => handleSaveApplicationReference(job.id)}>
                          Spara
                        </Button>
                      </div>
                      <p className="text-xs text-slate-500">
                        Använd om annonsen kräver en särskild referens eller ett ärendenummer i ansökan.
                      </p>
                    </div>

                    <div className="mb-3 space-y-2">
                      <Label htmlFor={`manual-contact-email-${job.id}`}>Manuellt kontaktmail</Label>
                      <div className="flex gap-2">
                        <Input
                          id={`manual-contact-email-${job.id}`}
                          type="email"
                          placeholder="t.ex. kontakt@foretag.se"
                          value={savedJobManualEmails[job.id] ?? ""}
                          onChange={(e) =>
                            setSavedJobManualEmails((prev) => ({ ...prev, [job.id]: e.target.value }))
                          }
                          className="text-sm"
                        />
                        <Button size="sm" variant="outline" onClick={() => handleSaveManualContactEmail(job.id)}>
                          Spara
                        </Button>
                      </div>
                      <p className="text-xs text-slate-500">
                        Använd detta om du hittar rätt kontaktmail manuellt, till exempel via extern annons eller Arbetsförmedlingen.
                      </p>
                    </div>

                    <div className="mb-3 space-y-2">
                      <Label htmlFor={`interview-analysis-${job.id}`}>JobbNu intervjuanalys</Label>
                      <textarea
                        id={`interview-analysis-${job.id}`}
                        className="min-h-[110px] w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                        placeholder="Vad kom fram i samtalet med kandidaten som stärker matchningen för just det här jobbet?"
                        value={savedJobInterviewAnalysis[job.id] ?? ""}
                        onChange={(e) =>
                          setSavedJobInterviewAnalysis((prev) => ({ ...prev, [job.id]: e.target.value }))
                        }
                      />
                      <div className="flex justify-end">
                        <Button size="sm" variant="outline" onClick={() => handleSaveInterviewAnalysis(job.id)}>
                          Spara intervjuanalys
                        </Button>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleCreateEmployerIntroLink(job)}
                        disabled={introLinkLoading === job.id}
                      >
                        {introLinkLoading === job.id ? "Skapar länk..." : "Skapa bokningslänk"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void handleScanSavedJobsContacts([job.id])}
                        disabled={savedJobContactScanLoading === job.id}
                      >
                        {savedJobContactScanLoading === job.id ? "Skannar..." : "Skanna kontaktinfo"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleGenerateEmail(job)}
                        disabled={emailGenLoading === job.id}
                      >
                        {emailGenLoading === job.id ? "Genererar..." : "Generera e-post"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void handlePreviewOutreachEmail(job)}
                        disabled={emailPreviewLoading === job.id || !generatedEmails[job.id]}
                      >
                        {emailPreviewLoading === job.id ? "Bygger preview..." : "Förhandsgranska"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void handleSendOutreachEmail(job)}
                        disabled={
                          emailSendLoading === job.id ||
                          !generatedEmails[job.id] ||
                          !(savedJobManualEmails[job.id] || job.manual_contact_email || savedJobContactScans[job.id]?.contactEmail)
                        }
                      >
                        {emailSendLoading === job.id ? "Skickar..." : "Skicka via Postmark"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleOpenInGmail(job)}
                        disabled={
                          !generatedEmails[job.id] ||
                          !(savedJobManualEmails[job.id] || job.manual_contact_email || savedJobContactScans[job.id]?.contactEmail)
                        }
                      >
                        Öppna i Gmail
                      </Button>
                      {!job.email_sent && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleMarkEmailSent(job.id)}
                        >
                          Markera e-post skickad
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleDeleteSavedJob(job.id)}
                      >
                        Ta bort
                      </Button>
                    </div>

                    {employerIntroLinks[job.id] && (
                      <div className="mt-3 rounded-md border border-sky-200 bg-sky-50 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-xs font-medium text-sky-900">Employer-länk</p>
                          <button
                            className="text-xs text-sky-700 underline"
                            onClick={() => navigator.clipboard.writeText(employerIntroLinks[job.id])}
                          >
                            Kopiera länk
                          </button>
                        </div>
                        <p className="mt-1 break-all text-xs text-sky-800">{employerIntroLinks[job.id]}</p>
                      </div>
                    )}

                    {/* Generated email */}
                    {generatedEmails[job.id] && (
                      <div className="mt-3 bg-slate-50 rounded-md border p-3">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs font-semibold text-slate-700">Genererat e-postmeddelande</p>
                          <button
                            className="text-xs text-blue-600 underline"
                            onClick={() => navigator.clipboard.writeText(generatedEmails[job.id])}
                          >
                            Kopiera
                          </button>
                        </div>
                        {job.latest_outreach_message?.sent_at && (
                          <p className="mb-2 text-xs text-emerald-700">
                            Senast skickat {new Date(job.latest_outreach_message.sent_at).toLocaleString("sv-SE")}
                          </p>
                        )}
                        <pre className="text-xs text-slate-800 whitespace-pre-wrap font-mono leading-relaxed">
                          {generatedEmails[job.id]}
                        </pre>
                      </div>
                    )}

                    {emailPreviews[job.id] && (
                      <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 p-3">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <p className="text-xs font-semibold text-emerald-900">Slutlig förhandsgranskning före skick</p>
                          {emailPreviews[job.id].bookingLink ? (
                            <a
                              href={emailPreviews[job.id].bookingLink || "#"}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs text-emerald-700 underline"
                            >
                              Öppna bokningslänk
                            </a>
                          ) : null}
                        </div>
                        <p className="text-xs text-slate-700">
                          <span className="font-medium">Ämne:</span> {emailPreviews[job.id].subject}
                        </p>
                        {emailPreviews[job.id].bookingLink ? (
                          <p className="mt-1 break-all text-xs text-slate-600">
                            <span className="font-medium">CTA-länk:</span> {emailPreviews[job.id].bookingLink}
                          </p>
                        ) : null}
                        <div className="mt-3 overflow-hidden rounded-md border bg-white">
                          <iframe
                            title={`preview-${job.id}`}
                            srcDoc={emailPreviews[job.id].htmlBody}
                            className="h-[520px] w-full"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══ TAB: Job Search ═══ */}
        {tab === "jobsearch" && (
          <div>
            <h2 className="text-lg font-semibold mb-4">Jobsökning i databas</h2>

            <div className="bg-white rounded-lg border p-5 shadow-sm mb-6">
              <div className="grid sm:grid-cols-3 gap-4 mb-4">
                <div>
                  <Label>Adress / Stad</Label>
                  <Input
                    placeholder="t.ex. Stockholm, Göteborg, Malmö västra..."
                    value={jsAddress}
                    onChange={(e) => setJsAddress(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleJobSearch()}
                  />
                </div>
                <div>
                  <Label>Radie (km)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={500}
                    value={jsRadius}
                    onChange={(e) => setJsRadius(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Nyckelord / Yrke</Label>
                  <Input
                    placeholder="t.ex. elektriker, sjuksköterska, IT..."
                    value={jsKeyword}
                    onChange={(e) => setJsKeyword(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleJobSearch()}
                  />
                </div>
              </div>

              <Button onClick={handleJobSearch} disabled={jsLoading}>
                {jsLoading ? "Söker..." : "Sök jobb"}
              </Button>

              {jsError && <p className="mt-3 text-sm text-red-600">{jsError}</p>}
            </div>

            {jsTotal !== null && (
              <p className="text-sm text-slate-600 mb-3">
                Visar {jsResults.length} av {jsTotal} träffar
                {jsKeyword ? ` för "${jsKeyword}"` : ""} inom {jsRadius} km från {jsAddress}
              </p>
            )}

            <div className="space-y-2">
              {jsResults.map((job) => (
                <div key={job.id} className="bg-white rounded-lg border p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900">{job.headline}</p>
                      <p className="text-sm text-slate-600">
                        {job.company && <span>{job.company} • </span>}
                        {job.city && <span>{job.city} • </span>}
                        {job.distance_km != null && (
                          <span className="text-blue-700">{job.distance_km.toFixed(1)} km</span>
                        )}
                      </p>
                      {job.occupation_group_label && (
                        <p className="text-xs text-slate-500 mt-0.5">{job.occupation_group_label}</p>
                      )}
                    </div>
                    <div className="shrink-0 flex flex-col items-end gap-1">
                      {job.webpage_url && (
                        <a
                          href={job.webpage_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-blue-600 underline whitespace-nowrap"
                        >
                          Öppna annons
                        </a>
                      )}
                      {job.application_deadline && (
                        <span className="text-xs text-slate-400">
                          Sök senast {new Date(job.application_deadline).toLocaleDateString("sv-SE")}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {jsTotal === 0 && (
                <div className="bg-white rounded-lg border p-6 text-center text-slate-400">
                  Inga jobb hittades för dessa sökkriterier.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══ TAB: Document Orders ═══ */}
        {tab === "orders" && (
          <div>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Dokumentbeställningar</h2>
              <Button variant="outline" size="sm" onClick={fetchDocumentOrders} disabled={ordersLoading}>
                {ordersLoading ? "Laddar..." : "Uppdatera"}
              </Button>
            </div>

            <div className="space-y-4">
              {documentOrders.map((order) => (
                <div key={order.id} className="rounded-lg border bg-white p-4 shadow-sm">
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-1">
                      <p className="font-semibold text-slate-900">{order.package_name}</p>
                      <p className="text-sm text-slate-600">
                        {order.package_flow} • {order.amount_sek} SEK • {order.status}
                      </p>
                      <p className="text-xs text-slate-500">Order ID: {order.id}</p>
                      {order.stripe_checkout_session_id && (
                        <p className="text-xs text-slate-500">Stripe Session: {order.stripe_checkout_session_id}</p>
                      )}
                      {order.intake_full_name && (
                        <p className="text-sm text-slate-700">Kund: {order.intake_full_name}</p>
                      )}
                      {order.intake_email && (
                        <p className="text-sm text-slate-700">Intake e-post: {order.intake_email}</p>
                      )}
                      <p className="text-xs text-slate-500">
                        {order.stripe_customer_email || "Ingen e-post"} •{" "}
                        {order.created_at ? new Date(order.created_at).toLocaleString() : ""}
                      </p>
                      {order.target_role && <p className="text-sm text-slate-700">Målroll: {order.target_role}</p>}
                      {!order.target_role && order.letter_job_title && (
                        <p className="text-sm text-slate-700">Målroll: {order.letter_job_title}</p>
                      )}
                      {order.target_job_link && (
                        <a
                          className="text-sm text-blue-700 underline break-all"
                          href={order.target_job_link}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {order.target_job_link}
                        </a>
                      )}
                    </div>

                    <div className="w-full md:w-[340px] space-y-2">
                      <Label htmlFor={`status-${order.id}`}>Status</Label>
                      <select
                        id={`status-${order.id}`}
                        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                        value={order.status}
                        onChange={(e) => updateDocumentOrder(order.id, { status: e.target.value })}
                      >
                        {["draft", "checkout_created", "paid", "in_progress", "delivered", "failed", "cancelled"].map(
                          (status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          )
                        )}
                      </select>

                      <Label htmlFor={`notes-${order.id}`}>Leveransanteckning</Label>
                      <textarea
                        id={`notes-${order.id}`}
                        className="min-h-[84px] w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                        value={orderNotesDraft[order.id] ?? ""}
                        onChange={(e) =>
                          setOrderNotesDraft((prev) => ({ ...prev, [order.id]: e.target.value }))
                        }
                        placeholder="T.ex. skickat CV v1 via e-post, väntar feedback"
                      />

                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            updateDocumentOrder(order.id, { deliveryNotes: orderNotesDraft[order.id] ?? "" })
                          }
                        >
                          Spara anteckning
                        </Button>
                        <Button
                          size="sm"
                          onClick={() =>
                            updateDocumentOrder(order.id, {
                              status: "delivered",
                              deliveryNotes: orderNotesDraft[order.id] ?? "",
                            })
                          }
                        >
                          Markera levererad
                        </Button>
                      </div>

                      {order.paid_at && (
                        <p className="text-xs text-slate-500">Betald: {new Date(order.paid_at).toLocaleString()}</p>
                      )}
                      {order.delivered_at && (
                        <p className="text-xs text-green-700">
                          Levererad: {new Date(order.delivered_at).toLocaleString()}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {!ordersLoading && documentOrders.length === 0 && (
                <div className="rounded-lg border bg-white p-4 text-sm text-slate-500">
                  Inga dokumentbeställningar ännu.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══ TAB: CV Generator ═══ */}
        {tab === "cvgen" && (
          <div className="max-w-4xl">
            <h2 className="text-lg font-semibold mb-4">CV-generator (fritext)</h2>

            <div className="bg-white rounded-lg border p-5 shadow-sm mb-6 space-y-4">
              <div>
                <Label htmlFor="cvgen-input">Klistra in text (CV-underlag, LinkedIn-profil, anteckningar…)</Label>
                <textarea
                  id="cvgen-input"
                  className="mt-1 w-full min-h-[220px] rounded-md border border-slate-300 px-3 py-2 text-sm font-mono resize-y"
                  placeholder="Klistra in fritext här – namn, kontaktuppgifter, erfarenheter, utbildning, kompetenser etc."
                  value={cvGenText}
                  onChange={(e) => setCvGenText(e.target.value)}
                />
              </div>

              <div className="flex items-center gap-3">
                <Button onClick={handleCvGen} disabled={cvGenLoading}>
                  {cvGenLoading ? "Genererar…" : "Generera CV"}
                </Button>
                {cvGenLoading && (
                  <span className="text-sm text-slate-500">Claude Haiku arbetar – brukar ta 10–20 sek…</span>
                )}
              </div>

              {cvGenError && <p className="text-sm text-red-600">{cvGenError}</p>}
            </div>

            {cvGenResult && (
              <div className="bg-white rounded-lg border shadow-sm">
                <div className="flex items-center justify-between px-5 py-3 border-b">
                  <span className="font-medium text-slate-800">Genererat CV</span>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={downloadTxt}>
                      Ladda ner .txt
                    </Button>
                    <Button size="sm" onClick={downloadPdf}>
                      Ladda ner PDF
                    </Button>
                  </div>
                </div>
                <pre className="whitespace-pre-wrap px-5 py-4 text-sm text-slate-800 font-mono leading-relaxed">
                  {cvGenResult}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* ═══ TAB: Calendar ═══ */}
        {tab === "calendar" && (
          <div className="max-w-lg">
            <h2 className="text-lg font-semibold mb-4">Hantera Tillgänglighet</h2>

            <div className="bg-white p-6 rounded-lg shadow-sm border mb-6">
              <div className="grid gap-4">
                <div>
                  <Label>Datum att blockera</Label>
                  <Input
                    type="date"
                    value={blockDate}
                    onChange={(e) => setBlockDate(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Tid (Lämna tomt för hela dagen)</Label>
                  <Input
                    type="time"
                    value={blockTime}
                    onChange={(e) => setBlockTime(e.target.value)}
                  />
                </div>
                <Button onClick={handleBlockTime}>Blockera Tid</Button>
              </div>
            </div>

            <h3 className="font-medium mb-2">Blockerade tider:</h3>
            <div className="bg-white rounded-lg border overflow-hidden">
              {blocks.map((b) => (
                <div key={b.id} className="flex justify-between items-center p-3 border-b last:border-0">
                  <span>
                    {b.block_date} {b.start_time ? `kl ${b.start_time}` : "(Hela dagen)"}
                  </span>
                  <Button variant="destructive" size="sm" onClick={() => handleDeleteBlock(b.id)}>
                    Ta bort
                  </Button>
                </div>
              ))}
              {blocks.length === 0 && <p className="p-4 text-gray-500 text-sm">Inga blockeringar.</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
