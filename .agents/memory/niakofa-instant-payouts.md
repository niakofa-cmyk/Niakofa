---
name: Niakofa Stripe Instant Payouts
description: Architecture for optional instant payouts on cashout; eligibility degradation pattern; response shape.
---

## Rule
Instant payouts are ALWAYS non-fatal. The Stripe transfer (wallet → Connect account) is committed first. If the instant payout fails (platform setting off, Connect account lacks capability, Stripe error), degrade to 'standard' silently — never roll back the transfer.

**Why:** The transfer already moved real money. Rolling it back for a payout-speed preference would wrongly remove funds.

**How to apply:**
1. Check `instant_payouts_enabled` system setting (OFF by default, migration 0049).
2. Retrieve Connect account to verify `instant_payouts_enabled` capability.
3. Attempt `stripe.payouts.create({ method:'instant' }, { stripeAccount })`.
4. Any failure → set `effectiveMethod = 'standard'`, log WARN, continue.
5. Response includes `payout_method` (what actually happened) and `payout_id` (null if standard).

Body field `method?: 'standard' | 'instant'` accepted by `POST /cashout`.
