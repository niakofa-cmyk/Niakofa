# Niakofa Legacy RPG reference bundle

This directory is the durable handoff for the Legacy RPG references reviewed
on August 12, 2026. The production implementation remains a React/Vite
experience; it does **not** embed the RPG Maker runtime or create a second game
architecture inside Niakofa.

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
| `uploads/lmbs_1786528503234.zip` | Reference only; full entry inventory is in `source-manifests/`. |
| `uploads/fishing_1786528492243.zip` | Promoted fishing shoreline, rod, fish, and splash art under `public/legacy-rpg-assets/fishing/`. |
| `uploads/animations_1786528522105.zip` | Promoted status/combat effect art under `public/legacy-rpg-assets/animations/`. |

The uploaded fishing archive contains 22 entries and the animation archive
contains 118 entries. The three newly reviewed archives are preserved byte-for-
byte under `uploads/`, with line-by-line ZIP entry manifests under
`source-manifests/`. The LMBS archive was extracted and reviewed as a
reference; its complete manifest is retained as a text inventory instead of
shipping the entire engine/archive into the runtime bundle.

## Runtime mapping

| Reference idea | Niakofa implementation |
|---|---|
| Living navigation and safe exploration | Shared `legacy-world-layout` walkability and spawn contract; blocked saved positions are repaired instead of rendered as teleports. |
| Small, meaningful RPG activity | River-memory fishing encounter with cast-power choices, persistent catch journal, rarity, and Legacy Points. |
| Effects without a second engine | Promoted animation PNGs render as lightweight feedback overlays in the existing React encounter. |
| World regeneration continuity | Each placed artifact is summarized by its concrete mutation type before the shared world advances from v1 to v2. |
| Resume and cross-surface continuity | Versioned demo state is sanitized, same-tab/cross-tab synced, and storage failures are surfaced to the player. |

## Source manifests

`source-manifests/` contains the line-by-line archive entry inventories generated
from the uploaded ZIP files. `uploads/` preserves the reviewed source files for
future Legacy work. Runtime promotion remains intentionally small and auditable.

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