---
name: Niakofa ARPG Architecture
description: Decision record from the ARPG/OCC evaluation; what to build, what to study, what not to copy.
---

## Decision (August 2026)

ARPG Plugin Set (DotMoveSystem, ARPG_Core, CharacterCollisionEx) studied as reference only.
OCC Winner Pack studied for pipeline structure only — images NOT licensed for non-RPG Maker use.
No RPG Maker code copied into the Niakofa runtime.

## Three original systems implemented

| System | File | Replaces |
|---|---|---|
| NiakofaMovementSystem | niakofa-movement-system.ts | Grid snap → pixel movement |
| NiakofaWorldEntitySpawner | niakofa-world-entity-spawner.ts | Static NPCs → Family Memory → dynamic entities |
| NiakofaCharacterAssetLibrary | niakofa-character-asset-library.ts | Single sprite → multi-rep pipeline |

## Key rules

**Why:** Pixel movement (slide-on-corner, AABB, interaction radius) replaces grid snap so Kwame feels physical. The DotMoveSystem pattern was the inspiration — do not revert to tile snapping.

**How to apply:** Use `NiakofaMovementController` in any scene that needs player movement. Wire `WorldSpawnContext.alreadySpawned` as a Set to avoid duplicate NPCs across region changes.

**Art tier gate:** `enforceCharacterArtTier` throws for protagonist/antagonist with non-handDrawn tier. Kwame's portrait/bust/face are pending commission (marked missing in `auditCharacterAssets()`).

**World Regen bridge:** `payloadToAncestor()` converts backend API JSON → AncestorRecord → `batchSpawn()`. This is the Family Vault → RPG World connection point.

## Licensing

- Do NOT put ARPG plugin JS or OCC PNGs in the public GitHub repo.
- If distributing with ARPG-derived code: `© 2023 unagiootoro © Gotcha Gotcha Games Inc.`
- Reference docs saved in `public/legacy-reference-docs/ARPG-ARCHITECTURE-RECOMMENDATION.md`.
