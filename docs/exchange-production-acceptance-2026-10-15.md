# Exchange production acceptance — 2026-10-15 America/Chicago

## Verdict

**BLOCKED — not production or physical-device certified.**

Both supplied forensic-review documents were read in full (776 and 662 lines).
Their historical deployment and file-history claims were checked against the
current repository and read-only Railway/HTTP evidence. No production listing,
pickup request, account, media, configuration, feature flag, or database object
was created, modified, or deleted during this acceptance attempt.

Local regression results below do not substitute for the requested production
workflow on physical iOS Safari and Android Chrome.

## Release identity and read-only preflight

Checked on 2026-10-15 America/Chicago (2026-10-16 UTC):

| Check | Result | Evidence |
| --- | --- | --- |
| Canonical production origin | PASS | Railway's current custom-domain configuration identifies `https://niakofa.com`, targeting API port 8080. This workspace has no separate Replit-published deployment. |
| Railway API deployment | PASS | `45c76023-566e-4f3b-9af6-10744ec60dd0`, status `SUCCESS`, created `2026-10-16T02:08:49.624Z`; environment inventory has no staged changes. |
| Exact served application commit | PASS | `/api/version`, `/api/healthz`, and `/api/readiness` report `004b6b36bab8477c9791ff792c942d2501987924`, matching repository HEAD and Railway deployment metadata. |
| Runtime | OBSERVED | Application reports Node `v22.23.3`, started `2026-10-16T02:12:06.866Z`. This is not a device/browser version. |
| Public health | PASS | `/api/healthz`: HTTP 200, `status=ok`, `db=connected`. |
| Platform readiness | PASS | `/api/readiness`: HTTP 200, `ready=true`; database, Redis, storage and media worker report ready. These readiness responses do not independently certify Exchange schema or user journeys. |
| Media activation | OBSERVED ONLY | Existing production media flag is true. It was not changed; readiness is not approval for media rollout or mutation. |
| Production account authorization | BLOCKED | No current validated production A/D/C role mapping and authenticated disposable-account approval evidence. |
| Live Exchange schema/ledger | BLOCKED | The available read-only connection did not match the confirmed application's existing database proxy. Guard returned `UNCONFIRMED_DATABASE_TARGET` before connecting; no SQL was sent and no credential value was printed. |
| Physical devices | BLOCKED | No authorized physical iPhone/Safari or Android/Chrome session was supplied or attached. |

Only public version/health/readiness HTTP requests and read-only Railway
metadata calls were made. No authenticated production browser journey was
started.

## Account gate

`docs/CROSS_COMMUNITY_MEDIA_TEST_MATRIX.md` describes **synthetic local A/B/C
fixtures**, not reusable production logins. The attached review proposes A as
seller, D as the discovery/pickup participant, and C as an isolation viewer, but
requires those assignments to be checked against the actual matrix. D must not
silently be treated as B.

Fresh offline validation, without production authentication requests:

| Candidate input | Result | Limitation |
| --- | --- | --- |
| Saved A state | INVALID | Sanitized validator error: `storage state input is not valid JSON.` |
| Saved B state | SHAPE VALID | Does not establish current sign-in, approval, active status, disposable-test authorization, community membership, or the D role. |
| Saved C state | MISSING | No `USER_C_STATE_JSON` secret. |
| Saved D state | MISSING | No `USER_D_STATE_JSON` secret. |

Existing media-certification credential names do not prove Exchange role mapping
or renewed authorization. No credentials, session tokens, user identities, or
state contents are included in this report. Temporary offline-validation state
files were private, outside the checkout, and removed after validation.

Before writes, an authorized operator must confirm the current production
disposable accounts and A/D/C assignments, and supply usable private states
through the secure path. Then preflight must independently verify active,
approved identities and the intended same/different community relationships.
Do not change memberships to manufacture a passing test.

### Requested repository follow-up: approved A/D/C accounts

The existing repository was checked before requesting replacement account
assignments. At the follow-up, repository HEAD was
`72bc38addad2ac5cdc6d7c6600b358681bc40601`; this is a source-inspection revision,
not a newly verified production deployment.

| Label | What the repository actually establishes |
| --- | --- |
| A | The local matrix's author/publisher is inserted approved into the author community. Historical production acceptance also records an approved A session on 2026-10-04; identical labels alone do not bind those two identities. |
| B | The local matrix's reader is inserted approved into A's local community. Existing two-state media tooling uses A/B labels; it does not define an Exchange D identity. |
| C | The local matrix's reader is inserted approved into a different local community. Historical production acceptance records A/C in different Communities on 2026-10-04, with Hubs 1 and 18. Hub IDs are not current community IDs. |
| D | No account/role definition or approved production mapping was found in the searched tracked canonical source, runners, or acceptance documents, apart from this report's unresolved A/D/C proposal. |

Sources: `docs/CROSS_COMMUNITY_MEDIA_TEST_MATRIX.md`,
`artifacts/api-server/src/__tests__/community-media-api-runtime.integration.test.ts`,
`docs/PRODUCTION_ACCEPTANCE_MATRIX.md`, and
`ops/build-media-certification-states.mjs`.

The matrix now records this lookup explicitly. No users were created, approved,
relabelled, logged in, or moved between communities for this follow-up. The
supplied updated review is review text, not live schema output or physical-device
evidence. Existing source/CI corrections were retained rather than repeated.
The remaining account question is whether D means the documented B role or a
separate approved production identity. Current authentication and the other
production/device gates remain unverified.

## Requested production workflow matrix

No physical device model, OS version, Safari version, or Chrome version is
recorded because no physical device was used. No production screenshots were
captured; a login page or local screenshot would not prove these scenarios.

| Scenario | Physical iOS Safari | Physical Android Chrome | Blocking prerequisite / required evidence |
| --- | --- | --- | --- |
| Sign in and open Exchange | BLOCKED | BLOCKED | Verified authorized production identity and device session |
| Create and publish controlled test listing | BLOCKED | BLOCKED | Account/device gate; record exact fixture ID and publication response |
| Refresh and verify listing persists | BLOCKED | BLOCKED | Controlled published listing; UI and server-state evidence |
| Navigate away/back and reopen direct listing link | BLOCKED | BLOCKED | Same fixture and exact served commit |
| Second approved participant discovers listing | BLOCKED | BLOCKED | Verified A/D roles, permitted location/discovery scope |
| Create pickup request | BLOCKED | BLOCKED | Authorized second participant and controlled active listing |
| Seller accepts request | BLOCKED | BLOCKED | Controlled request; participant-only action evidence |
| Seller declines and buyer retries where permitted | BLOCKED | BLOCKED | Separate controlled branch; no duplicate active request |
| Both participants see correct request status after refresh | BLOCKED | BLOCKED | Seller/buyer UI and authoritative status evidence |
| Each participant confirms completion | BLOCKED | BLOCKED | First confirmation remains accepted; second completes request/listing |
| Verify final state after reload/navigation | BLOCKED | BLOCKED | Matching terminal status and timestamps for both participants |
| Unauthorized reads/writes and private-location denial | BLOCKED | BLOCKED | Controlled fixture plus verified unauthorized C; no testing arbitrary users' records |
| Simulated network interruption and recovery | BLOCKED | BLOCKED | Physical device journey, no false success, duplicate creation, or lost pending action |
| Owner-scoped fixture cleanup and reconciliation | NOT APPLICABLE | NOT APPLICABLE | No production fixtures were created in this attempt |

Listing discovery and Community Spark isolation are different policies. Existing
local acceptance documents say active approved Exchange **listings** can be
discovered across communities within the chosen area; community-scoped Sparks
and private pickup coordination remain restricted. Do not require C's public
listing discovery to fail as a substitute for checking restricted content,
participant-only actions, and private fields.

## Pickup-request uniqueness: source verified, live schema blocked

The review's apparent index-name mismatch is resolved by the actual migration
sequence:

1. `0159_exchange_local_pickup.sql` creates the original unconditional unique
   `(listing_id, buyer_id)` index.
2. `0161_exchange_pickup_retry.sql` drops both old/current names and creates
   `exchange_pickup_requests_one_active_per_buyer_listing_idx` with
   `WHERE status IN ('requested', 'accepted')`.
3. All subsequent migration references were searched; no later migration
   replaces this active-request uniqueness rule.
4. `lib/db/scripts/migration-recovery.mjs` validates the actual table, index
   validity/readiness, uniqueness, exact two keys, and status predicate, not just
   the index name.

No validator was weakened and no production repair or migration was run.
The real full migration sequence and malformed-index recovery tests passed on
a UUID-named disposable **local** PostgreSQL database, which the suite removed.
This does not establish the live production index or migration-ledger contents.

To unblock the live check, use an approved read-only session on the confirmed
application database (not the separately named PostGIS service), with permission
to inspect Exchange schema and the migration ledger. In that approved operator
environment, with its connection already configured privately:

```sh
EXCHANGE_PRODUCTION_SCHEMA_AUDIT=1 node scripts/exchange-schema-audit.mjs
```

The existing script uses a read-only transaction and emits schema/ledger metadata.
Provide sanitized output, never a connection string. A missing grant or wrong
target is blocked evidence, not proof that an index or migration is absent.

## Historical thumbnail review and upload hygiene

The supplied review misread the file's Git status:

- `023879c0` added the 2,387-byte
  `artifacts/api-server/uploads/media-assets/1/thumbnail.jpg` during local media
  verification.
- `9e8ab5ce` **deleted** it. It is absent from current HEAD.
- The historical JPEG was extracted only to `/tmp` and visually reviewed:
  a 320×240 synthetic teal background/navy rectangle, with no people, personal
  text, addresses, or identifying content visible.
- Segment inspection found no EXIF/XMP APP1 or IPTC APP13 segment. FFprobe showed
  no format tags; the JPEG software comment identifies Lavc.
- This supports a sanitized synthetic-verification origin; no separate
  fixture-intent declaration was found. No history purge or claim about unrelated
  user media was made.

Workspace changes now ignore the runtime uploads directory in `.gitignore` and
`.replitignore`. Ignore rules do not retroactively untrack files: one pre-existing
tracked staging PNG remains, visually reviewed as the same synthetic graphic.
It was not deleted or represented as real user content. Runtime media must not
be added as source fixtures in future.

## CI fix and checks executed

The missing CI wiring was confirmed and corrected in this workspace:

- Added frontend command `test:exchange-listing-media`.
- Added an explicit CI step, **Exchange listing media upload and
  interrupted-chunk retry**, invoking that command.
- The test exercises the client with mocked HTTP/XHR; it is not a real-device or
  production storage acceptance test.

| Command/check | Result |
| --- | --- |
| Frontend `npm run test:exchange-listing-media` | PASS — 1 test |
| `node --test lib/db/scripts/migration-recovery.test.mjs` | PASS — 7 tests |
| Local wrapper with `DISPOSABLE_EXCHANGE_MIGRATION_TEST=1 node --test lib/db/scripts/exchange-migrations.integration.test.mjs` | PASS — 8 reported tests, including real full migration sequence, repeat startup, index semantics and fail-closed recovery |
| CI command/package-target assertion | PASS |
| Runtime-upload ignore assertions and `git check-ignore --no-index` | PASS |
| `git diff --check` | PASS |

The migration suite's local 20,000-row Haversine benchmark is not a production
PostGIS performance result.

At the initial observation, the CI/ignore fixes were uncommitted workspace
changes and were not part of deployed
`004b6b36bab8477c9791ff792c942d2501987924`. The later repository account lookup
confirmed the CI command and dedicated package script are present in source at
`72bc38addad2ac5cdc6d7c6600b358681bc40601`. That lookup did not verify a GitHub CI
run or refresh deployment identity. This report does not claim the new CI step
has already passed on GitHub or that the later source revision is deployed.

## Unblock and completion rule

Required before the production workflow can start:

1. Confirm current approved, active disposable production A/D/C roles and their
   expected community relationships; provide usable private authentication states
   through the secure path, never chat.
2. Supply authorized physical iOS Safari and Android Chrome sessions, or have an
   operator run both phones and return sanitized evidence.
3. Supply approved live schema/ledger output or a verified read-only connection
   to the actual application database.

For each physical-device run, record device/OS/browser versions, full served SHA
before and after the suite, per-step results, fixture IDs, sanitized screenshots
or errors, and cleanup/reconciliation results. Fix any observed critical failure
and rerun the complete suite only against the explicitly verified deployed
revision and authorized fixtures. Do not publish local fixes, toggle flags,
approve media, change community memberships, or repair production tables merely
to make acceptance pass.

**Certification remains blocked until these gates and every critical workflow
step have evidence.**
