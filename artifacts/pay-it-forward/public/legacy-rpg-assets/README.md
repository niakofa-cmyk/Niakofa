# Curated Legacy RPG presentation assets

This directory is a small, auditable presentation layer for the Niakofa
Legacy memory encounter. It is not an RPG Maker runtime and it does not
contain a second game architecture.

`catalog.json` is the source of truth for the six browser-promoted files. Each
entry records its source archive, source entry, SHA-256, visual role, and the
following safety boundaries:

- `historicalEvidence: false` — supplied art is not a Family Vault record.
- `familyLikeness: prohibited` — the portrait is never presented as a real
  family member.
- `licenseStatus: review-required` — no license grant was included with the
  uploads.
- `runtime: approved` — approved only for this React/Vite presentation use.

The complete uploaded archives and line-by-line entry manifests remain in
`reference/niakofa-legacy-rpg/`. Do not copy `rpg_core.js`, `rpg_objects.js`,
LMBS runtime files, or unreviewed sprites into the browser bundle. New assets
must be added to the catalog and test coverage only after provenance and
licensing review.