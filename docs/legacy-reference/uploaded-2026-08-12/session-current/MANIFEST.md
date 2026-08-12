# Niakofa Legacy uploaded reference manifest

Captured from the current uploaded session on 2026-08-12. The source archives
were inspected and passed ZIP integrity checks before this manifest was written.

## Source archives and documents

| File | SHA-256 | Inventory |
| --- | --- | --- |
| `Niakofa_Legacy_WorldPack_1786525741853.zip` | `5326389063a15c865a139a3f85dc558cdcbb08bcc5321de1185e22866abbc303` | 552 archive entries; 474 PNG files |
| `Niakofa_Legacy_CharacterPack_1786525741854.zip` | `3c5bd6fd1797b536d18fbee9a7038529ea8fe0f8bda76aa3d9587d6568706a59` | 4,249 archive entries; 4,226 PNG files |
| `Niakofa_Legacy_DemoPacks_README_1786525741855.md` | `13419039f37911476ec15d243ed3e82d00b8f1c9e05909ca777eefd0bb860511` | Pack usage, Golden Path mapping, licensing, and Tier 3 exclusions |
| `Pasted-I-wouldn-t-simply-dump-rpg-core-js-rpg-objects-js-rpg-s_1786525724597.txt` | `11b9ed0cfcab194ed69403fb7cfa033ac1fc35e42ff55e5acb91ab10aa124d89` | Full Niakofa Legacy RPG architecture and production-gap design document |

The complete source documents are preserved beside this manifest. The large
generator archives remain reference-only and are not copied into the shipped
runtime. Their catalog and license-review status are preserved here so a
future approved asset import can be audited without guessing.

## Runtime boundary

- Shipped demo visuals use the license-safe original-art runtime library under
  `artifacts/pay-it-forward/public/legacy-world-assets/`.
- WorldPack and CharacterPack generator content remains catalog/reference-only
  until license review and an explicit import decision.
- Niakofa owns family facts, provenance, extraction, world regeneration, quests,
  and dialogue; the RPG runtime owns rendering, movement, interaction, maps, and
  UI.

## Golden Path coverage

The production demo now guards the transition from preserved contributions to a
regenerated world: all four artifact facts must be placed before regeneration,
and a co-op quest must be started before it can be completed. Regenerated worlds
use a deterministic alternate playable layout while keeping every restored
artifact landmark discoverable.