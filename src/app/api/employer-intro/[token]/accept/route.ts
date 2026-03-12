import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

function getSupabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!)
}

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
  const acceptedTerms = body?.acceptedTerms === true

  if (!companyName || !contactName || !contactEmail || !acceptedTerms) {
    return NextResponse.json({ error: "Missing required acceptance fields" }, { status: 400 })
  }

  const admin = getSupabaseAdmin()
  const { data: link, error: linkError } = await admin
    .from("employer_intro_links")
    .select("id,terms_version,status")
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
      ip_address: req.headers.get("x-forwarded-for") || null,
      user_agent: req.headers.get("user-agent") || null,
    })
    .select("id,company_name,contact_name,contact_email,accepted_at")
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}
