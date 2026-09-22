---
name: Niakofa schema hardening & migration workflow
description: How DB schema constraints/FKs/timestamptz are added, and the civic_suggestions status vocabulary gotcha.
---

## Migration workflow (non-obvious)
This repo does NOT rely on `drizzle-kit migrate` for hardening changes. The chain is:
- **Source of truth:** the Drizzle schema files in `lib/db/src/schema/`.
- **Dev + post-merge:** `pnpm --filter db push` (see `scripts/post-merge.sh`) reads the schema source directly and applies FKs, check constraints, indexes, and timestamptz automatically. No migration file needed for dev.
- **Production:** hand-written, idempotent SQL files in `lib/db/migrations/` applied via `psql`. These are NOT registered in `meta/_journal.json` (e.g. `0009_schema_hardening.sql` and `0011_forensic_schema_hardening.sql` are absent from the journal — this is intentional, matching the established pattern). Do not hand-edit `_journal.json` to add them; that requires a matching snapshot and corrupts drizzle state.

**How to apply:** when adding a constraint/FK/index, edit the schema source (push picks it up) AND write an idempotent `DO $$ ... IF NOT EXISTS ... $$` SQL migration mirroring it for prod psql. Backfill/clean offending rows inside the migration before adding constraints.

## civic_suggestions.status vocabulary
Valid values are `'pending' | 'approved' | 'dismissed'` — **NOT** `'rejected'`. The canonical list lives in `validStatuses` in `artifacts/api-server/src/routes/civic.ts` (the review route). Any DB check constraint MUST match it, or `PATCH /civic/suggestions/:id/review` with `dismissed` fails the constraint.
**Why:** a forensic-fix check constraint initially used `'rejected'` and would have broken the live review route.

## getTrustTier verified-tier anti-spam rule
`lib/trust-tiers/src/index.ts` "verified" tier is `(helpCount >= 5 && trustScore >= 50) || trustScore >= 85`. The `&& trustScore >= 50` floor stops a bad actor from grinding to verified via 5 low-quality helps while their rating-driven trust score sits below the neutral default (50). The `|| trustScore >= 85` keeps a high-trust path open.
