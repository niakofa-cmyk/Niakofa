# Niakofa Character & World Design Reference — 2026-08-13

Source: `attached_assets/Pasted-The-biggest-discovery-Universal-LPC-This-is-the-largest_1786590915947.txt`

SHA-256: `5174e11fc836a01046db35f47c91fabf115ed1787925d111707e1d0ac6c5c1f0`

## Runtime decisions captured

- Keep Niakofa Legacy as one React/Vite runtime; do not import an RPG Maker,
  TDSM, Unity, or other second-game runtime.
- Treat Family Vault and extracted family knowledge as authoritative. Art
  libraries provide approved presentation layers, never identity or historical
  truth.
- Resolve a character deterministically from `characterId`, `lifeStage`, `era`,
  and `appearanceSeed`, then compose body, clothing, hair, and optional layers.
- Regenerate selectively: a memory may add one echo/NPC/dialogue/quest; a
  relative may add a character and branch; a landmark may add a route; a major
  discovery may add a region/chapter.
- Preserve the loop `vault contribution → extraction → world change → player
  notices → gameplay → new memory`, with relationships, investigation,
  inventory, animation, oral history, and co-op as first-class directions.
- Prefer a curated, licensed subset of upstream pixel art over wholesale
  archive import. Every promoted asset needs source, creator, license,
  commercial-use, attribution, and runtime-scope metadata.

## Deliberately excluded

- RPG Maker MV core/managers/scenes/save/battle runtime files
- TDSM application/source redistribution
- complete LPC/Mana Seed archives in the browser bundle
- unreviewed or identity-bearing sprites presented as family likenesses

This file is a durable design and provenance reference. The original uploaded
document remains available in the workspace for audit and future curation.