import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabaseAdmin"
import { getClientIp } from "@/lib/outreach"

export async function POST(
  req: Request,
  ctx: { params: Promise<{ token: string }> }
) {
  const { token } = await ctx.params
  const body = await req.json().catch(() => ({}))
  const companyName = typeof body?.companyName === "string" ? body.companyName.trim() : ""
  const contactName = typeof body?.contactName === "string" ? body.contactName.trim() : ""
  const contactEmail = typeof body?.contactEmail === "string" ? body.contactEmail.trim() : ""
  const contactPhone = typeof body?.contactPhone === "string" ? body.contactPhone.trim() : ""
  const compensationModel = typeof body?.compensationModel === "string" ? body.compensationModel.trim() : ""
  const oneTimeFeeSek =
    typeof body?.oneTimeFeeSek === "number"
      ? body.oneTimeFeeSek
      : typeof body?.oneTimeFeeSek === "string"
        ? Number.parseInt(body.oneTimeFeeSek.replace(/[^\d]/g, ""), 10)
        : null
  const acceptedTerms = body?.acceptedTerms === true

  if (!companyName || !contactName || !contactEmail || !acceptedTerms) {
    return NextResponse.json({ error: "Missing required acceptance fields" }, { status: 400 })
  }
  if (!["monthly_percentage", "one_time_offer"].includes(compensationModel)) {
    return NextResponse.json({ error: "Compensation model is required" }, { status: 400 })
  }
  if (compensationModel === "one_time_offer" && (!oneTimeFeeSek || oneTimeFeeSek <= 0)) {
    return NextResponse.json({ error: "One-time fee is required" }, { status: 400 })
  }

  const admin = getSupabaseAdmin()
  const { data: link, error: linkError } = await admin
    .from("employer_intro_links")
    .select("id,admin_saved_job_id,candidate_profile_id,terms_version,status")
    .eq("token", token)
    .eq("status", "active")
    .single()

  if (linkError || !link) {
    return NextResponse.json({ error: linkError?.message || "Link not found" }, { status: 404 })
  }

  const { data, error } = await admin
    .from("employer_intro_acceptances")
    .insert({
      employer_intro_link_id: link.id,
      company_name: companyName,
      contact_name: contactName,
      contact_email: contactEmail,
      contact_phone: contactPhone || null,
      accepted_terms: true,
      accepted_at: new Date().toISOString(),
      terms_version: link.terms_version,
      compensation_model: compensationModel,
      monthly_percentage: compensationModel === "monthly_percentage" ? 2 : null,
      one_time_fee_sek: compensationModel === "one_time_offer" ? oneTimeFeeSek : null,
      ip_address: req.headers.get("x-forwarded-for") || null,
      user_agent: req.headers.get("user-agent") || null,
    })
    .select("id,company_name,contact_name,contact_email,contact_phone,accepted_at,compensation_model,monthly_percentage,one_time_fee_sek")
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await admin.from("employer_intro_page_events").insert({
    employer_intro_link_id: link.id,
    admin_saved_job_id: link.admin_saved_job_id,
    candidate_profile_id: link.candidate_profile_id,
    acceptance_id: data.id,
    event_type: "accept_completed",
    occurred_at: data.accepted_at,
    ip_address: getClientIp(req),
    user_agent: req.headers.get("user-agent"),
    referrer: req.headers.get("referer"),
    metadata: {
      companyName,
      contactEmail,
      compensationModel,
      oneTimeFeeSek,
    },
  })

  return NextResponse.json({ data })
}
