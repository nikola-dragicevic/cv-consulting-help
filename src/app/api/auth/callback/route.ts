// app/auth/callback/route.ts
import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabaseServer";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/profile";

  if (!code) return NextResponse.redirect(`${origin}/auth/auth-code-error`);

  const supabase = await getServerSupabase(); // <- await now
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(`${origin}/auth/auth-code-error`);

  return NextResponse.redirect(`${origin}${next}`);
}
