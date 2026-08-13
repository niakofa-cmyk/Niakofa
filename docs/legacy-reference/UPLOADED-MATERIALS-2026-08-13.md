# Niakofa Legacy uploaded-materials reference

This note records the four source materials reviewed while continuing the
Legacy RPG work on August 13, 2026. The materials were read from the Repl's
uploaded files, not from a connected service. They are research inputs and
are not browser runtime dependencies.

## Source register

| Source supplied to the session | What was reviewed | Runtime status |
| --- | --- | --- |
| `attached_assets/Pasted-The-biggest-discovery-Universal-LPC-This-is-the-largest_1786589088156.txt` | Universal LPC discovery notes, generator architecture, animation and layer guidance, and licensing discussion | Reference-only |
| `attached_assets/Mana_Seed_Farmer_Sprite_Free_Sample_1786589124288.zip` | `Farmer Sprite System readme.txt`, `Mana Seed readme.txt`, `THIS IS A FREE SAMPLE.txt`, and `create and sell your own compatible content.txt` | Reference-only; sample terms require the supplied limitations to remain respected |
| `attached_assets/Universal-LPC-Spritesheet-Character-Generator-master_1786589157588.zip` | Archive inventory and generator/source structure; approximately 95,355 entries, including approximately 87,978 PNGs, 926 JSON files, and 167 JavaScript files | Reference-only; no wholesale import |
| `attached_assets/tdsm-master_1786589201560.zip` | Primary `README.md`, license/changelog, program metadata, Java source, JSON, image, and build structure | Reference-only; the TDSM application is not redistributed |

The uploaded files were available during inspection but are not present in
the current checked-in checkout. Because the original byte streams are not
available here for a second hash pass, this record intentionally does not
invent SHA-256 values. Earlier upload manifests cover other, byte-identical
source bundles where hashes were captured.

## Reusable findings

### Character presentation

- Use numbered, composable paper-doll layers with an explicit layer order.
- Keep body, clothing, hair, accessories, palette choices, animation frame,
  character ID, life stage, era, and appearance seed as separate concepts.
- Deterministic variation is preferable to random variation: the same
  character inputs should produce the same visual result.
- TDSM-style dependency-aware selection and export metadata are useful design
  references, but the TDSM runtime and source are not part of the Niakofa
  browser bundle.
- Filenames are asset identifiers only. They must never be treated as proof of
  a person's identity, gender, family relationship, or life history.

### Animation and world presentation

- Compose walking and idle motion from layered frames rather than embedding a
  second game engine.
- Make world changes legible in play: a preserved object should produce a
  visible, inspectable story prompt or location change.
- Keep the Family Vault and extracted knowledge authoritative; art libraries
  provide presentation references and approved visual layers, not facts.
- Exploration, discovery, memory, investigation, and preservation are the
  Legacy loop. Combat or a replacement RPG runtime is out of scope.

## Implementation boundary

The active Legacy app remains one React/Vite experience. The checked-in
`niakofa-original-art-demo-v1` library is the safe opt-in visual source for
new runtime presentation. The curated
`niakofa-rpg-generator-v1` library remains review-required and must not be
expanded from the uploaded archives until provenance and licensing are
confirmed.

The regenerated House of Mensah map now uses this guidance for a bounded
presentation layer: each explicitly placed demo artifact can reveal a
deterministic, clickable “memory echo” in World Version 2. These echoes are
generic story prompts rendered with original art; they are not claimed to be
verified family likenesses and do not infer facts from asset names.
