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
| `attached_assets/Universal-LPC-Spritesheet-Character-Generator-master_1786590529863.zip` | Fresh LPC archive inspection: README, full license, palette recolor guide, credits CSV, animation/catalog source, and archive inventory | Reference-only; licensing and attribution must be resolved per selected asset before runtime use |

The fresh LPC archive upload was present in the Repl and passed `unzip -t`.
Its SHA-256 is
`3c82b78c0b4ce6ffe6cfb7a8b95b37e14ad361e5f793622281e5469d097d5ee1`.
It contains 95,355 archive entries: 6,225 directories and 89,130 files,
including 87,978 PNGs, 931 JSON files, 113 JavaScript files, 15 Markdown
files, one text file, two CSV files, and 90 other files. The earlier uploaded
files were available during the prior inspection but are not present in the
current checked-in checkout; this record intentionally does not invent hashes
for those missing byte streams.

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
- The LPC README states that individual art can carry CC0, CC-BY-SA, CC-BY,
  OGA-BY, or GPL terms and requires contributor credit for selected art.
  Attribution must therefore be tracked per selected asset, not assumed from
  the archive name.
- The generator's palette recolor guide and catalog metadata are useful
  references for future bounded variation work, but its WebGL generator,
  source catalog, and full asset tree are not runtime dependencies for Legacy.

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

## August 13 pass upload record

The three uploads used for this pass are retained in the workspace and
recorded in `reference/niakofa-legacy-rpg/source-manifests/`:

| Upload | SHA-256 | Integrity | Scope |
|---|---|---|---|
| `Pasted-The-biggest-discovery-Universal-LPC-This-is-the-largest_1786590915947.txt` | `5174e11fc836a01046db35f47c91fabf115ed1787925d111707e1d0ac6c5c1f0` | 7,222 lines read | Character/world architecture reference |
| `tdsm-master_1786590922267.zip` | `508ec7f42a175fd894d5c3d5841b5f8f75ace256d9204e371b402e2c4beb0f5a` | 349 entries; `unzip -t` passed | TDSM layering/export/license reference |
| `Mana_Seed_Farmer_Sprite_Free_Sample_1786590938254.zip` | `02463060c20ea6f96c67b4bdff1244f5b3783181ab6a4084315501c18f80eb9f` | 52 entries; `unzip -t` passed | Free-sample sprite/palette reference |

The raw uploads remain ignored from the production bundle. They are not
copied wholesale into the browser runtime; only explicitly curated assets with
asset-level provenance may be promoted.
