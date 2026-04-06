import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getServerSupabase } from "@/lib/supabaseServer";
import { isAdminOrModerator } from "@/lib/admin";

function getSupabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
}

export async function GET() {
  const supabase = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!isAdminOrModerator(user)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabaseAdmin = getSupabaseAdmin();
  const nowIso = new Date().toISOString();

  const [
    activeRes,
    sourceInactiveRes,
    expiredRes,
  ] = await Promise.all([
    supabaseAdmin
      .from("job_ads")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true),
    supabaseAdmin
      .from("job_ads")
      .select("id", { count: "exact", head: true })
      .eq("is_active", false)
      .not("source_inactivated_at", "is", null),
    supabaseAdmin
      .from("job_ads")
      .select("id", { count: "exact", head: true })
      .eq("is_active", false)
      .is_("source_inactivated_at", null)
      .lt("application_deadline", nowIso),
  ]);

  const firstError = activeRes.error || sourceInactiveRes.error || expiredRes.error;
  if (firstError) {
    return NextResponse.json({ error: firstError.message }, { status: 500 });
  }

  return NextResponse.json({
    active: activeRes.count || 0,
    sourceInactivated: sourceInactiveRes.count || 0,
    expired: expiredRes.count || 0,
    generatedAt: nowIso,
  });
}
