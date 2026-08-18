# Niakofa Legacy RPG reference bundle

This directory is the durable handoff for the Legacy RPG references reviewed
on August 12, 2026. The production implementation remains a React/Vite
experience; it does **not** embed the RPG Maker runtime or create a second game
architecture inside Niakofa.

The current session review, checksums, and archive counts are recorded in
`session-2026-08-12.md`. Current-session ZIP entry inventories are retained
under `source-manifests/`.

## Source boundary

- Family Vault records remain the source of truth. The RPG may surface verified
  memories, but it must not invent family history or present reference sprites
  as family likenesses.
- The LMBS archive is a movement, collision, action-state, and combat UX
  reference only. Do not copy `rpg_core.js`, `rpg_objects.js`, or RPG Maker
  runtime files into the React application.
- The fishing, animation, damage, and particle archives are visual/gameplay
  references. A small, explicitly promoted subset is used by the public demo's
  river-memory activity and world-regeneration feedback.
- The uploaded notes were reviewed in full with sensitive credential-bearing
  content excluded from durable project files. Never store credentials in the
  repository, source comments, or reference notes.
- Any future promotion of third-party assets still requires licensing review.

## Reviewed uploads

| Upload | Use in this edition |
|---|---|
| `uploads/Pasted-I-wouldn-t-simply-dump-rpg-core-js-rpg-objects-js-rpg-s_1786531546237.txt` | Product guidance: keep one architecture, strengthen the living-world loop, and close concrete persistence/collision gaps. |
| `uploads/yuruyuri_1786531557162.zip` | Reference-only scene/UI art; not promoted because its anime imagery is not Niakofa family-history evidence. |
| `uploads/Damage_1786531565509.zip` | Reference/status feedback; only the world-update and gold labels are promoted under `public/legacy-rpg-assets/uploaded-effects/`. |
| `uploads/charparticles_1786531584439.zip` | Reference particle effects; only the discovery glow is promoted under `public/legacy-rpg-assets/uploaded-effects/`. |
| `uploads/lmbs_1786528503234.zip` | Reference only; full entry inventory is in `source-manifests/`. The current-session upload is byte-identical. |
| `uploads/fishing_1786528492243.zip` | Promoted fishing shoreline, rod, fish, and splash art under `public/legacy-rpg-assets/fishing/`. |
| `uploads/animations_1786528522105.zip` | Promoted status/combat effect art under `public/legacy-rpg-assets/animations/`. The current-session upload is byte-identical. |
| `uploads/Pasted-I-wouldn-t-simply-dump-rpg-core-js-rpg-objects-js-rpg-s_1786539478390.txt` | Full Legacy design brief: Living Baobab hub, memory/world loop, grounded narration, meaningful inventory, relationship progression, mystery quests, co-op, and audio direction. |
| `uploads/Tree_Bark_1786539587004.zip` | Full bark material reference; one bark study is promoted for the living-tree atmosphere layer. |
| `uploads/Village_Asset_Pack_1786539607435.zip` | Full village environment/UI/character reference; eight curated presentation assets are promoted. |
| `uploads/villager_npc_spritesheet_1786539602605.zip` | Full generic villager spritesheet reference; one ambient motion cue is promoted. |
| `uploads/Ground_1786543159558.zip` | 136-entry material reference; one stone/earth study is promoted for the regeneration path cue. |
| `uploads/Retro_Tree_Pack_v1.0_1786543062147.zip` | 149-entry tree reference; living and stressed canopy sheets are promoted for deterministic atmosphere states. |
| `uploads/StylooVillageFREEPack_1786543032013.zip` | 48-entry GLB/FBX village reference; kept catalog-only because the React runtime does not need a 3D engine. |
| `uploads/Materials_Stylized_MixStones_01_1786562505717.zip` | 78-entry PBR stone/earth material study; reference-only because the production runtime remains 2D React. |
| `uploads/Materials_Stylized_CeramicTiles_1786562515573.zip` | 74-entry PBR ceramic wall/floor study; reference-only because the production runtime remains 2D React. |
| `uploads/LUD_FREE_ASSETS_1786562539269.zip` | 20-entry generic RPG environment/prop reference; catalog-only and never family likeness evidence. |

The uploaded fishing archive contains 22 entries and the animation archive
contains 118 entries. The reviewed archives are preserved byte-for-byte under
`uploads/`, with line-by-line ZIP entry manifests under `source-manifests/`.
The LMBS archive was extracted and reviewed as a reference; its complete
manifest is retained as a text inventory instead of shipping the entire
engine/archive into the runtime bundle.

The August 12 village uploads contain 91, 140, and 3 ZIP entries respectively
(Tree Bark, Village Asset Pack, and villager spritesheet). The current material
and environment uploads contain 136, 149, and 48 entries (Ground, Retro Tree,
and Styloo Village). They pass `unzip -t` integrity checks; their complete
inventories and current-session hashes are retained in `source-manifests/` and
`session-2026-08-12.md`. The browser receives only the files listed in
`artifacts/pay-it-forward/public/legacy-village-assets/catalog.json`.

## Runtime mapping

| Reference idea | Niakofa implementation |
|---|---|
| Living navigation and safe exploration | Shared `legacy-world-layout` walkability and spawn contract; blocked saved positions are repaired instead of rendered as teleports. |
| Small, meaningful RPG activity | River-memory fishing encounter with cast-power choices, persistent catch journal, rarity, and Legacy Points. |
| Effects without a second engine | Promoted animation PNGs render as lightweight feedback overlays in the existing React encounter. |
| World regeneration continuity | Each placed artifact is summarized by its concrete mutation type before the shared world advances from v1 to v2. |
| RPG command vocabulary without a second engine | Curated battleback/portrait/command art frames a persisted “memory encounter”; listen, inspect, and connect replace combat verbs. |
| Resume and cross-surface continuity | Versioned demo state is sanitized, same-tab/cross-tab synced, and storage failures are surfaced to the player. |

## Source manifests

`source-manifests/` contains the line-by-line archive entry inventories generated
from the uploaded ZIP files. `uploads/` preserves the reviewed source files for
future Legacy work. The current-session checksums and complete inventories are
also recorded in `UPLOAD-CATALOG.md` and
`source-manifests/current-materials-2026-08-12.entries.txt`; the raw current
uploads remain byte-preserved on the local upload snapshot branch. Runtime
promotion remains intentionally small and auditable.

## Curated runtime effects

The new `uploaded-effects/` files are used only as decorative discovery feedback:

- `legacy-particles-discovery.png` — supplied particle glow, shown over a recorded
  river memory and the regeneration summary.
- `legacy-world-updated.png` — supplied “Level Up!” label, repurposed as a
  world-version transition label.
- `legacy-gold.png` — supplied gold label, used as a small Legacy Points cue.

These assets remain subject to licensing/source confirmation before a public
commercial launch. They are not historical evidence and never replace Family
Vault data.

## Curated memory encounter assets

The August 12 battleback and battle-command uploads remain preserved in full
under `uploads/` and are catalogued line by line in `source-manifests/`.
The exact current-session names and SHA-256 values are recorded in
`session-2026-08-12.md`. Only six small files are promoted to the browser:

- `grassland.png` — initial-world memory encounter setting.
- `brick.png` — changed-world setting after regeneration.
- `face-3.png` — stylized portrait reference, never a family likeness.
- `command-item.png` and `command-summon.png` — visual command cues.
- `cursor.png` — focus cue.

The encounter is intentionally a React presentation backed by the shared demo
state. Its six promoted files are enforced by
`public/legacy-rpg-assets/catalog.json`. It does not import RPG Maker runtime
files or turn the supplied actors into real family identities. Confirm
provenance and licensing before public commercial launch.

## Curated village atmosphere

`legacy-village-atmosphere.tsx` uses the promoted village layer to make the
story timeline visible without creating a second runtime:

- prosperous and ravaged house art changes with the current story pressure;
- a field, tree, bark study, and generic elder sprite establish a living place;
- the migration phase surfaces a train-station landmark;
- other phases surface a small villager motion cue;
- the Ground material provides a small path cue;
- the Retro Tree living/dead sheets switch with pressure and world regeneration;
- the UI labels all of this as presentation art, never as family evidence.

## Workspace continuation uploads — August 18, 2026

The current production-readiness handoff is preserved under
`uploads/continuation-2026-08-18/`:

| Upload | Review result |
|---|---|
| `Pasted-Diagnosis-Fix-The-error-Current-environment-does-not-al_1787065868104.txt` | Read in full: identifies CSP-safe `pixi.js/unsafe-eval` loading as the required first import and calls for a single continuously mounted runtime. |
| `Pasted--LegacyGameCanvas-tsx-PixiJS-living-world-host-componen_1787065856566.txt` | Read in full: reviewed against the canonical runtime; its boot, NPC, activity, combat, and HUD guidance informed the current CSP and resume-state hardening. |

The exact SHA-256 values are recorded in
`source-manifests/continuation-2026-08-18.sha256`. No ZIP archive was present
in the uploaded workspace for this continuation.

## Workspace continuation uploads — August 12, 2026

The four files supplied for this continuation are preserved byte-for-byte in
`uploads/continuation-2026-08-12/`. Their complete archive entry traversal,
per-entry SHA-256 values, and document line-read record are in
`source-manifests/continuation-2026-08-12.entries.txt`.

| Upload | Review result |
|---|---|
| `Pasted-I-wouldn-t-simply-dump-rpg-core-js-rpg-objects-js-rpg-s_1786568716117.txt` | Read in full: keep the Family Vault/knowledge graph authoritative, use the Living Baobab as the emotional navigation surface, and do not embed RPG Maker as a second architecture. |
| `js_1786568782841.zip` | 113 entries / 3,347,297 uncompressed bytes read in full; LMBS/RPG Maker source remains movement, collision, action-state, and UI reference only. |
| `Debug_1786568786704.zip` | 143 entries / 906,885 uncompressed bytes read in full; debug/runtime source remains reference-only and is not shipped to the browser. |
| `UI_1786568806270.zip` | 96 entries / 101,342 uncompressed bytes read in full; UI artwork remains reference-only pending provenance/licensing review. |

No uploaded runtime source or generic image set is promoted into the production
bundle. The current app remains one React/Vite runtime, and the public demo
continues to use the existing curated, explicitly cataloged presentation
assets.