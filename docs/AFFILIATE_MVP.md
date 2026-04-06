# Affiliate MVP

## Goal

Track creator-driven paid conversions for:
- Dashboard Premium
- Auto Apply

Pay creators a one-time commission on the first paid conversion per referred user.

## Link format

Use:

```text
https://jobbnu.se/?ref=creator-code
```

Example:

```text
https://jobbnu.se/?ref=jobbmedmaria
```

## What happens

1. Visitor opens a `?ref=` link
2. Middleware stores the referral code in a cookie for 30 days
3. User signs up / logs in later
4. When the user starts checkout:
   - Dashboard Premium checkout stores affiliate attribution
   - Auto Apply checkout stores affiliate attribution
5. When Stripe confirms the first successful paid checkout:
   - referral row is marked converted
   - payout amount is calculated
   - payout stays `pending` until manually paid out

## Current commission logic

- default commission: `30%`
- one-time payout on the first paid conversion for the referred user
- no recurring monthly commission yet

## Current payout examples

- Dashboard Premium `99 kr` => `30 kr` payout
- Auto Apply `300 kr` => `90 kr` payout
- Premium -> Auto Apply upgrade `200 kr` => `60 kr` payout

## Database tables

- `affiliate_creators`
- `affiliate_referrals`

## Admin API

### Create/list creators

```text
GET  /api/admin/affiliates
POST /api/admin/affiliates
```

### POST body example

```json
{
  "full_name": "Maria Svensson",
  "email": "maria@example.com",
  "social_handle": "@jobbmedmaria",
  "code": "jobbmedmaria",
  "commission_percent": 30
}
```

## Important limitations in this first MVP

- attribution is cookie-based
- one user maps to one creator
- payout is triggered only on the first paid conversion
- no creator login/dashboard yet
- no automated payout export yet

## Suggested next step

Build a small admin tab for:
- creator list
- referral list
- pending payouts
- copyable referral links
