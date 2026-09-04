# Niakofa Diaspora acceptance reference — 2026-09-04

This reference index preserves the uploaded Diaspora review and acceptance
materials alongside the canonical Niakofa source tree.

## Preserved uploads

- `reference/uploads/2026-09-04/Pasted-Check-the-updated-repo-and-provide-the-improved-and-enh_1788535451247.txt`
- `reference/uploads/2026-09-04/Pasted-Proceed-with-all-of-your-recommendations-and-Run-authen_1788535463482.txt`
- `reference/uploads/2026-09-04/Niakofa-Diaspora-Release-Acceptance-2026-09-04_1788535469289.zip`

The archive contains the acceptance artifact, operator runbook, results
template, gated Playwright runner, verdict, and the separate provider-grade
DNA project charter. The uploaded material was scanned for credential-shaped
values before being preserved; no matches were found.

## Verified baseline

- Refreshed canonical `main` from GitHub at `b8a231636269c8c4f4594e456fda0cd32ac42a50`.
- Diaspora polish commits are present, including curated Heritage catalog
  metrics, escape-safe Preserve contract coverage, DNA provenance UX, and
  great-circle globe geometry.
- Provider-grade shared-cM/IBD DNA remains intentionally out of scope.
- Authenticated Chromium and disposable Family Space mutation acceptance remain
  operator-gated; no PASS is claimed without `BASE_URL`, `USER_A_STATE`, and
  `ALLOW_MUTATING_E2E=1`.

## Follow-up hardening in this edition

Reverse geocoding now distinguishes a genuine no-match from provider
unavailability. A transient Mapbox outage no longer clears an existing
community assignment during a GPS update. New registrations remain
non-blocking and use the global bucket when geocoding is unavailable; valid
unmatched locations still fail closed to that same global bucket.