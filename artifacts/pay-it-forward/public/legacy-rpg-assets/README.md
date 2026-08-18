# Curated Legacy RPG presentation assets

This directory is a small, auditable presentation layer for the Niakofa
Legacy memory encounter. It is not an RPG Maker runtime and it does not
contain a second game architecture.

`catalog.json` records the uploaded encounter files as reference-only. No
unresolved RPG-style encounter or animation file is browser-promoted. The
following safety boundaries apply:

- `historicalEvidence: false` — supplied art is not a Family Vault record.
- `familyLikeness: prohibited` — the portrait is never presented as a real
  family member.
- `licenseStatus: blocked-pending-provenance` — no license grant was included
  with the uploads.
- `runtime: catalog-only` — the files are not served by the app.

The complete uploaded archives and line-by-line entry manifests remain in
`docs/legacy-reference/`. Do not copy `rpg_core.js`, `rpg_objects.js`, LMBS
runtime files, RTP-shaped assets, or unreviewed sprites into the browser
bundle. New assets must be added to the catalog and test coverage only after
provenance and licensing review.