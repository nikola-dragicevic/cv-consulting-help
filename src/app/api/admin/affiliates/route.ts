import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getServerSupabase } from "@/lib/supabaseServer"
import { isAdminOrModerator } from "@/lib/admin"
import { generateAffiliateCode, normalizeAffiliateCode } from "@/lib/affiliate"

function getSupabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!)
}

export async function GET() {
  const supabase = await getServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()

  if (!isAdminOrModerator(user)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const admin = getSupabaseAdmin()
  const [{ data: creators, error: creatorsError }, { data: referrals, error: referralsError }] = await Promise.all([
    admin
      .from("affiliate_creators")
      .select("id,code,full_name,email,social_handle,status,commission_percent,notes,created_at")
      .order("created_at", { ascending: false }),
    admin
      .from("affiliate_referrals")
      .select("id,creator_id,user_id,referred_email,affiliate_code,first_seen_at,signup_at,dashboard_checkout_started_at,auto_apply_checkout_started_at,first_paid_at,first_paid_order_type,first_paid_amount_sek,payout_amount_sek,payout_status,payout_paid_at,payout_notes,stripe_checkout_session_id,created_at")
      .order("created_at", { ascending: false })
      .limit(500),
  ])

  if (creatorsError) return NextResponse.json({ error: creatorsError.message }, { status: 500 })
  if (referralsError) return NextResponse.json({ error: referralsError.message }, { status: 500 })

  return NextResponse.json({
    creators: creators || [],
    referrals: referrals || [],
  })
}

export async function POST(req: Request) {
  const supabase = await getServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()

  if (!isAdminOrModerator(user)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const fullName = typeof body?.full_name === "string" ? body.full_name.trim() : ""
  const email = typeof body?.email === "string" ? body.email.trim() : ""
  const socialHandle = typeof body?.social_handle === "string" ? body.social_handle.trim() : ""
  const notes = typeof body?.notes === "string" ? body.notes.trim() : ""
  const status = body?.status === "paused" ? "paused" : "active"
  const commissionPercent = Number.isFinite(Number(body?.commission_percent)) ? Number(body.commission_percent) : 30
  const desiredCode = normalizeAffiliateCode(typeof body?.code === "string" ? body.code : "")
  const code = desiredCode || generateAffiliateCode(fullName || email || "creator")

  if (!fullName) {
    return NextResponse.json({ error: "full_name is required" }, { status: 400 })
  }

  const admin = getSupabaseAdmin()
  const { data, error } = await admin
    .from("affiliate_creators")
    .insert({
      code,
      full_name: fullName,
      email: email || null,
      social_handle: socialHandle || null,
      status,
      commission_percent: commissionPercent,
      notes: notes || null,
    })
    .select("id,code,full_name,email,social_handle,status,commission_percent,notes,created_at")
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data }, { status: 201 })
}

export async function PATCH(req: Request) {
  const supabase = await getServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()

  if (!isAdminOrModerator(user)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const referralId = typeof body?.referral_id === "string" ? body.referral_id.trim() : ""
  const payoutStatus = body?.payout_status === "paid" ? "paid" : body?.payout_status === "pending" ? "pending" : ""
  const payoutNotes = typeof body?.payout_notes === "string" ? body.payout_notes.trim() : null

  if (!referralId || !payoutStatus) {
    return NextResponse.json({ error: "referral_id and valid payout_status are required" }, { status: 400 })
  }

  const admin = getSupabaseAdmin()
  const patch: Record<string, unknown> = {
    payout_status: payoutStatus,
    payout_notes: payoutNotes,
    updated_at: new Date().toISOString(),
  }

  if (payoutStatus === "paid") {
    patch.payout_paid_at = new Date().toISOString()
  } else {
    patch.payout_paid_at = null
  }

  const { data, error } = await admin
    .from("affiliate_referrals")
    .update(patch)
    .eq("id", referralId)
    .select("id,creator_id,user_id,referred_email,affiliate_code,first_seen_at,signup_at,dashboard_checkout_started_at,auto_apply_checkout_started_at,first_paid_at,first_paid_order_type,first_paid_amount_sek,payout_amount_sek,payout_status,payout_paid_at,payout_notes,stripe_checkout_session_id,created_at")
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}
