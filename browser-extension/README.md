# JobbNu Apply Helper

MVP browser extension for autofilling external job application forms with candidate data already stored in JobbNu.

## What it does now

- fetches the logged-in user's basic profile from `jobbnu.se`
- scans the current page for common application fields
- fills:
  - first name
  - last name
  - full name
  - email
  - phone
  - city
- attempts CV upload from the candidate CV stored in Supabase

## What it does not do yet

- no portal-specific logic yet for Teamtailor / Workday / Greenhouse
- no direct connection to a job-specific generated email yet
- no submit action
- no “application was actually sent” confirmation back to JobbNu yet

## Load it in Chrome

1. Open `chrome://extensions`
2. Turn on `Developer mode`
3. Click `Load unpacked`
4. Select this folder:

`/opt/cv-consulting/browser-extension`

## Usage

1. Stay logged in to `jobbnu.se` in the same browser
2. Open an external application page
3. Click the extension icon
4. Click `Skanna sidan` to see what the addon detects
5. Click `Fyll ansökningsformulär`

## Next recommended steps

1. Add portal-specific selectors for Teamtailor first
2. Let JobbNu pass the generated email text to the extension
3. Add a callback from the extension to JobbNu when the user confirms submission
4. Lock `Interview preparation` until:
   - direct email job: mail was actually sent
   - external apply job: user confirms the external application was submitted
