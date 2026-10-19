---
name: Civic Stripe reconciliation
description: Product accounting and safety constraints for municipal budget receipts and helper payouts.
---

- Confirm municipal receipts only from validated, signed Stripe events. A browser PaymentIntent result is not confirmation.
- Cap request commitments at confirmed, settlement-available net receipts after actual Stripe fees and verified refund Balance Transactions.
- Keep the helper's existing Stripe transfer distinct from the later connected-account bank payout. Never create a second transfer to record funding, and only map payouts through exact Balance Transaction source IDs.
- Keep this work in development/test mode. Do not change live payment settings, production state, or deployment without explicit authorization.

**Why:** These are the user's stated accounting and release boundaries for Civic Partner Portal funding.

**How to apply:** Use these constraints for Civic Portal receipt, commitment, refund, transfer, and connected-payout changes; preserve unknown refund or payout attribution as pending/unmatched rather than estimating.
