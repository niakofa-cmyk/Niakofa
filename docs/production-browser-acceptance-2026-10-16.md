# Niakofa authenticated production browser acceptance

Date: 2026-10-16, America/Chicago

Subsequent source fixes, private Exchange history controls, CI wiring, and
read-only target-guard improvements are recorded separately in
[`exchange-reliability-followup-2026-10-16.md`](exchange-reliability-followup-2026-10-16.md).
The original production observations below remain historical evidence, not a
claim that those later changes have already passed production acceptance.

## Verdict

**PARTIAL — authenticated production sign-in and read-only Exchange checks
passed; production Media Studio and pickup lifecycle certification remain
incomplete.**

The supplied 158-line errors/risks document was read in full. Its recommendations
were treated as verification requirements, not as proof that defects exist.
No production settings, flags, approvals, memberships, migrations, existing
media, listings, or pickup requests were changed.

## Release and account evidence

| Check | Result |
| --- | --- |
| Canonical production origin | Railway domain inventory confirmed `https://niakofa.com`, API port 8080 |
| Railway deployment | `895651af-3f14-407f-9f93-2eb21d84248e`, SUCCESS |
| Served full commit | `71e55262d9604678540b7a8d6dd272dd2d63d45b` |
| Public health/readiness before browser blockage | HTTP 200; database connected; readiness true |
| A | Production UI sign-in passed; approved, active admin |
| B | Production UI sign-in passed; approved, active helper; same assigned Community as A |
| C | Production UI sign-in passed; approved, active; different assigned Community from A/B |
| Identity separation | All three authenticated identities distinct; all Community IDs positive and assigned |
| Browser | Repository Playwright CLI 1.62.1, system Chromium 152.0.7977.64 |

These are independently executed browser/self-profile checks, not synthetic
fixture labels or operator-reported results. Credentials, tokens, user names,
emails, and private account identifiers are deliberately omitted.

## Production browser observations

### Exchange

- Opened Community → Exchange at `/community/exchange`.
- Opened and closed the listing composer without submitting.
- Entered synthetic manual-area text without saving.
- Inspected A's My posts tab, which showed zero listings.
- At 390px width, document/body had no horizontal overflow.
- No listing-specific owner controls were exercised because no fixture listing
  was created.

The create/decline/retry/accept/two-party-completion journey was not performed.
Source inspection found withdrawal and lifecycle transitions but no owner-facing
listing or pickup-history deletion endpoint. The run imposed an exact-cleanup
gate and therefore stopped before creation. Normal retained lifecycle history is
not itself an application defect. Running that scenario requires permission to
retain the disposable test history or an approved exact-record cleanup procedure.
No direct production SQL cleanup was attempted.

### Moments / Media Studio

Authenticated navigation to `/community/moments` failed before Studio rendered:

- Production returned HTTP 429 for page resources.
- A stylesheet response had JSON content type rather than CSS.
- The browser reported “Unable to preload CSS”; the app displayed “Page crashed.”
- One visible Reload attempt returned the explicit JSON rate-limit response.
- Testing stopped rather than repeatedly requesting rate-limited resources.

No production photo/video upload, processing, playback, pending-review privacy,
or B/C media-access assertion was completed. The served SHA was verified before
this blockage; no claim is made about an additional release check afterward.

## Confirmed defect and local correction

The global API traffic limiter was mounted across the whole application,
including SPA documents and static assets. Those browser requests normally lack
Bearer headers and consumed the anonymous IP budget. Once exhausted, CSS/JS
requests received JSON 429 responses and navigation crashed.

Local correction:

- Mount the existing traffic limiter only at `/api`, after authentication.
- Preserve API request limits and all existing sensitive route protections.
- Add regression coverage for the exact application mount and API enforcement:
  excess API traffic remains 429 while documents/CSS/JS remain available.

**This correction is local, not published.** No rate-limit quota, production
variable, Redis key, or feature flag was changed to make the browser pass.

## Real local media regression

Command: `bash scripts/run-community-moments-browser-regression.sh`

Final result: **PASS**, exit 0.

| Suite | Result |
| --- | --- |
| Isolated API/runtime integration | 6 passed, including the browser acceptance wrapper |
| Profile / Spark browser matrix | 3 passed |
| Media Studio upload/privacy and legacy phone layout | 2 passed |
| API limiter boundary and rate-limit store | 2 suites, 9 tests passed |
| API TypeScript check | Passed |
| Whitespace/diff check | Passed |

The media run used disposable loopback PostgreSQL and Redis, real BullMQ workers,
FFmpeg/FFprobe, the actual Studio upload UI, and H.264-capable Chromium.
It verified:

- JPEG decode and H.264 MP4 playback.
- Headerless MediaRecorder WebM upload, server-derived duration, and playback.
- Media persistence/playback after deep links, reload, and navigation.
- Malformed PNG rejection without starting an upload or losing the selected
  valid photo and caption.
- Owner-visible pending review; same-community B cannot retrieve the pending
  media or obtain video playback grants.
- The companion matrix checks author-only pending Spark/recovery details
  against both B and cross-community C.
- Legacy audience colors and phone-width containment.
- Processed media rows, terminal processing jobs, and generated variants.

Initial attempts exposed two locator mismatches, a description-panel label
mismatch, and an invalid fixture assumption that benign captions always enter
review. The test now uses actual accessible roles/names, bounded action
timeouts, and a harmless reserved-domain URL to trigger real moderation.
The owner/caption cleanup list matches those exact submitted fixtures.
The browser wrapper has additional shutdown time and bounded filesystem-removal
retries so cleanup is less likely to obscure a test failure.

Local regression results are not production storage or physical-device evidence.
This run did not certify interrupted production uploads, production orphan-object
reconciliation, or mandatory execution of this suite in CI.

## Live database schema gate

Railway inventory confirmed the app's operator-identified Postgres service has
an existing active proxy. The saved read-only audit connection did not match
that target. The guard returned `UNCONFIRMED_DATABASE_TARGET` **before connecting
or sending SQL**. Connection values were not printed.

The production Exchange schema, migration 0161 ledger entry, and live partial
unique index therefore remain **unverified**, not missing or broken.
An authorized read-only session on the confirmed application database is still
required. No repair or migration was attempted.

## Cleanup and development readiness

- Production fixtures created: zero listings, pickup requests, Moments, or media
  assets. No production fixture deletion was necessary.
- All three temporary production auth-state files were removed. Transient browser
  output directories, traces, and error contexts were removed; contexts closed.
- Only private sanitized screenshots and a token-free report were retained
  outside the checkout.
- The final disposable local regression exited successfully with its scoped
  database, Redis, media, and temporary-directory cleanup.
- An old development API listener was identified by its process/start time and
  stopped. The managed API workflow was restarted and logged a clean listen on
  8080 with Redis and media workers ready. Preview `/api/version` then reported
  the new start time, `2026-10-16T08:44:37.437Z`.
- The public development sign-in screen rendered successfully. That screenshot
  is not evidence of authenticated production acceptance.

## Remaining release gates

1. Publish the API limiter correction, then verify the new served commit before
   continuing the blocked production media journey.
2. Establish the permitted retention/cleanup policy for disposable Exchange
   listing and pickup history, then execute the actual A/B lifecycle and C's
   restricted-access assertions.
3. Obtain live Exchange schema/index/ledger evidence from the confirmed database.
4. Execute the physical iOS Safari and Android Chrome matrix. Desktop Chromium
   and phone-size emulation do not satisfy this gate.

Niakofa is not fully production-certified end to end by this report.
