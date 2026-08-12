# Niakofa Legacy upload catalog

Reviewed: 2026-08-12

This catalog records the newly supplied files that were fully inspected
before implementation. The original files are preserved in `uploads/`; their
archive entry lists are preserved in `source-manifests/`.

| File | SHA-256 | Archive/content note | Runtime decision |
|---|---|---|---|
| `Pasted-I-wouldn-t-simply-dump-rpg-core-js-rpg-objects-js-rpg-s_1786531546237.txt` | `11b9ed0cfcab194ed69403fb7cfa033ac1fc35e42ff55e5acb91ab10aa124d89` | 6,426-line product note covering movement, camera, animation, Living Baobab, NPCs, regeneration, particles, and the RPG Maker source boundary. | Guidance only; no RPG Maker runtime is imported. |
| `yuruyuri_1786531557162.zip` | `f24a1b077bc979c130492dc81b54e7a5787c13c481d70bd28473d3a228a1241f` | 26 ZIP entries with scene/background art, character sheets, UI, meters, buttons, help, and particles. | Preserved for reference; anime scene/background art is not promoted into the family-history game. |
| `Damage_1786531565509.zip` | `0a06843aee6334cde91f625cc7dff56446ed96a3928c46a111324f703e253ab4` | Damage/status feedback including HP/MP numbers, Critical, Missed, Level Up, Gold, Exp, and Counter labels; `Thumbs.db` is non-runtime metadata. | A tiny status subset is promoted for world-regeneration feedback only. |
| `charparticles_1786531584439.zip` | `7d67fd124b814b394f4e6a0384ff947859e2eb891f41b53e78cc70bce4806bb1` | 14 particle/effect PNGs including fire, smoke, waterfall, and small particle variants. | The discovery glow is promoted; the remaining effects stay reference-only. |
| `Pasted-I-wouldn-t-simply-dump-rpg-core-js-rpg-objects-js-rpg-s_1786536735887.txt` | `11b9ed0cfcab194ed69403fb7cfa033ac1fc35e42ff55e5acb91ab10aa124d89` | 6,425-line product note covering Living Baobab navigation, grounded world regeneration, movement/animation concepts, RPG Maker boundaries, and the Legacy Golden Path. | Guidance only; no RPG Maker runtime is imported. |
| `battlebacks1_1786536760612.zip` | `8e308751befced76c89ac92fc06185b543e93a3e687404ef658a2cbcd5d17bb0` | 58 archived entries, primarily 1,000×740 and 1,600×1,300 battleback PNGs plus empty-directory metadata. | Preserved in full; `Grassland.png` is curated for the initial memory encounter. |
| `battlebacks2_1786536755060.zip` | `2b60fbfce8f584e203539cef58d7bcc07938ffc04b8bab2e221470fd41ba5d36` | 59 archived entries, primarily 1,000×740 and 1,600×1,300 battleback PNGs plus macOS metadata. | Preserved in full; `Brick.png` is curated for the changed-world memory encounter. |
| `battlecommands_1786536750903.zip` | `338813569b1326082413d50cb57d5dcc1a90a7c07b92bc3fa589e7ccfbc68e91` | 16 archived entries containing 32×32 command icons, cursor/layout art, and 178px portrait strips. | Preserved in full; two command icons, one portrait, and the cursor are curated for the React encounter. |
| `Pasted-I-wouldn-t-simply-dump-rpg-core-js-rpg-objects-js-rpg-s_1786562480084.txt` | `fb0e52cd10ec35d5e8d05dea6cd1ebfe2077418b7f4164d71af7052a18fcfad5` | Current-session copy of the full Legacy architecture/design note. | Guidance only; the React/Vite boundary and Family Vault authority remain unchanged. |
| `Materials_Stylized_MixStones_01_1786562505717.zip` | `56dd1996a48658f1d83fb64cdaf06d863ce4b4720041b329c5618d7b7968b6f2` | 78 entries: stylized stone, earth, lava, metal, and Blender source material maps. | Reference-only material studies; no 3D runtime is added. |
| `Materials_Stylized_CeramicTiles_1786562515573.zip` | `c5c34985698e0c75dc490cd99681b4580eeee3e71692e9999911b45688ba7eb7` | 74 entries: ceramic wall/floor material maps and Blender source. | Reference-only material studies; no 3D runtime is added. |
| `LUD_FREE_ASSETS_1786562539269.zip` | `9ef71291e2d1353ea03eac964dac4a716397b67906a7fabee9142e96d1b2aa8b` | 20 entries: generic buildings, doors, clutter, mining, beds, notice board, and war-camp sheets. | Reference-only presentation vocabulary; no asset is treated as family evidence or likeness. |

## Source and licensing boundary

The uploads are treated as reference material supplied for this project. No
license grant or provenance metadata was included in the reviewed files. Keep
the catalog and the original uploads together, confirm rights before a
commercial/public launch, and do not present any supplied sprite or scene as a
real family member or verified Family Vault record.

The current-session archive entry inventories are retained in
`source-manifests/current-materials-2026-08-12.entries.txt`. The raw current
uploads remain byte-preserved on the local `backup/uploaded-assets-snapshot`
branch; the main branch intentionally keeps the production checkout lean and
uses the checksums and inventories as the durable reference record.