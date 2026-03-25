# Chrome Web Store Submission Pack

This document contains ready-to-use text and a compliance checklist for publishing the JobbNu extension.

## Public URLs to use

- Privacy policy:
  - `https://jobbnu.se/integritetspolicy/extension`
- Support page:
  - `https://jobbnu.se/support/extension`
- Website:
  - `https://jobbnu.se`

## Single purpose

Use this exact framing consistently:

`JobbNu helps logged-in JobbNu users autofill external job application forms with profile data and CV already stored in JobbNu.`

## Short description

`Autofill job applications with your JobbNu profile and CV.`

## Detailed description

`JobbNu Apply Helper helps logged-in JobbNu users fill out external job application forms faster.

The extension can identify common form fields such as first name, last name, email, phone number, city, cover-letter fields, and CV upload fields. It then uses information the user has already stored in JobbNu to help populate those fields.

The extension is designed to support candidate-side application workflows. Users still review the result themselves before submitting any application. The extension does not auto-submit applications.`

## Privacy practices summary

Suggested dashboard wording:

- Data handling:
  - `This extension accesses profile data the user has already stored in JobbNu and reads form fields on the currently open job-application page in order to autofill those fields at the user’s request.`
- Not sold:
  - `JobbNu does not sell personal data.`
- Purpose limitation:
  - `Data is used only to provide the autofill function requested by the user.`

## Permission justification

For reviewer / privacy answers:

- `activeTab`
  - Needed so the extension can interact with the currently open job-application page selected by the user.
- `storage`
  - Needed for lightweight local extension state.
- `scripting`
  - Needed to detect and fill form fields on the current page.
- `tabs`
  - Needed to interact with the currently active tab chosen by the user.
- Host permissions
  - Needed because users may apply on many different external recruitment portals, and the extension must inspect and fill the currently opened application form.

## Reviewer instructions

Paste something close to this in the review instructions field:

`1. Log in to JobbNu.
2. Open a supported external application page in Chrome.
3. Click the JobbNu extension icon.
4. Click "Skanna sidan" or "Fyll ansökningsformulär".
5. The extension will try to fill common fields such as name, email, phone, city and CV upload using the candidate data already stored in JobbNu.
6. The extension does not automatically submit the application.`

## Screenshot plan

Prepare:

1. Popup screenshot
   - show `Fyll ansökningsformulär`
2. External form before fill
3. External form after fill
4. Dashboard screenshot showing `Ansök externt`

## Before submission

1. Add final extension icons
2. Review manifest name, version and description
3. Ensure privacy and support URLs are live
4. Ensure screenshots and promo image are ready
5. Make sure the extension behavior matches the listing exactly

## Legal notes

- The extension must not auto-submit job applications.
- Users must remain in control of review and submission.
- Privacy disclosures must match actual behavior exactly.
