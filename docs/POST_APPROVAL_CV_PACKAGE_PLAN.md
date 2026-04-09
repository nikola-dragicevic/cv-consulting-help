# Post-Approval CV Package Flow

This document describes the planned application-package flow that should be released **after** Google approves the current Gmail `gmail.send` review.

## Why This Waits Until Approval

JobbNu is currently under Google OAuth review for the existing Gmail send flow:

- connect Gmail from `/profile`
- generate a tailored application email
- let the user review the email
- send only after explicit user confirmation

The new package flow changes the scope-using user experience materially enough that it should wait until the current review is approved.

Until approval:

- keep the live Gmail flow stable
- keep demo-video behavior aligned with production
- do not replace the current send flow in production

If needed, we can send Google updated demo material later when the new flow is ready.

## Planned Product Flow

For a selected job on `/dashboard`:

1. generate a tailored CV text against the job description
2. generate a tailored cover letter / application email against the same job description
3. show both outputs to the user for review
4. push the tailored CV text through the existing CV builder pipeline for styled rendering/PDF
5. let the user explicitly confirm sending
6. send both:
   - styled CV attachment
   - tailored cover letter / email body

Important rule:

- no invented experience, education, certifications or claims
- tailoring may improve phrasing, emphasis and ordering
- tailoring must stay grounded in the user's existing CV/profile data

## UX Direction

Suggested CTA:

- `Skapa ansökningspaket`

Suggested review steps:

1. `CV anpassat till jobbet`
2. `Personligt brev / email`
3. `Granska och skicka`

The user should be able to:

- inspect both texts
- edit both texts
- confirm the final send action explicitly

## Gmail / Compliance Guardrails

To stay aligned with the approved Gmail intent:

- JobbNu should still request only `gmail.send`
- JobbNu should not read inbox contents for this feature
- JobbNu should not auto-send without explicit user review
- JobbNu should clearly present the final email contents before sending

## Technical Plan

### Existing pieces we already have

- profile/CV source text on `/profile`
- job description on `/dashboard`
- tailored application email generation
- CV generation pipeline
- styled CV preview / print-PDF pipeline
- Gmail/Outlook send flow

### New orchestration flow

For one selected job:

1. read source CV/profile text
2. read selected job description
3. generate:
   - tailored CV text
   - tailored cover letter/email
4. convert tailored CV text into structured CV JSON through the current CV builder pipeline
5. render styled CV preview
6. let the user review/edit
7. send the reviewed package

## Payment Plan

Planned pricing change for this package-sending service:

- change Auto Apply / send-related packaging from `300 kr/mån` to `149 kr/vecka`

Interview preparation can remain unchanged for now.

## Release Strategy

1. wait for Google approval of the current Gmail flow
2. optionally prepare a new demo video / reviewer explanation
3. ship behind a feature flag first
4. verify:
   - package generation quality
   - explicit user review
   - correct CV attachment rendering
   - stable Gmail send behavior
5. then roll out publicly
