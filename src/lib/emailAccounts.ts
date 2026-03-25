import { createCipheriv, createDecipheriv, randomBytes } from "crypto"

export type MailProvider = "google" | "microsoft"

type ProviderConfig = {
  provider: MailProvider
  label: string
  authorizationUrl: string
  tokenUrl: string
  scopes: string[]
  clientId: string
  clientSecret: string
  callbackPath: string
  profileEndpoint?: string
  tenantId?: string
}

type TokenExchangeResult = {
  accessToken: string
  refreshToken: string | null
  expiresAt: string | null
  scopeList: string[]
  raw: Record<string, unknown>
}

type ProviderIdentity = {
  email: string | null
  displayName: string | null
  providerAccountId: string | null
  raw: Record<string, unknown>
}

const CALLBACK_BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://jobbnu.se"
const OAUTH_COOKIE_NAME = "candidate_mail_oauth_state"

export function getPublicAppUrl(pathname = "/") {
  return new URL(pathname, CALLBACK_BASE_URL)
}

function getEncryptionKey() {
  const rawKey = process.env.MAIL_OAUTH_ENCRYPTION_KEY || process.env.EMAIL_ACCOUNT_ENCRYPTION_KEY || ""
  if (!rawKey) {
    throw new Error("MAIL_OAUTH_ENCRYPTION_KEY is not set")
  }

  const normalized = rawKey.trim()
  const decoded =
    normalized.length === 64 && /^[0-9a-f]+$/i.test(normalized)
      ? Buffer.from(normalized, "hex")
      : Buffer.from(normalized, "base64")

  if (decoded.length !== 32) {
    throw new Error("MAIL_OAUTH_ENCRYPTION_KEY must decode to exactly 32 bytes")
  }

  return decoded
}

export function encryptSecret(value: string | null) {
  if (!value) return null
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv)
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, encrypted]).toString("base64")
}

export function decryptSecret(value: string | null) {
  if (!value) return null
  const payload = Buffer.from(value, "base64")
  const iv = payload.subarray(0, 12)
  const tag = payload.subarray(12, 28)
  const encrypted = payload.subarray(28)
  const decipher = createDecipheriv("aes-256-gcm", getEncryptionKey(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8")
}

export function getOauthStateCookieName() {
  return OAUTH_COOKIE_NAME
}

export function buildOauthState(provider: MailProvider) {
  return JSON.stringify({
    provider,
    nonce: randomBytes(24).toString("hex"),
    createdAt: Date.now(),
  })
}

export function parseOauthState(raw: string | undefined | null) {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { provider?: string; nonce?: string; createdAt?: number }
    if (!parsed?.provider || !parsed?.nonce || typeof parsed?.createdAt !== "number") return null
    if (Date.now() - parsed.createdAt > 15 * 60 * 1000) return null
    if (parsed.provider !== "google" && parsed.provider !== "microsoft") return null
    return parsed as { provider: MailProvider; nonce: string; createdAt: number }
  } catch {
    return null
  }
}

export function getProviderConfig(provider: MailProvider): ProviderConfig {
  if (provider === "google") {
    return {
      provider,
      label: "Google",
      authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      scopes: ["https://www.googleapis.com/auth/gmail.send"],
      clientId: process.env.GOOGLE_OAUTH_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET || "",
      callbackPath: "/api/profile/email-accounts/callback/google",
      profileEndpoint: "https://www.googleapis.com/oauth2/v2/userinfo",
    }
  }

  const tenantId = process.env.MICROSOFT_OAUTH_TENANT_ID || "common"
  return {
    provider,
    label: "Microsoft",
    authorizationUrl: `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`,
    tokenUrl: `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    scopes: ["offline_access", "openid", "profile", "email", "Mail.Send"],
    clientId: process.env.MICROSOFT_OAUTH_CLIENT_ID || "",
    clientSecret: process.env.MICROSOFT_OAUTH_CLIENT_SECRET || "",
    callbackPath: "/api/profile/email-accounts/callback/microsoft",
    profileEndpoint: "https://graph.microsoft.com/v1.0/me",
    tenantId,
  }
}

export function getProviderRedirectUri(provider: MailProvider) {
  const config = getProviderConfig(provider)
  return `${CALLBACK_BASE_URL}${config.callbackPath}`
}

export function buildAuthorizationUrl(provider: MailProvider, state: string) {
  const config = getProviderConfig(provider)
  if (!config.clientId || !config.clientSecret) {
    throw new Error(`${config.label} OAuth env vars are missing`)
  }

  const url = new URL(config.authorizationUrl)
  url.searchParams.set("client_id", config.clientId)
  url.searchParams.set("redirect_uri", getProviderRedirectUri(provider))
  url.searchParams.set("response_type", "code")
  url.searchParams.set("state", state)

  if (provider === "google") {
    url.searchParams.set("scope", config.scopes.join(" "))
    url.searchParams.set("access_type", "offline")
    url.searchParams.set("prompt", "consent")
    url.searchParams.set("include_granted_scopes", "true")
  } else {
    url.searchParams.set("scope", config.scopes.join(" "))
    url.searchParams.set("response_mode", "query")
  }

  return url.toString()
}

export async function exchangeCodeForTokens(provider: MailProvider, code: string): Promise<TokenExchangeResult> {
  const config = getProviderConfig(provider)
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: getProviderRedirectUri(provider),
  })

  const res = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  })

  const json = await res.json().catch(() => null)
  if (!res.ok || !json?.access_token) {
    const providerError =
      typeof json?.error_description === "string"
        ? json.error_description
        : typeof json?.error === "string"
        ? json.error
        : `Could not exchange ${provider} OAuth code`
    throw new Error(providerError)
  }

  const expiresIn = typeof json.expires_in === "number" ? json.expires_in : Number(json.expires_in || 0)
  const expiresAt = expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000).toISOString() : null
  const scopeList =
    typeof json.scope === "string"
      ? json.scope.split(/\s+/).filter(Boolean)
      : config.scopes

  return {
    accessToken: String(json.access_token),
    refreshToken: typeof json.refresh_token === "string" ? json.refresh_token : null,
    expiresAt,
    scopeList,
    raw: json as Record<string, unknown>,
  }
}

export async function fetchProviderIdentity(
  provider: MailProvider,
  accessToken: string
): Promise<ProviderIdentity> {
  const config = getProviderConfig(provider)
  if (provider === "google") {
    // We intentionally request only gmail.send to keep scope surface minimal.
    // That scope does not guarantee access to the Google userinfo endpoint.
    return { email: null, displayName: null, providerAccountId: null, raw: {} }
  }

  if (!config.profileEndpoint) {
    return { email: null, displayName: null, providerAccountId: null, raw: {} }
  }

  const res = await fetch(config.profileEndpoint, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
    cache: "no-store",
  })

  const json = await res.json().catch(() => null)
  if (!res.ok || !json) {
    throw new Error(`Could not fetch ${provider} profile`)
  }

  return {
    email: typeof json.mail === "string" ? json.mail : typeof json.userPrincipalName === "string" ? json.userPrincipalName : null,
    displayName: typeof json.displayName === "string" ? json.displayName : null,
    providerAccountId: typeof json.id === "string" ? json.id : null,
    raw: json as Record<string, unknown>,
  }
}

export function getProviderFriendlyName(provider: MailProvider) {
  return getProviderConfig(provider).label
}
