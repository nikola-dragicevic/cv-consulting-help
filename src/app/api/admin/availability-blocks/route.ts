import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getServerSupabase } from "@/lib/supabaseServer"
import { isAdminUser } from "@/lib/admin"

function getSupabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!)
}

export async function GET() {
  const supabase = await getServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()

  if (!isAdminUser(user)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabaseAdmin = getSupabaseAdmin()
  const { data, error } = await supabaseAdmin
    .from("availability_blocks")
    .select("*")
    .order("block_date", { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: data || [] })
}

export async function POST(req: Request) {
  const supabase = await getServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()

  if (!isAdminUser(user)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const blockDate = typeof body?.blockDate === "string" ? body.blockDate : ""
  const blockTime = typeof body?.blockTime === "string" ? body.blockTime : ""

  if (!blockDate) {
    return NextResponse.json({ error: "Missing blockDate" }, { status: 400 })
  }

  const startTime = blockTime ? `${blockTime}:00` : null

  const supabaseAdmin = getSupabaseAdmin()
  const { error } = await supabaseAdmin.from("availability_blocks").insert({
    block_date: blockDate,
    start_time: startTime,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
