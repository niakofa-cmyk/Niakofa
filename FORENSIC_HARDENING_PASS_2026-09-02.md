# Forensic hardening pass — 2026-09-02

Audited commit: 4a99abe16ee27c03698efe1f06cb33e9452b7004

## Confirmed strengths
- Stripe webhook signature verification and event idempotency are implemented.
- Community Pool financial events reconcile gross, Stripe fee, Climate contribution, and net.
- Settlement transitions separate verification, availability, and operator payout confirmation.
- Payout confirmation uses a database row lock and terminal audit uniqueness.
- Admin payout route requires authentication and admin authorization.

## Corrective findings
1. **Preflight migration visibility gap — fixed in this branch**
   The financial-integrity preflight referenced only `0118_pool_pending_scope.sql` and omitted the actual financial-integrity migration from its migration-presence query. This branch checks both exact filenames and emits an explicit collision-status row.

2. **Duplicate migration sequence prefix — operational risk remains**
   Both `0118_pool_pending_scope.sql` and `0118_community_pool_financial_integrity.sql` exist. Whether this is safe depends on the migration runner's ordering and tracking semantics. Do not rename an already-applied production migration. Establish the production migration history first, then either leave both filenames intentionally tracked or introduce a new uniquely numbered migration for future changes.

3. **Production rate-limit degradation policy**
   The Redis rate-limit store falls back to process-local counters on Redis errors. This preserves availability but weakens globally consistent rate limiting during multi-instance outages. Treat this as a deliberate availability/security tradeoff and document which high-risk routes must fail closed.

4. **Live boundaries not provable from GitHub**
   Railway schema state, Stripe live-object state, webhook endpoint configuration, secret rotation, and actual CI/deployment execution require environment access.

## Required production gate
Before production-complete status:
1. Run the read-only Community Pool preflight against Railway.
2. Confirm both 0118 filenames' exact application status.
3. Confirm Stripe live Balance Transaction values for sampled pending, available, and paid_out events.
4. Execute an end-to-end test: PaymentIntent -> signed webhook -> event -> ledger -> History -> available -> operator payout -> audit.
5. Verify CI status on the deployed commit.
