# Niakofa main-branch review reconciliation

**Reconciled:** October 5, 2026  
**Scope:** Compare the uploaded reviews with the current workspace, preserve the
originals, record confirmed fixes, and keep production-only checks separate from
local validation.

## Preserved review sources

- [Current-main review, upload 1](../../attached_assets/Pasted-I-checked-the-current-main-branch-of-Niakofa-on-GitHub-_1791210348841.txt)
- [Current-main review, upload 2](../../attached_assets/Pasted-I-checked-the-current-main-branch-of-Niakofa-on-GitHub-_1791210369420.txt)
- [BUG-15b/15c and security review](../../attached_assets/Pasted-What-was-implemented-well-BUG-15b-max-travel-miles-at-c_1791210545229.txt)
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
| Empty promise catches in API/Nia code | Remaining comment-only handlers log safe context; the lint contract rejects empty promise catches. Error text and user-authored content are not added to these new logs. The broader frontend catch inventory mentioned in the review was not audited in this pass. |
| Production Redis fallback for sensitive actions | Production authentication and payment limiters fail closed when shared Redis is unavailable; the policy is documented in `docs/security/rate-limit-policy.md`. |
| Stale action-plan checklist | BUG-15b/15c tests and FK migration creation are marked complete, duplicate checklist rows were removed, and staging verification remains open. |
| Root one-off scripts | The review’s cleanup suggestion was not applied; it was a repository-hygiene recommendation, not required to resolve the confirmed runtime findings. |

## Validation

- Full workspace build, including typecheck: **passed**.
- Repository lint and empty-catch contract: **passed**.
- Focused lifecycle/push tests: **28 passed**.
- API new-endpoints suite: **19 passed**.
- API standalone archive/build-metadata/repayment tests: **20 passed**.
- Storage-state serialization tests: **9 passed**; no live account state was generated.
- Nia service suite: **51 passed** in the earlier full run.
- Full API Jest run: **663 passed, 3 skipped, 4 failed**. All four failures are live Mapbox route cases receiving HTTP 502 from the upstream routing service; their assertions were not weakened. This remains an external-provider check to rerun when Mapbox is healthy.

## Production-only gates not run

- The requested isolated object-storage probe was not executed: no confirmed
  production API service shell was available in the workspace. The uploaded
  note names `niakofa-production-media`, but the target service and safe
  operator path still need confirmation. No V21 setting or existing media was
  changed, and no temporary object was created.
- Production Stripe balance samples and webhook-to-payout checks were not run.
- No production deployment or mutation was performed.

Run the storage probe only from the confirmed production API service shell using
the existing verification script and its temporary-object cleanup path. Do not
use this note as authorization to change V21 or inspect existing media.
