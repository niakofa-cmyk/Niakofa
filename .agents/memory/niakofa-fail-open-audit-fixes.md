---
name: Niakofa fail-open bug pattern
description: health.ts nia_ai check and identity webhook secret both had fail-open defaults; fixed to fail-closed.
---

`health.ts` `/status` endpoint checked `val !== "false"` for the Nia kill-switch, meaning a missing DB row/error defaulted to "enabled" — inconsistent with every other Nia gate (which are fail-closed, `val === "true"`). Fixed to `val === "true"`.

Separately, `verification.ts`'s Stripe Identity webhook defaulted `STRIPE_IDENTITY_WEBHOOK_SECRET` to `""` and never checked for it before calling `stripe.webhooks.constructEvent`. HMAC with an empty key still "verifies", so an unset secret made the endpoint forgeable (anyone could POST a fake verified event and mark any user_id as identity-verified). Fixed to return 503 if the secret env var is unset.

**Why:** External security audit (2026-07-05) flagged both as fail-open patterns; Niakofa's convention elsewhere is fail-closed for all trust/verification gates.

**How to apply:** Any new admin/health status check or webhook signature verification in this codebase must default to the "disabled/rejected" state when config is missing, never "enabled/accepted".
