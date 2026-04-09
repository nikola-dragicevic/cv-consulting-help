import { decryptSecret, encryptSecret, type MailProvider } from "@/lib/emailAccounts"
import { getProviderConfig } from "@/lib/emailAccounts"

export type CandidateEmailAccountRow = {
  id: string
  user_id: string
  provider: MailProvider
  email: string | null
  display_name: string | null
  status: string
  encrypted_access_token: string | null
  encrypted_refresh_token: string | null
  access_token_expires_at: string | null
}

export type MailAttachment = {
  filename: string
  contentType: string
  contentBase64: string
}

export async function refreshAccessTokenForProvider(params: {
  provider: MailProvider
  refreshToken: string
}) {
  const config = getProviderConfig(params.provider)
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: "refresh_token",
    refresh_token: params.refreshToken,
  })

  if (params.provider === "microsoft") {
    body.set("scope", config.scopes.join(" "))
  }

  const res = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  })

  const json = await res.json().catch(() => null)
  if (!res.ok || !json?.access_token) {
    const message =
      typeof json?.error_description === "string"
        ? json.error_description
        : typeof json?.error === "string"
          ? json.error
          : `Could not refresh ${params.provider} access token`
    throw new Error(message)
  }

  const expiresIn = typeof json.expires_in === "number" ? json.expires_in : Number(json.expires_in || 0)
  return {
    accessToken: String(json.access_token),
    refreshToken: typeof json.refresh_token === "string" ? json.refresh_token : params.refreshToken,
    encryptedAccessToken: encryptSecret(String(json.access_token)),
    encryptedRefreshToken: encryptSecret(typeof json.refresh_token === "string" ? json.refresh_token : params.refreshToken),
    expiresAt: expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000).toISOString() : null,
  }
}

export async function getValidAccessToken(params: {
  account: CandidateEmailAccountRow
}) {
  const decryptedAccessToken = decryptSecret(params.account.encrypted_access_token)
  const decryptedRefreshToken = decryptSecret(params.account.encrypted_refresh_token)
  const expiresAtMs = params.account.access_token_expires_at ? new Date(params.account.access_token_expires_at).getTime() : 0
  const stillValid = decryptedAccessToken && expiresAtMs > Date.now() + 60_000

  if (stillValid) {
    return {
      accessToken: decryptedAccessToken,
      encryptedAccessToken: params.account.encrypted_access_token,
      encryptedRefreshToken: params.account.encrypted_refresh_token,
      expiresAt: params.account.access_token_expires_at,
    }
  }

  if (!decryptedRefreshToken) {
    throw new Error("No refresh token available for connected email account")
  }

  return refreshAccessTokenForProvider({
    provider: params.account.provider,
    refreshToken: decryptedRefreshToken,
  })
}

function encodeBase64Url(value: string | Buffer) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "")
}

function encodeMimeHeader(value: string) {
  if (!/[^\x20-\x7E]/.test(value)) {
    return value
  }
  const base64 = Buffer.from(value, "utf-8").toString("base64")
  return `=?UTF-8?B?${base64}?=`
}

function buildMimeMessage(params: {
  from: string
  to: string
  subject: string
  textBody: string
  attachments?: MailAttachment[]
}) {
  const mixedBoundary = `mixed_${Date.now().toString(16)}`
  const textPart = [
    `--${mixedBoundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 7bit",
    "",
    params.textBody,
    "",
  ]

  const attachmentParts = (params.attachments || []).flatMap((attachment) => [
    `--${mixedBoundary}`,
    `Content-Type: ${attachment.contentType}; name="${attachment.filename}"`,
    "Content-Transfer-Encoding: base64",
    `Content-Disposition: attachment; filename="${attachment.filename}"`,
    "",
    attachment.contentBase64.match(/.{1,76}/g)?.join("\r\n") || attachment.contentBase64,
    "",
  ])

  const mime = [
    `From: ${params.from}`,
    `To: ${params.to}`,
    `Subject: ${encodeMimeHeader(params.subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${mixedBoundary}"`,
    "",
    ...textPart,
    ...attachmentParts,
    `--${mixedBoundary}--`,
    "",
  ].join("\r\n")

  return encodeBase64Url(mime)
}

export async function sendViaConnectedMailbox(params: {
  provider: MailProvider
  accessToken: string
  fromEmail: string
  toEmail: string
  subject: string
  textBody: string
  attachments?: MailAttachment[]
}) {
  if (params.provider === "google") {
    const raw = buildMimeMessage({
      from: params.fromEmail,
      to: params.toEmail,
      subject: params.subject,
      textBody: params.textBody,
      attachments: params.attachments,
    })

    const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw }),
      cache: "no-store",
    })

    const json = await res.json().catch(() => null)
    if (!res.ok) {
      const message =
        typeof json?.error?.message === "string"
          ? json.error.message
          : `Gmail send failed (${res.status})`
      throw new Error(message)
    }

    return {
      providerMessageId: typeof json?.id === "string" ? json.id : null,
    }
  }

  const res = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: {
        subject: params.subject,
        body: {
          contentType: "Text",
          content: params.textBody,
        },
        toRecipients: [
          {
            emailAddress: {
              address: params.toEmail,
            },
          },
        ],
        attachments: (params.attachments || []).map((attachment) => ({
          "@odata.type": "#microsoft.graph.fileAttachment",
          name: attachment.filename,
          contentType: attachment.contentType,
          contentBytes: attachment.contentBase64,
        })),
      },
      saveToSentItems: true,
    }),
    cache: "no-store",
  })

  if (!res.ok) {
    const json = await res.json().catch(() => null)
    const message =
      typeof json?.error?.message === "string"
        ? json.error.message
        : `Microsoft send failed (${res.status})`
    throw new Error(message)
  }

  return { providerMessageId: null }
}
