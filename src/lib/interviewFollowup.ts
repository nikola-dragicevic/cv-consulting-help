export const EMPLOYER_FOLLOWUP_STATUSES = [
  "booked",
  "contacted_candidate",
  "prepared",
  "interview_completed",
  "not_moving_forward",
  "next_interview",
  "offer_planned",
  "offer_sent",
  "hired_pending_proof",
  "salary_confirmed",
  "active_billing",
  "employment_ended",
] as const

export type EmployerFollowupStatus = (typeof EMPLOYER_FOLLOWUP_STATUSES)[number]

export function isEmployerFollowupStatus(value: string): value is EmployerFollowupStatus {
  return (EMPLOYER_FOLLOWUP_STATUSES as readonly string[]).includes(value)
}

export function formatEmployerFollowupStatus(status: string | null | undefined) {
  switch (status) {
    case "booked":
      return "Intervju bokad"
    case "contacted_candidate":
      return "Kandidat kontaktad"
    case "prepared":
      return "Kandidat förberedd"
    case "interview_completed":
      return "Intervju genomförd"
    case "not_moving_forward":
      return "Går inte vidare"
    case "next_interview":
      return "Nästa intervju planerad"
    case "offer_planned":
      return "Erbjudande planeras"
    case "offer_sent":
      return "Erbjudande skickat"
    case "hired_pending_proof":
      return "Anställd, inväntar underlag"
    case "salary_confirmed":
      return "Lön bekräftad"
    case "active_billing":
      return "Aktiv debitering"
    case "employment_ended":
      return "Anställning avslutad"
    default:
      return "Intervju bokad"
  }
}

export function statusNeedsHiringDetails(status: string | null | undefined) {
  return status === "hired_pending_proof" || status === "salary_confirmed" || status === "active_billing"
}

export function buildEmployerFollowupUrl(token: string) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://jobbnu.se"
  return `${baseUrl}/employer-followup/${token}`
}
