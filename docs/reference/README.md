# Niakofa reference materials

This directory records source material used during production-readiness work.
Reference text, images, and ZIP bundles remain in the repository so future
sessions can review the original material without re-creating it.

## Current review set

- `niakofa-media-studio-rebuild-2026-10-01.md` — reviewed Studio rebuild
  brief/package provenance, selected visual references, and the Android donor
  archive boundary.
- `niakofa-community-v5-2026-09-30/` — seven original Community/Moments
  notes, patches, and code/style snapshots, with superseded-status labels and
  the Village/Local backend boundary; no photography was included.
- `../../artifacts/mockup-sandbox/src/components/mockups/niakofa-moments/`
  and `../../artifacts/mockup-sandbox/public/images/niakofa-neighbor-garden.jpg`
  — retained Current and VerticalFeed visual references and their sample image;
  production Moments components remain in `artifacts/pay-it-forward/`.
- `niakofa-2026-09-27-inputs/` — verbatim location-marker, integration/privacy, and network-fault notes; pointers to the retained community architecture image and two Niakofa ZIP references; explicit unapproved-subsidy boundary.
- `niakofa-exchange-six-tab-community-2026-09-25/` — original Exchange/navigation review notes, improvement ZIP, and six mobile interaction-reference screenshots; references only, not copied product assets.
- `attached_assets/` — pasted checkpoint notes supplied for the current review.
- `uploads/2026-10-02/niakofa-production-readiness-work-order.txt` — retained
  copy of the uploaded work order for review provenance, not a feature
  specification or certification result.
- `attached_assets/fb-clone-main_1790031621743.zip`,
  `attached_assets/sociobook-main_1790031632562.zip`, and
  `attached_assets/WigsStar-main_1790031636794.zip` — unlicensed reference
  projects reviewed for interaction and visual ideas only; Niakofa remains the
  canonical implementation.
- `attached_assets/Niakofa-Community-Stories-Enhanced-Implementation-2026-09-19_1789858090444.zip`
  — uploaded Story implementation reference retained for comparison, not
  imported as application code.
- `docs/reference/uploads/2026-09-21-niakofa-reference-review/README.md` —
  current reference-review boundary and reuse map for the uploaded archives.
- `docs/reference/2026-09-22-audit-addendum.md` — current audit ledger for
  completed fixes, retained references, intentional scope boundaries, and
  production evidence still requiring approved runtime access.
- `docs/reference/community-v4/` — consolidated Community V4 audit, visual
  evidence, Create states, and responsive desktop/mobile references.
- `docs/reference/community-story-visual-enhancement/` — current Story visual,
  production-gate, and certification references, including the retained images.
- `docs/reference/uploads/2026-09-05/` — acceptance, deployment, and status
  material for the latest production-readiness pass.
- `docs/reference/uploads/2026-09-05/` — Diaspora and Spiral acceptance
  snapshots.
- `docs/reference/uploads/2026-09-05/spirals/` — the Spiral GPS and host-signal
  bundle, including the root-cause and wiring notes.
- `docs/reference/community-pool-fix_1788104483429.zip` — Community Pool UX
  reference implementation.
- `docs/reference/uploads/2026-09-05/assets/` — acceptance and status ZIP
  bundles from the latest operator review.
- `reference/uploads/2026-09-04/` and `reference/uploads/2026-08-28/` —
  earlier Diaspora and Circles/LiveKit operational references retained for
  compatibility and historical context.

The public product name is **Niakofa Spirals**. Circle-era database/API names
remain compatibility internals; do not rename persisted tables or routes
without an explicit migration plan. Do not fabricate neighborhood geometry:
only rows with reviewed, effective geometry may tighten city-level host
eligibility.

Credentials, connection URLs, user state, and deployment-only values must stay
in the workspace or deployment secret manager and must not be copied into
reference files.