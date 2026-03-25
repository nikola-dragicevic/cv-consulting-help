# Gmail + Outlook OAuth Setup

This project now includes the first mailbox-connection layer for candidate application sending.

Implemented in code:
- `/api/profile/email-accounts`
- `/api/profile/email-accounts/connect`
- `/api/profile/email-accounts/callback/[provider]`
- `/profile` connect buttons
- `candidate_email_accounts` table

This version does:
- let a logged-in candidate connect Gmail
- let a logged-in candidate connect Outlook / Microsoft 365
- store the provider grant encrypted in Supabase
- show connected/disconnected state on `/profile`

This version does not yet:
- send job applications through Gmail API or Microsoft Graph
- refresh expired access tokens
- run send queues or throttling

## 1. Run the migration

Apply:

- `supabase/migrations/20260322_candidate_email_accounts.sql`

This creates `candidate_email_accounts` with RLS and encrypted token storage fields.

## 2. Add the encryption key

Create a 32-byte key and store it as base64 in `.env`.

Example command:

```bash
openssl rand -base64 32
```

Set:

```env
MAIL_OAUTH_ENCRYPTION_KEY=PASTE_BASE64_VALUE_HERE
```

Important:
- it must decode to exactly 32 bytes
- changing it later will make old encrypted tokens unreadable

## 3. Google setup

### Google Cloud

1. Open Google Cloud Console
2. Create or choose the production project
3. Enable Gmail API
4. Go to `APIs & Services -> OAuth consent screen`
5. Configure:
   - App name: `JobbNu`
   - Support email
   - Authorized domain: `jobbnu.se`
   - Developer contact email
6. Add the scope:
   - `https://www.googleapis.com/auth/gmail.send`
7. Go to `Credentials`
8. Create `OAuth client ID`
9. Choose `Web application`
10. Add authorized redirect URI:

```text
https://jobbnu.se/api/profile/email-accounts/callback/google
```

For local development, also add:

```text
http://localhost:3000/api/profile/email-accounts/callback/google
```

11. Copy client ID and secret

Set in `.env`:

```env
GOOGLE_OAUTH_CLIENT_ID=...
GOOGLE_OAUTH_CLIENT_SECRET=...
```

## 4. Microsoft setup

### Azure Portal

1. Open Azure Portal
2. Go to `Microsoft Entra ID -> App registrations`
3. Create a new registration
4. Name it something like `JobbNu Mail Sending`
5. Supported account types:
   - usually `Accounts in any organizational directory and personal Microsoft accounts`
6. Add redirect URI type `Web`
7. Add:

```text
https://jobbnu.se/api/profile/email-accounts/callback/microsoft
```

For local development, also add:

```text
http://localhost:3000/api/profile/email-accounts/callback/microsoft
```

8. Under `API permissions`, add delegated permission:
   - `Mail.Send`
9. Also ensure these delegated permissions are present:
   - `offline_access`
   - `openid`
   - `profile`
   - `email`
10. Create a client secret
11. Copy client ID, tenant ID, and secret

Set in `.env`:

```env
MICROSOFT_OAUTH_CLIENT_ID=...
MICROSOFT_OAUTH_CLIENT_SECRET=...
MICROSOFT_OAUTH_TENANT_ID=common
```

Use a real tenant ID instead of `common` only if you want to restrict sign-ins to one tenant.

## 5. Confirm base URL

This feature uses `NEXT_PUBLIC_BASE_URL`.

Production:

```env
NEXT_PUBLIC_BASE_URL=https://jobbnu.se
```

Local development:

```env
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

Do not leave production callback URIs pointing to localhost.

## 6. Restart the app

After adding env vars, restart Next.js so the new OAuth config is loaded.

## 7. Test the connection loop

1. Log in as a normal user
2. Open `/profile`
3. Click `Koppla` under Gmail
4. Complete Google consent
5. Verify redirect back to `/profile`
6. Confirm connected state appears
7. Repeat for Outlook

In Supabase, confirm a row appears in `candidate_email_accounts`.

Expected values:
- `provider`: `google` or `microsoft`
- `status`: `connected`
- `email`: mailbox address
- `encrypted_access_token`: populated
- `encrypted_refresh_token`: usually populated after consent

## 8. Verification prep for Google / Microsoft

Before provider review, make sure these product pages are live:
- Privacy Policy
- Terms of Service
- Contact page

Recommended policy language:
- you only request permission to send email on the user’s behalf
- you do not read inbox contents
- sending happens only on explicit user action
- tokens are stored encrypted

For review video, show:
- user on `/profile`
- click `Connect Gmail` or `Connect Outlook`
- consent screen
- redirect back into `jobbnu.se`
- connected state visible in profile

## 9. What to build next

After mailbox connection is working, the next backend slice should be:

1. token refresh helper for both providers
2. unified `send via connected mailbox` server function
3. per-job preview UI:
   - generated subject
   - generated email
   - generated ATS-optimized CV
4. guarded send action:
   - daily caps
   - randomized delay
   - per-user send log
   - provider-specific error handling

## 10. Current env checklist

```env
MAIL_OAUTH_ENCRYPTION_KEY=
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
MICROSOFT_OAUTH_CLIENT_ID=
MICROSOFT_OAUTH_CLIENT_SECRET=
MICROSOFT_OAUTH_TENANT_ID=common
NEXT_PUBLIC_BASE_URL=
```
