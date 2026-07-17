---
name: Niakofa pledge lifecycle (defaults, reminders, dedup)
description: Consolidated pledge/PIF lifecycle rules — auto-default, reminder dedup, and repayment credit paths must all stay in sync between scheduler.ts and pledge-worker.ts.
---
- **Single owner for auto-default:** `scheduler.ts::processPledgeDefaults` is the sole 90-day auto-default worker (an earlier duplicate in `pledge-worker.ts` Step 6 was removed). Eligibility must exclude hardship-flagged pledges and use an atomic `WHERE pledge_status='active'` to prevent double-penalty.
- **Reminder dedup:** `last_reminder_sent_at` column prevents re-sends within 24h. This gate must be applied in **both** `scheduler.ts` and `pledge-worker.ts` step 4 — if only one path checks it, the other bypasses dedup and double-sends.
- **Repayment atomicity:** pledge repayment credit must use a SQL `INCREMENT` (not read-compute-write) to avoid lost updates under concurrent payments.
- **Trust score credit paths (must all be covered):** +5 on full PIF repayment; +2 on defaulted→active reinstatement; +2 via Stripe webhook on voluntary repayment; county subsidize-pledge (admin-only) grants +5 + pool contribution.
- **Why:** two workers historically implemented "the same" pledge-default/reminder logic independently and drifted — one path bypassing the other's dedup/eligibility check is the recurring failure mode here.
- **How to apply:** any change to pledge eligibility, dedup, or credit logic must be mirrored in every worker that touches pledges, not just the one being edited.
- **Auto-default email lookup:** the 90-day auto-default (Step 6, above) must look up the requester's email via a DB query before its fire-and-forget mailer call — `req.requester_id` alone is not enough to send the notification.
