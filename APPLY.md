# Apply Community Pool Financial Integrity

This change is migration-first and intentionally fails closed on existing
financial data that does not reconcile. Apply it in a controlled environment
with database access and the current application checkout.

## Preflight

Run the read-only checks against the target database:

```sh
psql "$DATABASE_URL" -X -f scripts/verify-community-pool-financial-integrity.sql
```

Review every result set. Existing accounting mismatches, negative amounts,
unverified available/paid-out rows, missing paid-out evidence, duplicate payout
audit rows, or values that cannot safely convert from `real` to `numeric(12,2)`
must be resolved through the normal audited correction process before continuing.
Do not edit financial rows manually as part of deployment.

## Apply

1. Take the normal database backup/snapshot required by the environment.
2. Confirm the preflight is clean.
3. Apply the canonical idempotent migration runner:

   ```sh
   pnpm --filter @workspace/db run migrate
   ```

4. Run the preflight again and confirm the new constraints and exact numeric
   amount types are present.
5. Build and validate the API:

   ```sh
   pnpm --filter @workspace/api-server run typecheck
   pnpm --filter @workspace/api-server exec jest community-pool-claim-scope community-pool-financial-integrity
   ```

6. Restart the API and worker processes together, then verify the health and
   authenticated Community Pool settlement endpoints.

The migration converts both the signed pool ledger amount and pending minimum
amount to `numeric(12,2)` while preserving their dollar values. The ledger
remains append-only; no historical entry is deleted or rewritten.

## Recovery

If the migration fails, the canonical migration runner rolls back the
transaction and does not mark the file applied. Preserve the failure output,
fix the underlying data through an audited repair, rerun the read-only
preflight, and retry. Do not bypass the constraints with a forced schema push.