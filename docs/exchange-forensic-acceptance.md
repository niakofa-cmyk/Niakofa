# Exchange forensic implementation and acceptance

Review date: 2026-10-14. The complete 415-line supplied forensic review was read.
This is a verification-first implementation, not a checkout, escrow, or paid
marketplace expansion. Offers/Needs and goods/services retain the community-help
model and the existing Niakofa/Nia boundary.

## Verified corrections

- Missing Exchange base tables are no longer silently recreated after dependent
  migrations have already run. Such a database requires a reviewed restore or
  corrective migration; startup stops before deleting its Exchange ledger entry.
  Initial base-only interrupted installs can still safely replay the base file.
- Schema startup checks now inspect the active-request index's uniqueness, keys,
  validity and status predicate, not just its name. PostGIS installations must
  have the distinct geography GiST index. An empty validation result is fatal.
  The old and current pickup-index names in migration 0161 are intentional;
  there was no index-name mismatch to “fix.”
- Nearby discovery waits for a successful authenticated server location update.
  Permission/API failures do not switch the feed to an unsaved location.
- Exchange feeds, details and Messages pickup controls refresh when focused or
  visible every 20 seconds. Unsent coordination form content is retained.
  Stale pagination responses are discarded and repeated IDs are deduplicated.
- Owners can explicitly withdraw active listings from the detail dialog, with a
  confirmation explaining visibility and retained history. A concurrent
  withdrawal/state change returns 409, rather than serializing an absent row.
- `/community?tab=exchange` selects Exchange, and Messages reads the reactive
  query string rather than Wouter's pathname alone. Notification links select
  the other actual pickup participant, not the notification recipient themselves.
- Development loopback CORS works even when a production allowlist is present.
  This exception never applies in production.
- Account deletion rejects live requested/accepted Exchange coordination with
  an actionable 409. After cancellation/completion, authored listings are removed
  from discovery and personal listing/coordination text and coordinates are
  scrubbed while terminal history/timestamps remain. Existing Spark/media
  tombstone cleanup, token revocation and 30-day account retention remain intact.
  New listings/requests and deletion share sorted per-account transaction locks;
  a deleting account cannot concurrently gain a new coordination request.

## Reproducible local checks

```sh
pnpm test:exchange-migrations
bash scripts/start-local-postgres.sh node scripts/exchange-release-gate.mjs
bash scripts/start-local-postgres.sh env DATABASE_SSL=false node scripts/exchange-schema-audit.mjs
pnpm --filter @workspace/api-server typecheck
pnpm --filter @workspace/pay-it-forward typecheck
node scripts/src/check-app-ai-boundary.js
```

Local browser regression (use the current workflow's actual web port and installed
Chromium executable):

```sh
bash scripts/start-local-postgres.sh env RUN_EXCHANGE_LOCAL_E2E=1 \
  PLAYWRIGHT_BASE_URL=http://127.0.0.1:18848 \
  PLAYWRIGHT_EXECUTABLE_PATH=/path/to/installed/chromium \
  pnpm exec playwright test e2e/exchange-local-lifecycle.spec.ts --workers=1
```

The browser test signs disposable local approved accounts inside the test process,
uses real API/database responses, refuses remote database/preview hosts, cleans
only its fixture IDs, and disables traces/video/auth-state output. It is opt-in
and does not change production data. The migration suite creates/removes a
UUID-named localhost-only database, applies the real complete migration sequence,
and tests fresh install, repeat startup, malformed indexes, missing columns,
missing-table failure and safe initial recovery.

## Acceptance matrix

Final local verification: 39 privacy/readiness/migration checks, 43 focused API
unit/contract tests, actual PostgreSQL spatial/lifecycle/push integration, API/web
typechecks, changed-file lint, and the App/AI boundary check passed. The focused
authenticated browser retest passed (1 test): query-route Exchange navigation,
request-to-Messages controls, acceptance, both completion timestamps, the
canonical peer notification, owner withdrawal and zero remaining fixture rows.
Earlier browser failures were investigated and corrected, not counted as passes.

| Gate | Local evidence | Production/device status |
| --- | --- | --- |
| Fresh install and existing database startup | Real migrations on disposable PostgreSQL; repeat startup and safe/fail-closed recovery | Production ledger/schema SQL still needs approved read-only operator evidence |
| Authenticated listing journey | Real API tests for all four Offer/Need × goods/services combinations, persistence, owner binding, filtering, pagination, edit and withdrawal | Exact-commit two-account production journey not run |
| Pickup lifecycle | Real routers/database: request, authorization, duplicate rejection, competing acceptance, cancellation/retry, expiry/recovery, safety holds, dispute release and two-party completion | Requires separately approved disposable production accounts |
| Privacy/moderation | Address/contact/GPS rejection; coordinate-free serialization; held-listing discovery/detail/write rejection; durable report/review lifecycle | Real-device permissions and production moderation acceptance remain separate gates |
| Geographic performance | 20,000 disposable listings; actual migrated index shown by EXPLAIN; Haversine benchmark, 25 iterations, p50 1.24ms/p95 2.76ms in the recorded local run | No claim of production latency or actual PostGIS execution on this non-PostGIS workspace |
| Notifications | Actual DB creation/accept/confirmation/completion/expiry assertions, repeated-action counts and correct participant URLs; push integration and digest/preference source contracts | External delivery and weekly digest retry behavior not certified in production |
| Account deletion | Actual self-delete block, cancellation then anonymization, terminal history retention, token rejection and simultaneous deletion/request test | Production deletion/media-object purge requires approved disposable fixtures; never exercised on existing accounts |
| Nia separation | App/AI boundary checks; real Exchange lifecycle with Nia URL pinned to unavailable loopback | Provider presence is not evidence; no production Nia configuration changes |
| Browser/mobile | Local UI-to-API-to-DB lifecycle tests use three runtime-created approved disposable accounts and clean them up. The buyer journey uses touch-enabled Chromium mobile emulation at 390×844, tests manual-area persistence plus granted/denied geolocation, taps listing/pickup controls, and asserts no horizontal overflow. | Chromium emulation is not physical iOS Safari or Android Chrome certification; the workspace has no WebKit runtime, device simulator, or attached phones |
| Release identity | Repository push is checked against the exact GitHub HEAD | Published readiness must serve that same application commit before release acceptance |

## Production observation and operator gates

At the read-only observation, `https://niakofa.com/api/healthz` and `/api/readiness`
were healthy, serving `3643a75cce8f8843e2262026ea90d6f8a37c2c1b`, not the newer
repository commit. The newer Railway build ended with
`build daemon … context canceled` after successful web/Nia build output; there
was no runtime migration failure in that attempt. This does not justify a
production table repair or weakened schema validation.

No production tables, listings, pickups, media, settings, flags, credentials or
deployment configuration were changed for this review. A GitHub push may trigger
the repository's existing automatic Railway build; it is not deployment proof.

For an explicitly approved schema inspection, run
`scripts/exchange-schema-audit.mjs` with the operator's read-only database
connection and `EXCHANGE_PRODUCTION_SCHEMA_AUDIT=1`. It executes a read-only
transaction and prints only schema/ledger metadata, never the connection string.
Do not substitute the development database for this evidence.

Release requires: exact served-commit parity; successful production schema
inspection; approved two-account production lifecycle and cleanup evidence;
actual PostGIS plan/performance evidence where installed; external notification
delivery evidence; and physical iOS/Android checks. Until then the correct status
is locally verified, not production/device certified.
