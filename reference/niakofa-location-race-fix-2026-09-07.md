# Niakofa location freshness reference — 2026-09-07

## Source materials reviewed

The following session uploads were read in full and remain in
`attached_assets/` for traceability:

- `README-location-race-fix_1788800195645.md`
- `niakofa-location-race-fix_1788800195645.patch`
- `stamp-location-updated-at_1788800195644.ts`
- `users_1788800195645.ts`
- `Pasted--GitHub-Railway-Verdict-repository-is-advanced-producti_1788800271965.txt`
- `Pasted-Configure-production-Stripe-and-Redis-BullMQ-Add-focuse_1788135247289.txt`

No ZIP file was present in this upload. The repository's existing reference
notes document earlier ZIP materials that were already reviewed; those
archives were not reintroduced into the current checkout.

## Adopted production fix

The canonical `PATCH /api/users/:id/location` route now writes
`location_updated_at` in the same database update as latitude, longitude,
heading, and speed. This makes position and freshness atomic for the
GPS → live-presence → village-pulse chain.

The location timestamp middleware remains mounted as a compatibility safety
net for older or alternate location routes. It now passes through successful
responses that already contain `location_updated_at`, and never performs a
fallback write for error responses.

## Verification boundary

- The local web artifact renders the sign-in landing page without browser
  console errors.
- The before/after landing-page evidence is retained in
  `screenshots/pre-edit-landing-2026-09-07.jpg` and
  `screenshots/post-location-race-fix-2026-09-07.jpg`.
- The local API process starts and keeps `/healthz`/readiness available, but
  this fresh workspace database is not migrated, so background workers remain
  paused and readiness correctly stays unready.
- The uploaded verdict's external Railway, authenticated production-browser,
  verified-neighborhood geometry, Stripe webhook, and physical LiveKit device
  gates remain deployment/operator evidence; they are not claimed from local
  source inspection.