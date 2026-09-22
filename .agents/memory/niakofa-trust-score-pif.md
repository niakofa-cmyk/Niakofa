---
name: Niakofa Trust Score PIF Repayment Boost
description: Trust score increments for pay-it-forward repayment events; county pledge subsidization route.
---

## Rule
Trust score is boosted on PIF repayment events in requests.ts `POST /requests/:id/pay-it-forward-repayment`:
- `+5` on full repayment (pledge_status → 'repaid')
- `+2` on reinstatement from defaulted (pledge_status 'defaulted' → 'active')

County government sponsors can forgive (subsidize) a pledge via `POST /gov-sponsors/:id/subsidize-pledge` (admin-only):
- Validates payment_type='pay_it_forward', pledge_status in (active, defaulted)
- Sets pledge_status='forgiven', trust_score +5
- Records a pool contribution from the sponsor
- Returns `{ success, request_id, trust_score_bonus, pool_contribution_recorded }`

**Why:** Rewards behavior that keeps the PIF loop healthy; county subsidy is an admin action that shouldn't be self-served.

**How to apply:** Boost SQL is a bare `SET trust_score = trust_score + N WHERE id = userId`; no cap applied (trust caps are enforced by the ratings system at the 80 threshold for tier advancement).
