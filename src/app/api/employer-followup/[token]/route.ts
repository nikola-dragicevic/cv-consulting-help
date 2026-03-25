import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabaseAdmin"
import { isEmployerFollowupStatus, statusNeedsHiringDetails } from "@/lib/interviewFollowup"

export const runtime = "nodejs"
export const maxDuration = 30

function parseSalary(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return null
  const digits = value.replace(/[^\d]/g, "")
  if (!digits) return null
  const parsed = Number.parseInt(digits, 10)
  return Number.isFinite(parsed) ? parsed : null
}

function parseDate(value: FormDataEntryValue | null) {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function parseString(value: FormDataEntryValue | null) {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ token: string }> }
) {
  const { token } = await ctx.params
  const admin = getSupabaseAdmin()
  const { data: booking, error } = await admin
    .from("employer_interview_bookings")
    .select(
      "id,admin_saved_job_id,company_name,contact_name,contact_email,booking_date,start_time,end_time,admin_followup_status,employer_followup_notes,agreed_base_salary_sek,employment_start_date,employment_type,employment_contract_signed,proof_document_name,employment_ended_at"
    )
    .eq("followup_token", token)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!booking) return NextResponse.json({ error: "Link not found" }, { status: 404 })

  const { data: savedJob } = booking.admin_saved_job_id
    ? await admin
        .from("admin_saved_jobs")
        .select("headline,company")
        .eq("id", booking.admin_saved_job_id)
        .maybeSingle()
    : { data: null }

  return NextResponse.json({
    data: {
      booking,
      savedJob: savedJob || null,
    },
  })
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ token: string }> }
) {
  const { token } = await ctx.params
  const admin = getSupabaseAdmin()
  const formData = await req.formData()
  const status = typeof formData.get("status") === "string" ? String(formData.get("status")).trim() : ""
  const notes = parseString(formData.get("notes"))
  const agreedBaseSalarySek = parseSalary(formData.get("agreedBaseSalarySek"))
  const employmentStartDate = parseDate(formData.get("employmentStartDate"))
  const employmentType = parseString(formData.get("employmentType"))
  const employmentEndedAt = parseDate(formData.get("employmentEndedAt"))
  const employmentContractSigned = formData.get("employmentContractSigned") === "true"
  const proofFile = formData.get("proofFile")

  if (!isEmployerFollowupStatus(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 })
  }

  const { data: booking, error: bookingError } = await admin
    .from("employer_interview_bookings")
    .select("id,admin_saved_job_id,proof_document_path,proof_document_name")
    .eq("followup_token", token)
    .maybeSingle()

  if (bookingError) return NextResponse.json({ error: bookingError.message }, { status: 500 })
  if (!booking) return NextResponse.json({ error: "Link not found" }, { status: 404 })

  if (statusNeedsHiringDetails(status)) {
    if (!agreedBaseSalarySek || !employmentStartDate || !employmentType) {
      return NextResponse.json(
        { error: "Salary, employment start date and employment type are required for this status" },
        { status: 400 }
      )
    }
  }

  if (status === "salary_confirmed" && !employmentContractSigned) {
    return NextResponse.json({ error: "Contract signed must be confirmed before salary can be confirmed" }, { status: 400 })
  }

  let proofDocumentPath = booking.proof_document_path || null
  let proofDocumentName = booking.proof_document_name || null
  const uploadedFile =
    proofFile instanceof File && proofFile.size > 0
      ? proofFile
      : null

  if (uploadedFile) {
    const extension = uploadedFile.name.includes(".") ? uploadedFile.name.split(".").pop() : "pdf"
    proofDocumentName = uploadedFile.name
    proofDocumentPath = `${booking.id}/${crypto.randomUUID()}_${Date.now()}.${extension || "pdf"}`
    const { error: uploadError } = await admin.storage
      .from("employer-proofs")
      .upload(proofDocumentPath, Buffer.from(await uploadedFile.arrayBuffer()), {
        contentType: uploadedFile.type || "application/octet-stream",
        upsert: false,
      })

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 })
    }
  }

  if (status === "salary_confirmed" && !proofDocumentPath) {
    return NextResponse.json(
      { error: "Please upload a signed offer/employment proof or return with the document later." },
      { status: 400 }
    )
  }

  const nowIso = new Date().toISOString()
  const patch: Record<string, unknown> = {
    admin_followup_status: status,
    employer_followup_notes: notes,
    employer_followup_completed_at: nowIso,
    agreed_base_salary_sek: agreedBaseSalarySek,
    employment_start_date: employmentStartDate,
    employment_type: employmentType,
    employment_contract_signed: employmentContractSigned,
    proof_document_path: proofDocumentPath,
    proof_document_name: proofDocumentName,
  }

  if (employmentContractSigned) {
    patch.employment_contract_signed_at = nowIso
  }
  if (status === "salary_confirmed") {
    patch.salary_confirmed_at = nowIso
  }
  if (status === "active_billing") {
    patch.active_billing_at = nowIso
  }
  if (status === "employment_ended") {
    patch.employment_ended_at = employmentEndedAt || nowIso.slice(0, 10)
  }

  const { data, error } = await admin
    .from("employer_interview_bookings")
    .update(patch)
    .eq("id", booking.id)
    .select(
      "id,admin_followup_status,employer_followup_completed_at,employer_followup_notes,agreed_base_salary_sek,employment_start_date,employment_type,employment_contract_signed,proof_document_name,salary_confirmed_at,active_billing_at,employment_ended_at"
    )
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
