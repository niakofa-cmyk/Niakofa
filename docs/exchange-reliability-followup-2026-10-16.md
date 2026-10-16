# Exchange and Media Studio reliability follow-up

Date: 2026-10-16. This follows the attached errors/risks review, read in full.
It supplements—not replaces—the independent production browser evidence in
`production-browser-acceptance-2026-10-16.md`.

## Approved A/B/C matrix

The production UI sign-in and self-profile checks on October 16 independently
verified distinct active, approved accounts:

- **A:** admin; listing owner / seller / publisher.
- **B:** helper; same assigned positive Community as A; buyer / reader.
- **C:** approved account in a different assigned positive Community;
  cross-community privacy viewer.

The owner reconfirmed this mapping for this work. There is no D. Do not change
memberships, approvals or roles to manufacture a pass. Credential names are
`MEDIA_CERT_A/B/C_EMAIL` and `MEDIA_CERT_A/B/C_PASSWORD`; values, account IDs,
emails and authenticated browser states must never enter source or reports.
The canonical Godfather document and deployed-acceptance memory preserve this
mapping without private account details. A later run must recheck live identity.

## Review item disposition

| Review item | Action / evidence | Remaining limit |
| --- | --- | --- |
| Approved production accounts | Independently verified and documented above | Recheck identity at the next authorized run |
| Production CSS/JS rate-limit crash | Earlier local correction restricts the traffic limiter to `/api` after authentication; regression retained in this release | Requires a serving-commit check and production navigation after release |
| No owner-facing history removal | Added explicit per-owner/per-participant **Remove from my history** controls, server persistence, confirmation and state/ownership guards | This is private removal, not physical deletion of shared records or media |
| Retry migration / unique index | Existing read-only catalog query validates the live index definition, not just its name; audit additionally requires the `0161` ledger row | Production remains blocked until a matching authorized connection is supplied |
| Saved connection points elsewhere | Reconfirmed the existing application Postgres proxy with Railway; added mandatory exact host AND port checks before connecting | Saved audit credential still fails `UNCONFIRMED_DATABASE_TARGET`; no SQL sent |
| Ledger permission errors | Audit explicitly distinguishes permission denied/missing from verified ledger rows; all failures exit nonzero | SELECT access to the migration ledger is required |
| Media persistence / processing / reload | Existing real PostgreSQL/Redis/BullMQ/FFmpeg browser suite exercises ready media and reload/back navigation | Local results do not certify production object storage |
| Mandatory realistic media regression | Added a dedicated push/PR/manual CI workflow with PostgreSQL, Redis, FFmpeg and a real browser | Repository workflow write permission and a green remote run must be verified separately |
| Tracked staging PNG | Moved the reviewed synthetic PNG to documented `e2e/fixtures/`; runtime upload paths remain ignored for Git and deployment | Reference input only; never treat it as production media |
| Media observability | Added structured upload-start/completed, processing-start/completed and publication outcome events, correlated by asset/job/story/request IDs | Actual visible playback is verified by browser assertions, not inferred from a server log |
| Explicit lifecycle feedback | Existing requested/accepted/declined/cancelled/expired/completed and one-participant confirmation labels retained; private removal restricted to finished records | Physical-device interaction remains uncertified |
| Failed/abandoned media cleanup | Existing owner-scoped deletion, processing/deletion race and upload-failure regression retained; disposable runtime suites clean their exact fixtures | Production orphan-object reconciliation is still not certified |
| Actual iOS Safari / Android Chrome | No physical devices are available in this workspace | Desktop Chromium/390px layout checks are not physical-device evidence |

## History removal contract

Migration `0198_exchange_private_history.sql` adds independent private removal
timestamps. It does not alter existing rows' content, delete records, cascade
away another person's history, or delete storage objects.

- `POST /api/community/exchange/listings/:id/remove-history`: approved owner only;
  listing must be withdrawn, completed or archived, with no active pickups.
- `POST /api/community/exchange/pickup-requests/:id/remove-history`: approved
  participant only; pickup must be completed, cancelled, declined or expired,
  with no open dispute.
- Unauthorized record probes return 404; active-record removal returns 409.
- Repeated removal succeeds without deleting anything.
- My posts and coordination feeds reconstruct private removal from the server
  after reload. Renewing an archived listing restores its owner-history visibility.
- Active coordination and open disputes stay visible even if historical removal
  timestamps exist.
- Confirmation explicitly discloses that shared records and media remain stored.

**Production fixture policy is still separate.** Private removal does not meet an
exact-record deletion requirement. A production A/B lifecycle run that leaves
shared history needs explicit permission to retain those disposable records or an
approved exact-record cleanup procedure. No existing user records, production
settings, memberships, migrations or media have been changed for acceptance.

## Confirmed application database audit

Railway inventory on this run again showed the existing **Postgres** proxy:
`ballast.proxy.rlwy.net:48530`, forwarding to PostgreSQL port 5432. This is the
operator-confirmed application target, not the separate PostGIS service.

The existing read-only secret was tested only through the new preconnection
guard. It failed target comparison and stopped before any socket or SQL query.
No secret was printed, modified, copied to another endpoint, or committed.

The audit can use a dedicated `EXCHANGE_AUDIT_DATABASE_URL` secret without
changing the development `DATABASE_URL` or repurposing a financial-audit
connection. After supplying a matching authorized read-only connection:

```bash
EXCHANGE_PRODUCTION_SCHEMA_AUDIT=1 \
EXCHANGE_AUDIT_EXPECTED_HOST=ballast.proxy.rlwy.net \
EXCHANGE_AUDIT_EXPECTED_PORT=48530 \
node scripts/exchange-schema-audit.mjs
```

The script uses a read-only transaction, bounded connection/query/lock timeouts,
checks the production role for write/superuser privileges, rejects driver endpoint
overrides, and emits only safe status/catalog data. It verifies the expected
Exchange schema/index definitions and ledger evidence for both retry migration
`0161` and private-history migration `0198`. It never repairs schema or ledger.
Production target mismatch is not evidence that a migration is missing.

## Verification

| Check | Result |
| --- | --- |
| Fresh isolated PostgreSQL migration + real API Exchange lifecycle, including per-participant history removal | PASS; CLI exits normally and cleans its isolated cluster |
| Isolated schema/index/migration audit | PASS; retry and private-history ledger entries and all three history columns verified |
| API security, production-readiness source contracts and endpoint-guard tests | 22 passed |
| Focused API limiter/upload-failure/deletion/processing tests | 4 suites, 45 tests passed |
| Resumable Exchange media client regressions | 4 passed |
| Real disposable media runtime + browser suite | 6 integration tests passed; 2 Studio browser tests passed, plus companion profile/Spark matrix |
| Workspace build references + API/web TypeScript | PASS |
| Touched-source strict lint; workflow/OpenAPI YAML parsing; diff whitespace | PASS |
| Authenticated manual-area browser diagnosis | PASS; saves coarse area, closes dialog, stays on the same route without a page reload |
| Corrected local Exchange browser lifecycle/history regression | Pending final result |
| Production Exchange schema / migration ledger | BLOCKED before connection: saved read-only connection does not match approved target |
| Physical iOS Safari / Android Chrome | BLOCKED: devices unavailable |

The focused browser test initially checked first-visit dialog visibility before
the lazy Exchange screen had mounted. It could skip area entry and then fail
behind the open dialog. The harness now waits for either the dialog or board,
asserts the actual entered value and closed dialog, and handles the buyer's
first visit too. Direct authenticated browser diagnosis confirmed that the
application's manual-area control itself saves correctly.

The managed API restart initially left an identified older local listener on
8080. Only those stale local API children were stopped. The corrected restart
logged a clean listen and worker readiness; `/api/version` reported start time
`2026-10-16T09:48:19.172Z`. Neither action affected production.

A passed check is local unless explicitly labeled production. A pushed commit
is not a passing remote CI run or production-browser certification.
