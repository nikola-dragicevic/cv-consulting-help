import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import {
  buildAuthorizationUrl,
  buildOauthState,
  getOauthStateCookieName,
  getPublicAppUrl,
  type MailProvider,
} from "@/lib/emailAccounts"
import { getServerSupabase } from "@/lib/supabaseServer"

export const runtime = "nodejs"

export async function GET(req: Request) {
  const requestUrl = new URL(req.url)
  const supabase = await getServerSupabase()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return NextResponse.redirect(getPublicAppUrl("/login"))
  }

  const { searchParams } = new URL(req.url)
  const provider = searchParams.get("provider")
  if (provider !== "google" && provider !== "microsoft") {
    const invalidUrl = getPublicAppUrl("/profile")
    invalidUrl.searchParams.set("mail_oauth", "invalid_provider")
    return NextResponse.redirect(invalidUrl)
  }

  const state = buildOauthState(provider as MailProvider)
  const authUrl = buildAuthorizationUrl(provider as MailProvider, state)
  const cookieStore = await cookies()
  cookieStore.set({
    name: getOauthStateCookieName(),
    value: state,
    httpOnly: true,
    secure: requestUrl.protocol === "https:",
    sameSite: "lax",
    path: "/",
    maxAge: 15 * 60,
  })

  return NextResponse.redirect(authUrl)
}
