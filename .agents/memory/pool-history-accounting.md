---
name: Pool History accounting
description: Durable product decisions for Community Pool contributor History and sponsor attribution.
---

Community Pool accounting remains authoritative in the pool ledger and
financial-events records. Personal History is a linked projection intended for
member-facing activity, not a replacement ledger.

**Why:** Contributors need to see what they funded, while Stripe fees, Climate
deductions, net settlement, currency, and availability must remain auditable
without misleading users by presenting net as the contribution headline.

**How to apply:** Use the gross contribution for the History amount and keep
the settlement breakdown in metadata. Link by pool ledger ID, and update the
existing History projection when a settlement adjustment arrives instead of
creating a duplicate. Government sponsor funds should not be attributed to the
administrator who recorded them as a personal contribution.