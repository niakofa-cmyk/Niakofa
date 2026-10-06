# Niakofa main-branch review reconciliation

**Reconciled:** October 5, 2026; **updated:** October 6, 2026
**Scope:** Compare the uploaded reviews with the current workspace, preserve the
originals, record confirmed fixes, and keep production-only checks separate from
local validation.

## Preserved review sources

- [Current-main review, upload 1](reviews/current-main-review-upload-1.txt)
- [Current-main review, upload 2](reviews/current-main-review-upload-2.txt)
- [BUG-15b/15c and security review](reviews/bug-15b-15c-security-review.txt)
- [Current code review upload](reviews/current-code-review-upload.txt)
- [Historical action plan](../../ACTION_PLAN_NEXT_SESSION_2026-06-28.md)

The two current-main review uploads are byte-identical. All uploaded source files
remain unchanged.

## Confirmed findings and disposition

| Finding | Current status |
| --- | --- |
| Oversized `USER_A_STATE_JSON` | Generator output is compact by default, has a configurable 16 KiB default limit, and has regression tests. No fresh browser state was generated and no secret was replaced. Consolidating the separate media-state materializer remains optional and was not done. |
| Claim distance could fail open; community assignment could precede a successful claim | Non-emergency claims now require valid request and helper coordinates. Community assignment is coupled to the successful claim transaction. Claim fixtures now explicitly set valid locations and disable the default-on pool path when that path is not under test. |
| Nia check-in secret and user-authored prompt text | Secret comparison is constant-time; user-authored text is bounded, delimited, and identified as untrusted. |
| Push notification classification and preference enforcement | `notifType` is required by the payload type and omitted classifications fail closed at runtime. The all-helper path respects notification preferences. |
| Duplicate migration prefixes | CI permits only the exact known legacy collisions and rejects new duplicates; the runner tracks full migration filenames. |
| Empty promise catches and bare empty catches across API, Nia, and frontend | Replaced swallowed errors with explicit sanitized reporting or safe-storage fallbacks; the lint contract now rejects empty promise handlers and bare empty `catch {}` in all three code areas. Expected aborts remain quiet, and clipboard fallback failures show an error instead of false success. |
| Redis response-cache failures | Redis read/write/delete failures are logged without sensitive values; reads and writes fall back to local memory, and local invalidation still runs after a failed remote delete. |
| Production Redis fallback for sensitive actions | Production authentication, payment, help-request claim, and internal Nia check-in limiters fail closed when shared Redis is unavailable. The user-facing passive safety check-in remains available through its bounded fallback. Admin mutations were audited and require both authentication and admin authorization. Policy: `docs/security/rate-limit-policy.md`. |
| Mapbox integration tests depending on upstream uptime | Four deterministic mocked-provider route cases now exercise the response contract and departure-time formatting. Real Mapbox calls require both a public token and explicit `RUN_LIVE_MAPBOX_TESTS=1`. |
| Stale action-plan checklist | BUG-15b/15c tests and FK migration creation are marked complete, duplicate checklist rows were removed, and staging verification remains open. |
| Root one-off scripts and oversized `CLAUDE.md` | Historical scripts and patch moved under `scripts/legacy/`; the full old session file is preserved at `docs/agent/CLAUDE.md.legacy-archive`, while the root file now contains concise current project guidance. |
| Uploaded review references | Four supplied review files are preserved verbatim under `docs/reference/reviews/`; the reconciliation links now resolve in a Git checkout rather than depending on ignored `attached_assets/`. |

## Validation

- Workspace build, typecheck, lint, platform audits, and release validation: **passed**.
- Lint contract and safe-storage tests: **4 passed**; the rule rejects bare empty catches and empty promise handlers, while documented fallback catches remain allowed.
- Frontend suite: **628 passed**; client-side failure reporter: **3 passed**; safe-storage coverage includes missing and inaccessible browser storage.
- API Jest: **101 suites passed, 2 skipped; 671 tests passed, 8 skipped**. The dedicated new-endpoints suite had **19 passed**, and archive/build-metadata/repayment checks had **20 passed**.
- After switching Redis cache failure logs to sanitized error types, the focused cache suite had **3 passed** and confirmed the provider error message was not logged.
- Nia service suite: **7 suites and 51 tests passed**.
- The deterministic mocked Mapbox route cases passed; live Mapbox cases remain opt-in through `RUN_LIVE_MAPBOX_TESTS=1`.
- All four preserved review copies remain byte-identical to their uploads. A credential-pattern scan found no credential-shaped matches and printed no file contents.
- Preview workflows restarted cleanly. The web sign-in page rendered at desktop size; signed-in pages were not visually checked. The API preview served local Git HEAD `5cf794045c5d160aca731def1c555439c9da6698` with no repeated `EADDRINUSE`. Nia listened and completed its local migrations, but this workspace has no `INTERNAL_SECRET`, so its internal-only endpoints reject requests here.

## Production-only gates not run

- The requested isolated object-storage probe remains unrun. Railway's
  production API service, `zesty-ambition`, was checked read-only and reported
  online with no recent failures. No production shell or storage operation was
  used; no temporary object was created, and no V21 setting or existing media
  was changed. The target bucket and approved operator path still need
  confirmation.
- Production Stripe balance samples and webhook-to-payout checks were not run.

### Historical evidence for the October 5 release

The following records describe the prior published commit only; they do not
establish the current branch or deployment state for this review.

- Before the authorized GitHub push, Railway reported `SUCCESS` for
  `427bc111adcf665f6036319a582b7c03464b49eb`, matching the then-current
  `origin/main`. The push may trigger an automatic Railway deployment; no
  manual deploy was requested or run.
- The non-forced push advanced GitHub `main` to
  `032ac9ba325bf1fa33a7d1642930ef8205c634ac`. Local `main`, `origin/main`, and
  GitHub `main` matched at that SHA, with a clean worktree.
- Railway automatically deployed that commit as deployment
  `cc0f32b3-f452-43c8-b2bb-d69eec5da952`; it completed with `SUCCESS`, and the
  production service returned online with zero recent failures.
- At verification time, the canonical `https://niakofa.com/api/version`
  endpoint reported `032ac9ba325bf1fa33a7d1642930ef8205c634ac` (`chat-v2`,
  started at `2026-10-05T16:07:50.540Z`). No manual Railway deploy was run.

Run the storage probe only from the confirmed production API service shell using
the existing verification script and its temporary-object cleanup path. Do not
use this note as authorization to change V21 or inspect existing media.
