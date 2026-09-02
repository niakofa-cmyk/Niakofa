# Niakofa production gates — 2026-09-02

This runbook is the controlled gate for Community Pool financial integrity, the standalone Legacy RPG bridge, and the first two-community rollout.

## Gate 1 — Community Pool financial preflight

Run against the actual target database with a read-only transaction:

```sh
DATABASE_URL='postgres://...' ./scripts/run-community-pool-preflight.sh
```

The underlying SQL is intentionally read-only. Existing accounting mismatches, invalid amounts, unverified available/paid-out rows, missing payout evidence, duplicate payout audit rows, or unsafe conversion values are blockers.

## Gate 2 — Apply 0118 only after Gate 1 is clean

Take the normal database snapshot/backup first, then:

```sh
pnpm --filter @workspace/db run migrate
```

Immediately rerun Gate 1. Confirm `amount` columns are exact `numeric(12,2)` and that the new financial constraints are present. Never bypass the migration with a forced schema push.

## Gate 3 — Standalone Legacy RPG origin/proxy

Set the standalone RPG build variable:

```sh
VITE_NIAKOFA_API_ORIGIN=https://<production-niakofa-origin>
```

For a separate origin, the Niakofa API production `ALLOWED_ORIGIN` must include the exact RPG origin. If a reverse proxy serves the RPG beneath the Niakofa origin, the RPG may use same-origin `/api` instead.

Run:

```sh
NIAKOFA_API_ORIGIN=https://<production-niakofa-origin> \
LEGACY_RPG_ORIGIN=https://<production-rpg-origin> \
pnpm run production-gate
```

Then perform one authenticated launch from the real production domain. The expected sequence is:

1. Authenticated browser calls `POST /api/legacy/launch-ticket`.
2. API returns a short-lived opaque ticket.
3. Browser navigates to the RPG origin with the ticket.
4. RPG immediately exchanges it at `GET /api/legacy/launch-context` using the configured platform API origin.
5. Browser URL is scrubbed immediately.
6. A second exchange of the same ticket returns HTTP 410.
7. No raw platform session credential or family biography is present in the ticket or exchange response.

## Gate 4 — production-like community matrix

Use dedicated non-production or explicitly approved production test identities. Never use real customer accounts.

| Scenario | Expected result |
|---|---|
| Tarrant user → Tarrant Pool | allowed; ledger/settlement remains Tarrant-scoped |
| Kansas City user → Kansas City Pool | allowed; ledger/settlement remains Kansas City-scoped |
| Tarrant helper → Tarrant payout | allowed only against Tarrant scope |
| Kansas City helper → Kansas City payout | allowed only against Kansas City scope |
| Tarrant sponsor → Tarrant request | allowed |
| Tarrant sponsor → Kansas City request | **blocked** |
| Anonymous donation → General Fund | recorded as General Fund, never silently assigned to a community |
| Unresolved community → payout/claim | **blocked / fail closed** |

For every allowed case, verify the resulting ledger/financial event has the expected `community_id`/hub scope. For every blocked case, verify no financial event or payout debit was created.

## Gate 5 — architecture freeze and rollout

Freeze the current boundaries only after Gates 1–4 pass. Then:

- redirect the Legacy world entry point to the standalone RPG;
- monitor one release cycle;
- deprecate the old Legacy runtime/API only after fallback is no longer needed;
- keep platform-wide Pool transparency explicitly separate from community-scoped accounting;
- begin onboarding the next community with the same isolation matrix.

### Important limitation

The repository automation can validate network reachability and CORS, but it cannot truthfully claim that the actual production database preflight, Stripe settlement, or authenticated cross-community matrix passed without access to the deployment's database and dedicated test identities. Those checks remain operator-run gates.
