# Google Gmail OAuth Verification Audit

Last updated: 2026-03-26

This checklist is for JobbNu's Gmail connection flow used to send job applications from a user's own mailbox.

## 1. What Google needs to understand

JobbNu asks for **send-only** Gmail access so a logged-in user can:

- connect Gmail from `/profile`
- review a generated application email
- send that email from the user's own mailbox

JobbNu does **not** need inbox-reading access for this feature.

Requested Google scope:

- `https://www.googleapis.com/auth/gmail.send`

Official references:

- Gmail scopes: `https://developers.google.com/workspace/gmail/api/auth/scopes`
- OAuth app verification: `https://support.google.com/cloud/answer/13463073?hl=en`
- Demo video guidance: `https://support.google.com/cloud/answer/13804565?hl=en`

## 2. Current JobbNu status

Already good in code:

- Google OAuth route exists
- Redirect URI is production-safe
- Scope surface is minimal: `gmail.send`
- Tokens are encrypted at rest
- The flow is candidate-initiated from `/profile`

Likely blockers before approval:

- App may still be in **Testing**, which causes `403 access_denied` for non-test users
- A public **terms page** must exist and be linked on the consent screen
- A public **support/contact page** should exist and be linked
- Privacy policy and consent-screen text must clearly say:
  - send-only permission
  - no inbox reading
  - user-triggered sending only

## 3. Consent screen checklist

In Google Cloud Console:

1. Go to `Google Cloud Console -> APIs & Services -> OAuth consent screen`
2. Set app type to `External`
3. Fill:
   - App name: `JobbNu`
   - User support email
   - App logo
   - Authorized domains: `jobbnu.se`
   - Developer contact email
4. Add these links:
   - Privacy Policy: `https://jobbnu.se/integritetspolicy`
   - Terms of Service: `https://jobbnu.se/villkor`
   - Support / home page: `https://jobbnu.se/support`
5. Add only this Google scope:
   - `https://www.googleapis.com/auth/gmail.send`

## 4. Exact scope justification

Use wording close to this when Google asks why the scope is needed:

> JobbNu helps users generate and review job application emails for specific jobs. A user may connect Gmail so the reviewed application email can be sent from the user's own Gmail account. JobbNu requests only the `gmail.send` scope. The app does not read, list, or analyze the user's inbox. Sending happens only after the user explicitly reviews the draft and confirms the send action.

## 5. Demo video script

Google usually wants a short screen recording that clearly shows the scope being used in the real product.

Record in English if possible.

Suggested video flow:

1. Show `jobbnu.se/profile`
2. Show that the user is logged in
3. Click `Connect Gmail`
4. Show the Google consent screen
5. Pause on the permission text that says the app can send email on the user's behalf
6. Continue the OAuth flow and return to JobbNu
7. Show the connected Gmail state on `/profile`
8. Open `/dashboard`
9. Pick a direct-email job
10. Click `Generera email`
11. Show the generated application draft
12. Show that the user can edit the draft before sending
13. Click `Skicka email`
14. Explain that the email is sent only after the user's explicit action

What to say in the video:

- JobbNu uses Gmail only to send a reviewed application email from the user's own mailbox
- JobbNu does not read inbox contents for this feature
- The user can edit the draft before sending
- The scope requested is minimal and limited to send-only access

## 6. What to fix if Google rejects it

Common rejection themes:

- unclear product purpose
- too-broad scopes
- privacy policy does not match actual behavior
- missing or weak demo video
- app still looks like a test app

If Google pushes back:

- keep only `gmail.send`
- keep all copy aligned around send-only behavior
- make sure the consent screen, privacy policy, support page, and video all describe the same flow

## 7. Pre-submission pass/fail

Pass only when all are true:

- [ ] `gmail.send` is the only Google scope requested
- [ ] OAuth consent screen has production branding and `jobbnu.se` authorized
- [ ] privacy policy is live
- [ ] terms page is live
- [ ] support page is live
- [ ] redirect URI is exactly `https://jobbnu.se/api/profile/email-accounts/callback/google`
- [ ] app is no longer limited only to test users, or test users are configured while preparing review
- [ ] demo video is recorded and uploaded
- [ ] the video shows explicit user review before send
- [ ] the policy text says JobbNu does not read inbox contents for this feature

## 8. Final note

If users currently see:

`jobbnu.se has not completed the Google verification process`

then the app is still in Testing or has not yet passed verification. Add test users for development, but submit the full verification package before public launch.

## 9. Copy-Paste Submission Pack

Use the text below directly in Google Cloud where relevant.

### App information

**App name**

`JobbNu`

**User support email**

`info@jobbnu.se`

**Application home page**

`https://jobbnu.se`

**Privacy policy**

`https://jobbnu.se/integritetspolicy`

**Terms of service**

`https://jobbnu.se/villkor`

**Support page**

`https://jobbnu.se/support`

**Authorized domain**

`jobbnu.se`

**Redirect URI**

`https://jobbnu.se/api/profile/email-accounts/callback/google`

### Data access justification

**Requested Google scope**

`https://www.googleapis.com/auth/gmail.send`

**Short justification**

> JobbNu needs the `gmail.send` scope so a user can send a reviewed job-application email from the user's own Gmail account.

**Full justification**

> JobbNu helps users generate and review job application emails for specific jobs. A user may connect Gmail so the reviewed application email can be sent from the user's own Gmail account. JobbNu requests only the `https://www.googleapis.com/auth/gmail.send` scope. The app does not read, list, or analyze inbox contents for this feature. Sending happens only after the user explicitly reviews the draft and confirms the send action.

**How the data is used**

> JobbNu uses Google user data only to send a user-reviewed application email from the user's own Gmail account after explicit user action. JobbNu does not use Gmail access to read inbox contents for this feature.

**Why this scope is the minimum needed**

> JobbNu uses the minimum Gmail scope required for this feature. The app requests only send-only permission and does not request inbox-reading or mailbox-management scopes.

### Verification answers

**What does your app do?**

> JobbNu is a candidate-side job application platform. Users create a profile, match against relevant jobs, generate tailored application emails, and can optionally connect Gmail to send those reviewed emails from their own mailbox.

**Why do you need access to Google user data?**

> We need access to Gmail send-only permission so a user can send a reviewed job-application email from the user's own Gmail account. This happens only after the user explicitly chooses to connect Gmail and later confirms the send action.

**Does the app read inbox contents?**

> No. For this feature, JobbNu does not read, list, or analyze inbox contents. The app requests only the `gmail.send` scope.

**When is the data used?**

> Google user data is used only when the user explicitly connects Gmail and later chooses to send a reviewed application email from JobbNu.

**Does the user review the content before sending?**

> Yes. The user can review and edit the generated email before clicking send.

**Does the app send emails automatically?**

> No. Emails are not sent automatically. Sending occurs only after explicit user action inside JobbNu.

**How are tokens stored?**

> OAuth tokens are stored encrypted at rest and are used only for the mailbox connection feature.

**Does the app share Gmail data with third parties?**

> No. JobbNu does not sell Gmail data or use it for advertising. Gmail access is used only to provide the send-from-your-own-mailbox feature requested by the user.

**How can the reviewer test the app?**

> 1. Sign in to JobbNu.
> 2. Open the profile page.
> 3. Click “Connect Gmail”.
> 4. Approve the Gmail permission on Google’s consent screen.
> 5. Return to JobbNu and confirm Gmail shows as connected.
> 6. Open the dashboard.
> 7. Open a job with direct email available.
> 8. Click “Generate email”.
> 9. Review or edit the draft.
> 10. Click “Send email”.

### Demo video script

Record in English if possible. Keep the video short and direct.

**Suggested narration**

> This is JobbNu, a job application platform for candidates.
>
> A logged-in user can connect Gmail from the profile page.
>
> JobbNu requests only the Gmail send permission.
>
> The user is redirected to Google’s consent screen.
>
> This permission is used only so the user can send a reviewed application email from the user’s own mailbox.
>
> JobbNu does not read inbox contents for this feature.
>
> After consent, the user returns to JobbNu and Gmail is shown as connected.
>
> On the dashboard, the user opens a direct-email job.
>
> JobbNu generates a tailored application email for that job.
>
> The user can review and edit the email before sending.
>
> The email is sent only after the user explicitly clicks send.

**What to show on screen**

1. `https://jobbnu.se/profile`
2. Logged-in user state
3. Click `Connect Gmail`
4. Google consent screen
5. Pause on the permission text
6. Return to `https://jobbnu.se/profile`
7. Show Gmail as connected
8. Open `https://jobbnu.se/dashboard`
9. Open a direct-email job
10. Click `Generera email`
11. Edit the draft briefly
12. Click `Skicka email`

**Important things not to skip**

- Show the exact Gmail permission on the Google screen
- Show that the user reviews the draft before sending
- Say clearly that JobbNu does not read inbox contents for this feature
- Keep the wording consistent with the privacy policy, support page, and consent screen
