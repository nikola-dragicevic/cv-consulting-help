import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import {
  decryptSecret,
  encryptSecret,
  exchangeCodeForTokens,
  fetchProviderIdentity,
  getOauthStateCookieName,
  getPublicAppUrl,
  parseOauthState,
  type MailProvider,
} from "@/lib/emailAccounts"
import { getSupabaseAdmin } from "@/lib/supabaseAdmin"
import { getServerSupabase } from "@/lib/supabaseServer"

export const runtime = "nodejs"

function buildProfileRedirect(req: Request, status: string, provider: string, message?: string) {
  const url = getPublicAppUrl("/profile")
  url.searchParams.set("mail_oauth", status)
  url.searchParams.set("provider", provider)
  if (message) url.searchParams.set("message", message)
  return url
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ provider: string }> }
) {
  const { provider } = await ctx.params
  const requestUrl = new URL(req.url)
  if (provider !== "google" && provider !== "microsoft") {
    return NextResponse.redirect(buildProfileRedirect(req, "invalid_provider", provider))
  }

  const supabase = await getServerSupabase()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return NextResponse.redirect(getPublicAppUrl("/login"))
  }

  const url = new URL(req.url)
  const stateParam = url.searchParams.get("state") || ""
  const code = url.searchParams.get("code") || ""
  const providerError = url.searchParams.get("error")
  const providerErrorDescription = url.searchParams.get("error_description")
  const cookieStore = await cookies()
  const stateCookie = parseOauthState(cookieStore.get(getOauthStateCookieName())?.value)
  cookieStore.set({
    name: getOauthStateCookieName(),
    value: "",
    httpOnly: true,
    secure: requestUrl.protocol === "https:",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  })

  if (!stateCookie || stateCookie.provider !== provider || stateParam !== JSON.stringify(stateCookie)) {
    return NextResponse.redirect(buildProfileRedirect(req, "state_mismatch", provider))
  }

  if (providerError) {
    return NextResponse.redirect(
      buildProfileRedirect(req, "provider_error", provider, providerErrorDescription || providerError)
    )
  }

  if (!code) {
    return NextResponse.redirect(buildProfileRedirect(req, "missing_code", provider))
  }

  const admin = getSupabaseAdmin()

  try {
    const tokens = await exchangeCodeForTokens(provider as MailProvider, code)
    const identity = await fetchProviderIdentity(provider as MailProvider, tokens.accessToken)

    const { data: existing } = await admin
      .from("candidate_email_accounts")
      .select("encrypted_refresh_token")
      .eq("user_id", user.id)
      .eq("provider", provider)
      .maybeSingle()

    const effectiveRefreshToken = tokens.refreshToken || decryptSecret(existing?.encrypted_refresh_token || null)

    const { error } = await admin
      .from("candidate_email_accounts")
      .upsert(
        {
          user_id: user.id,
          provider,
          provider_account_id: identity.providerAccountId,
          email: identity.email || user.email || null,
          display_name: identity.displayName,
          status: "connected",
          scopes: tokens.scopeList,
          encrypted_access_token: encryptSecret(tokens.accessToken),
          encrypted_refresh_token: encryptSecret(effectiveRefreshToken),
          access_token_expires_at: tokens.expiresAt,
          connected_at: new Date().toISOString(),
          disconnected_at: null,
          last_tested_at: new Date().toISOString(),
          last_error: null,
          metadata: {
            tokenResponse: tokens.raw,
            profile: identity.raw,
          },
        },
        { onConflict: "user_id,provider" }
      )

    if (error) {
      throw new Error(error.message)
    }

    return NextResponse.redirect(buildProfileRedirect(req, "connected", provider))
  } catch (error) {
    await admin
      .from("candidate_email_accounts")
      .upsert(
        {
          user_id: user.id,
          provider,
          status: "error",
          last_error: error instanceof Error ? error.message : "Unknown OAuth error",
        },
        { onConflict: "user_id,provider" }
      )

    return NextResponse.redirect(
      buildProfileRedirect(req, "error", provider, error instanceof Error ? error.message : "Unknown OAuth error")
    )
  }
}
