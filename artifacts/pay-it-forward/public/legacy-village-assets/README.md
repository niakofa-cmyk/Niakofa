# Curated Legacy village atmosphere assets

This directory promotes a small, auditable subset of the uploaded Village
Asset Pack, villager spritesheet, and Tree Bark archive. It is a React/Vite
presentation layer for the Legacy demo, not an RPG Maker runtime.

`catalog.json` is the source of truth for every browser-promoted file. The
catalog records the source archive, source entry, SHA-256, visual role, and
the following boundaries:

- `historicalEvidence: false` — these images do not become Family Vault facts.
- `familyLikeness: prohibited` — generic NPC art is never a real relative.
- `licenseStatus: review-required` — the uploads did not include a license grant.
- `runtime: approved` — approved only for the existing React presentation.

The complete uploads and line-by-line ZIP entry inventories remain under
`reference/niakofa-legacy-rpg/`. New assets must be cataloged and licensing
reviewed before promotion.