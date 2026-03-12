# Postmark + Supabase Auth Setup

This project is already prepared so signup confirmations can land on `/profile`.

Relevant code:
- `src/app/signup/page.tsx`
- `src/app/api/auth/callback/route.ts`
- `src/app/api/contact/route.ts`

## What You Need

1. A Postmark account
2. One Postmark `Server`
3. A verified sender or verified domain for `jobbnu.se`
4. Your Supabase project dashboard

## Postmark Setup

In Postmark:

1. Create a new `Server`
2. Go to `Sender Signatures` or `Domains`
3. Verify either:
   - `info@jobbnu.se` as a sender signature, or
   - `jobbnu.se` as a full sending domain
4. Add the DNS records Postmark gives you
5. Copy the `Server API Token`

Recommended sender:
- From name: `JobbNu`
- From email: `info@jobbnu.se`

If `info@jobbnu.se` is a real inbox, users can reply to it directly.

## Supabase SMTP Fields

In Supabase:
- Go to `Authentication`
- Go to `Email`
- Enable `Custom SMTP`

Use these values:

- Host: `smtp.postmarkapp.com`
- Port: `587`
- Username: `POSTMARK_SERVER_API_TOKEN`
- Password: `POSTMARK_SERVER_API_TOKEN`
- Sender name: `JobbNu`
- Sender email: `info@jobbnu.se`

For username and password, paste the same Postmark Server API Token in both fields.

## Split Mail Strategy

Use two separate mail channels:

- `Supabase Auth emails`
  Use Postmark for signup confirmations, password resets, and other authentication mail.

- `App business emails`
  Use your existing business mailbox SMTP for contact forms, employer outreach, and other operational mail sent by your app.

The app-side mailer now supports dedicated business SMTP environment variables:

- `BUSINESS_SMTP_HOST`
- `BUSINESS_SMTP_PORT`
- `BUSINESS_SMTP_SECURE`
- `BUSINESS_SMTP_USER`
- `BUSINESS_SMTP_PASS`
- `BUSINESS_CONTACT_EMAIL`

If these are not set, it falls back to the current `SMTP_*` variables.

## Confirmation Redirect

The app already sets signup email redirects to:

- `https://jobbnu.se/profile`

That means after email confirmation, the user should land on `/profile`.

## Supabase Email Template

In Supabase:
- Go to `Authentication`
- Go to `Templates`
- Open the `Confirm signup` template

Use the HTML from:

- `docs/templates/supabase-confirm-signup.html`

Important:
- Keep `{{ .ConfirmationURL }}` in the button link
- Do not hardcode the confirmation token yourself

## Signature Image

If you want to include a signature image hosted on Supabase Storage:

1. Put the image in a public bucket, or make sure the URL is publicly accessible
2. Replace `SIGNATURE_IMAGE_URL` in the template with the real image URL

Example shape:

`https://YOUR-PROJECT.supabase.co/storage/v1/object/public/branding/signature.png`

## Testing

After setup:

1. Create a new test user from `/signup`
2. Open the confirmation email
3. Click confirm
4. Verify the user lands on `/profile`

If it fails:
- check sender verification in Postmark
- check DNS propagation for SPF and DKIM
- confirm Supabase `Site URL` is `https://jobbnu.se`
- confirm `https://jobbnu.se/profile` is allowed in Supabase redirect URLs
