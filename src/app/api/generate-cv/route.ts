// src/app/api/generate-cv/route.ts
// Triggers CV (and optional cover letter) generation for a paid document order.
// Can be called from the Stripe webhook (internally) or by an admin manually.

import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getServerSupabase } from "@/lib/supabaseServer"
import { isAdminOrModerator } from "@/lib/admin"
import {
  generateCvAndLetter,
  extractArbetsformedlingenJobId,
  isArbetsformedlingenUrl,
  type JobAdContext,
} from "@/lib/cvGenerator"

export const runtime = "nodejs"
export const maxDuration = 120 // generation can take up to 2 min

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Fetch job ad from job_ads table using Arbetsförmedlingen job ID
async function fetchJobAd(jobId: string): Promise<JobAdContext | null> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from("job_ads")
    .select("id, headline, company, description_text")
    .eq("id", jobId)
    .single()

  if (error || !data) {
    console.warn(`[generate-cv] Job ${jobId} not found in DB:`, error?.message)
    return null
  }

  return {
    headline: data.headline ?? "",
    company: data.company ?? null,
    description_text: data.description_text ?? "",
  }
}

// Core generation logic — shared between webhook and API calls
export async function runGeneration(documentOrderId: string): Promise<{
  success: boolean
  error?: string
}> {
  const supabase = getSupabaseAdmin()

  // 1. Fetch the order
  const { data: order, error: orderError } = await supabase
    .from("document_orders")
    .select("*")
    .eq("id", documentOrderId)
    .single()

  if (orderError || !order) {
    return { success: false, error: `Order not found: ${orderError?.message}` }
  }

  if (order.status !== "paid") {
    return { success: false, error: `Order not paid (status: ${order.status})` }
  }

  // 2. Mark as generating
  await supabase
    .from("document_orders")
    .update({ cv_generation_status: "generating" })
    .eq("id", documentOrderId)

  // 3. Resolve job ad if Arbetsförmedlingen link provided
  let job: JobAdContext | null = null
  const link: string = order.target_job_link ?? ""

  if (link && isArbetsformedlingenUrl(link)) {
    const jobId = extractArbetsformedlingenJobId(link)
    if (jobId) {
      job = await fetchJobAd(jobId)
      if (!job) {
        console.warn(`[generate-cv] Order ${documentOrderId}: link provided but job ${jobId} not in DB.`)
      }
    }
  }

  // 4. Run generation (pass fetchJobAd so multi-job letter flow can resolve each link)
  const result = await generateCvAndLetter(order, job, fetchJobAd)

  if (result.error && !result.cv) {
    await supabase
      .from("document_orders")
      .update({ cv_generation_status: "error" })
      .eq("id", documentOrderId)
    return { success: false, error: result.error }
  }

  // 5. Save results
  await supabase
    .from("document_orders")
    .update({
      generated_cv_text: result.cv,
      generated_letter_text: result.letter,
      cv_generation_status: "done",
      cv_generated_at: new Date().toISOString(),
    })
    .eq("id", documentOrderId)

  console.log(`[generate-cv] Done for order ${documentOrderId}. Letter: ${result.letter ? "yes" : "no"}`)
  return { success: true }
}

// POST /api/generate-cv — admin-only manual trigger
export async function POST(req: Request) {
  try {
    const supabase = await getServerSupabase()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!isAdminOrModerator(user)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { document_order_id } = await req.json()
    if (!document_order_id) {
      return NextResponse.json({ error: "Missing document_order_id" }, { status: 400 })
    }

    const result = await runGeneration(document_order_id)

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    console.error("[generate-cv] POST error:", msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
