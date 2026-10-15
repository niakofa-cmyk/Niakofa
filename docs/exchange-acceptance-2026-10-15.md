# Exchange workflow verification — 2026-10-15

## Result

**Functional local checks passed; keyboard acceptance failed. Production and
physical-device certification remain blocked, not passed.**

The tested local application reported commit
`301e3718ac6aafb2b0211b76bc7fafa6e4f0e227`. The new regression test and this
report are uncommitted workspace additions, not part of that served commit.
No runtime application code was changed or pushed.

## Executed checks

| Check | Result | Evidence and limit |
| --- | --- | --- |
| Coarse-area entry and persistence | Pass locally | Existing browser journey saves a manual area, reloads, and restores it. Expanded matrix enters the area with keyboard activation. |
| Browser location allowed and denied | Pass in Chromium emulation | Existing browser journey grants a synthetic location and saves it through the actual API; denied access sends no location PATCH and preserves manual entry. Not physical permission-prompt evidence. |
| Failed browser-location save | Pass locally | Expanded matrix fulfills only the location PATCH with a synthetic 503. The dialog stays open, an error appears, prior browser storage and database coordinates remain unchanged, and reload requests the previous coarse neighborhood without `nearby=true`. |
| Offer/Need × goods/services | Pass locally | All four combinations were published through the actual mobile-width three-step composer and returned active, approved listings. The API integration suite separately verifies validation, persistence, owner binding, and filtering. |
| Listing, detail, and composer layout | Pass for tested width | 390×844 touch-enabled Chromium: board, details, pickup form, and all composer steps had no horizontal overflow. This does not certify every viewport or physical keyboard behavior. |
| Pagination | Pass locally | Real API-backed UI loads 24 then 27 unique fixture cards; the Load more control disappears at the end. Extra rows are local fixture setup, not a bypass of production write limits. API keyset pagination also passed. |
| Unsent pickup draft after leaving/returning | Pass for tab/focus surrogate | A second browser tab is opened and focused, then the original page is restored and the app's focus refresh is invoked. Note, area, and proposed window remain unchanged after the real detail refresh. OS-level browser suspension/backgrounding remains untested. |
| Request → Messages, acceptance, peer refresh | Pass locally | Existing browser journeys navigate from Exchange to Messages, accept, refresh the other participant, and verify the server state. |
| Each participant's completion confirmation | Pass locally | First confirmation leaves the pickup accepted with one timestamp; the other confirmation completes the pickup and listing with both timestamps. |
| Withdrawal confirmation cancelled once | Pass locally | Expanded matrix dismisses the native confirmation, observes zero withdrawal writes, and verifies the listing is still active. |
| Withdrawal confirmed | Pass locally | One withdrawal write changes the fixture listing to withdrawn; a non-owner then receives 404 for its detail. |
| A/B same community; C different community | Pass locally | Three newly created approved disposable users have genuine assigned community rows: A/B share one and C has another. All use the same coarse area. |
| Expected Exchange visibility and authorization | Pass locally | Active approved **listings** are available to approved members in the chosen area, including C. This differs from community-scoped Exchange **Sparks**. C cannot edit/withdraw another owner's listing or see/accept A/B's pickup coordination. |
| Location privacy | Pass locally | Public listing responses omit raw latitude/longitude, lat/lng, and seller email. Existing API suite also rejects exact address/contact text and verifies coordinate-free projections. |
| Basic keyboard activation and Escape | Pass locally | Keyboard opens the composer, submits coarse-area entry, and closes dismissible dialogs with Escape. |
| Keyboard modal focus | **Fail** | Opening the composer by keyboard leaves focus outside it. Tabbing from its final action also leaves the `aria-modal` dialog. The expanded regression fails on these two assertions after completing the functional checks. |
| Selected-choice screen-reader semantics | Inspection finding | Composer Offer/Need and Goods/Services choices indicate selection through styling but expose neither pressed nor checked state. Actual VoiceOver/TalkBack output was not tested. |
| VoiceOver / TalkBack | Not available | No attached iOS/Android devices or these operating-system screen readers were available. |

## Runs

```sh
bash scripts/start-local-postgres.sh env USER_A_STATE= \
  RUN_EXCHANGE_LOCAL_E2E=1 \
  PLAYWRIGHT_BASE_URL=http://127.0.0.1:18848 \
  PLAYWRIGHT_EXECUTABLE_PATH=/repl/tools/bin/chromium \
  node_modules/.bin/playwright test e2e/exchange-local-lifecycle.spec.ts --workers=1
```

Result: **2 passed**. The initial attempt stopped during context creation because
an ambient saved-account path pointed to a missing file. It is not counted as a
pass. Clearing that inherited state allowed the suite's own disposable local
authentication to run.

```sh
bash scripts/start-local-postgres.sh env DATABASE_SSL=false \
  node --import tsx/esm --test scripts/exchange-lifecycle.integration.test.mjs
```

Result: **1 passed**, executing the actual API routers against migrated local
PostgreSQL.

```sh
bash scripts/start-local-postgres.sh env USER_A_STATE= \
  RUN_EXCHANGE_LOCAL_E2E=1 \
  PLAYWRIGHT_BASE_URL=http://127.0.0.1:18848 \
  PLAYWRIGHT_EXECUTABLE_PATH=/repl/tools/bin/chromium \
  node_modules/.bin/playwright test e2e/exchange-location-matrix.local.spec.ts --workers=1
```

Result: **1 failed** on the two modal-focus assertions only. All functional
assertions preceding them completed. The test remains explicitly local-only and
opt-in; it does not silently claim a green accessibility result.

Changed-file ESLint and `git diff --check` passed.

## Cleanup and production boundary

After the runs, read-only local queries found **zero fixture users, listings, or
communities** remaining. Fixture cleanup was scoped to synthetic account/listing
IDs; existing account data was not deleted.

The existing secure Account A state failed offline storage-state JSON
materialization. Account B passed the offline shape validator only; this does
not prove its current authentication, approval, disposable designation, or
community assignment. Account C state is missing. Temporary state files were
removed; no authentication values were printed.

No production browser requests or mutations were made. Production acceptance
still needs usable private states for the documented A/B/C roles, server-side
approval/disposable/community validation, verified deployment identity, and
scoped disposable test-data authorization. The synthetic accounts described in
`CROSS_COMMUNITY_MEDIA_TEST_MATRIX.md` are local fixtures, not reusable
production login credentials.

Physical iOS/Android browser backgrounding, permission prompts, software
keyboards, VoiceOver, and TalkBack remain separate acceptance gates.
