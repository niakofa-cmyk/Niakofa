# Niakofa Legacy reference

This file is the implementation reference for the local House of Mensah vertical slice.
It records the source material used in this edition without putting RPG Maker runtime
code inside the Niakofa application.

## Source material

- `attached_assets/Pasted-I-wouldn-t-simply-dump-rpg-core-js-rpg-objects-js-rpg-s_1786523918038.txt`
  — product and architecture notes. The key boundary is: **Niakofa is the intelligence;
  the RPG runtime is the body**.
- `attached_assets/Niakofa_Legacy_DemoPacks_README_1786523943461.md`
  — curated pack map and vertical-slice checklist.
- `attached_assets/Niakofa_Legacy_CharacterPack_1786523943461.zip`
  — 4,226 layered character assets. Current demo uses TV body, clothing, rear hair,
  and front hair layers with a deterministic appearance seed.
- `attached_assets/Niakofa_Legacy_WorldPack_1786523943460.zip`
  — curated 2D village, building, UI, weather, indicator, and collectible assets.
- `attached_assets/generator_1786523973251.zip`
  — original generator archive retained for provenance and future asset indexing.

## Implemented vertical slice

The app currently demonstrates the Phase 1 golden path in a client-side, local
vertical slice:

1. Open the Living Baobab as the main menu.
2. Select an ancestor or a living storyteller branch.
3. Enter the House of Mensah 1890 scene.
4. Walk with WASD or arrow keys and interact with Ama or the story fragment.
5. Hear a Memory Echo and update the knowledge meter.
6. Regenerate the world to reveal the new trading-house discovery.
7. Record a new family memory; it persists in local storage and appears in the Journal.

## Asset boundary and licensing

The asset packs are third-party RPG Maker-style packs. Their supplied catalog marks
the license status as `review-required`. Do not ship this demo publicly until those
terms are confirmed. Fantasy layers such as beast ears, wings, tails, and cloaks are
intentionally excluded from the Niakofa cast.

## Future phases

- Phase 2: day/night, schedules, relationships, dynamic dialogue, interiors, music.
- Phase 3: character evolution, births, deaths, marriage, migration, branches.
- Phase 4: Family Vault → Knowledge Graph → World Compiler → runtime.
- Phase 5: shared family sessions.
- Phase 6: mobile, desktop, controller, touch, and performance polish.

## Repository access note

The provided GitHub remote was not readable or writable in this Repl: the available
PAT values returned `invalid credentials`, and the GitHub OAuth connection proposal
was declined. No claim of a GitHub push or remote parity is made from this workspace.