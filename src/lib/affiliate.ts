import { cookies } from "next/headers"
import { createClient } from "@supabase/supabase-js"

export const AFFILIATE_COOKIE_NAME = "jobbnu_affiliate_ref"
export const AFFILIATE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30

function getSupabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!)
}

export type AffiliateCreator = {
  id: string
  code: string
  full_name: string
  email: string | null
  social_handle: string | null
  status: string
  commission_percent: number
}

export function normalizeAffiliateCode(raw: string | null | undefined) {
  return (raw || "").trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "")
}

export function generateAffiliateCode(name: string) {
  const base = normalizeAffiliateCode(name)
    .replace(/[_-]{2,}/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "")
    .slice(0, 24)
  return base || `creator-${Math.random().toString(36).slice(2, 8)}`
}

export async function getAffiliateCodeFromCookie() {
  const store = await cookies()
  return normalizeAffiliateCode(store.get(AFFILIATE_COOKIE_NAME)?.value)
}

export async function getActiveAffiliateCreatorByCode(code: string) {
  const normalized = normalizeAffiliateCode(code)
  if (!normalized) return null

  const admin = getSupabaseAdmin()
  const { data, error } = await admin
    .from("affiliate_creators")
    .select("id,code,full_name,email,social_handle,status,commission_percent")
    .eq("code", normalized)
    .eq("status", "active")
    .maybeSingle()

  if (error) throw new Error(error.message)
  return (data as AffiliateCreator | null) ?? null
}

export async function upsertAffiliateReferralForUser(params: {
  creatorId: string
  affiliateCode: string
  userId: string
  email?: string | null
  checkoutStartedAtField?: "dashboard_checkout_started_at" | "auto_apply_checkout_started_at"
}) {
  const admin = getSupabaseAdmin()
  const now = new Date().toISOString()
  const patch: Record<string, unknown> = {
    creator_id: params.creatorId,
    user_id: params.userId,
    referred_email: params.email ?? null,
    affiliate_code: normalizeAffiliateCode(params.affiliateCode),
    attribution_source: "cookie_ref",
    signup_at: now,
    last_seen_at: now,
    updated_at: now,
  }

  if (params.checkoutStartedAtField) {
    patch[params.checkoutStartedAtField] = now
  }

  const { error } = await admin
    .from("affiliate_referrals")
    .upsert(patch, { onConflict: "user_id" })

  if (error) throw new Error(error.message)
}

export async function resolveAffiliateForCurrentUser(params: {
  userId: string
  email?: string | null
  checkoutStartedAtField?: "dashboard_checkout_started_at" | "auto_apply_checkout_started_at"
}) {
  const code = await getAffiliateCodeFromCookie()
  if (!code) return null
  const creator = await getActiveAffiliateCreatorByCode(code)
  if (!creator) return null

  await upsertAffiliateReferralForUser({
    creatorId: creator.id,
    affiliateCode: creator.code,
    userId: params.userId,
    email: params.email,
    checkoutStartedAtField: params.checkoutStartedAtField,
  })

  return creator
}

export function calculateAffiliatePayoutAmount(params: {
  amountSek: number
  commissionPercent: number
}) {
  return Math.round(params.amountSek * (params.commissionPercent / 100))
}
