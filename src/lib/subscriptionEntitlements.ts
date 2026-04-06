import Stripe from "stripe"
import { createClient } from "@supabase/supabase-js"
import { getStripeClient } from "@/lib/stripeServer"

export const FREE_APPLICATION_LIMIT = 2
export const PREMIUM_APPLICATION_LIMIT = 4
export const FREE_INTERVIEW_PREP_LIMIT = 2
export const PREMIUM_INTERVIEW_PREP_LIMIT = 4
export const AUTO_APPLY_UPGRADE_DELTA_SEK = 200

const ACTIVE_STATUSES = new Set<Stripe.Subscription.Status>(["active", "trialing", "past_due"])

function getSupabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!)
}

export type UserEntitlements = {
  hasActiveSubscription: boolean
  hasRepresentationSubscription: boolean
  isAdmin: boolean
  applicationLimit: number | null
  interviewPreparationLimit: number | null
  dashboardPlanLabel: "free" | "premium" | "premium_auto_apply" | "auto_apply"
}

export async function getUserEntitlements(params: {
  userId: string
  email?: string | null
  isAdmin?: boolean
}): Promise<UserEntitlements> {
  const adminOverride = params.isAdmin === true

  const supabaseAdmin = getSupabaseAdmin()
  const { data: profile } = await supabaseAdmin
    .from("candidate_profiles")
    .select("manual_premium,representation_active")
    .eq("user_id", params.userId)
    .maybeSingle()

  const hasRepresentationSubscription = profile?.representation_active === true || adminOverride
  let hasActiveSubscription = profile?.manual_premium === true || adminOverride

  if (!hasActiveSubscription && params.email) {
    const stripe = getStripeClient()
    const customers = await stripe.customers.list({
      email: params.email,
      limit: 10,
    })

    for (const customer of customers.data) {
      const subscriptions = await stripe.subscriptions.list({
        customer: customer.id,
        status: "all",
        limit: 20,
      })

      const activeSub = subscriptions.data.find((sub) => ACTIVE_STATUSES.has(sub.status))
      if (activeSub) {
        hasActiveSubscription = true
        break
      }
    }
  }

  if (hasRepresentationSubscription && hasActiveSubscription) {
    return {
      hasActiveSubscription: true,
      hasRepresentationSubscription: true,
      isAdmin: adminOverride,
      applicationLimit: null,
      interviewPreparationLimit: null,
      dashboardPlanLabel: "premium_auto_apply",
    }
  }

  if (hasRepresentationSubscription) {
    return {
      hasActiveSubscription: true,
      hasRepresentationSubscription: true,
      isAdmin: adminOverride,
      applicationLimit: null,
      interviewPreparationLimit: null,
      dashboardPlanLabel: "auto_apply",
    }
  }

  if (hasActiveSubscription) {
    return {
      hasActiveSubscription: true,
      hasRepresentationSubscription: false,
      isAdmin: adminOverride,
      applicationLimit: PREMIUM_APPLICATION_LIMIT,
      interviewPreparationLimit: PREMIUM_INTERVIEW_PREP_LIMIT,
      dashboardPlanLabel: "premium",
    }
  }

  return {
    hasActiveSubscription: false,
    hasRepresentationSubscription: false,
    isAdmin: adminOverride,
    applicationLimit: FREE_APPLICATION_LIMIT,
    interviewPreparationLimit: FREE_INTERVIEW_PREP_LIMIT,
    dashboardPlanLabel: "free",
  }
}

export function getRemainingQuota(limit: number | null, used: number) {
  if (limit === null) return null
  return Math.max(0, limit - used)
}

export function canUseQuota(limit: number | null, used: number, alreadyRecorded = false) {
  if (limit === null) return true
  if (alreadyRecorded) return true
  return used < limit
}

export function getPlanLabel(entitlements: UserEntitlements) {
  if (entitlements.dashboardPlanLabel === "premium_auto_apply") return "Premium + Auto Apply"
  if (entitlements.dashboardPlanLabel === "premium") return "Premium"
  if (entitlements.dashboardPlanLabel === "auto_apply") return "Auto Apply"
  return "Free"
}
