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
- The fishing and animation archives are visual/gameplay references. A small,
  explicitly promoted subset is used by the public demo's river-memory activity.
- The uploaded notes were reviewed in full with sensitive credential-bearing
  content excluded from durable project files. Never store credentials in the
  repository, source comments, or reference notes.
- Any future promotion of third-party assets still requires licensing review.

## Reviewed uploads

| Upload | Use in this edition |
|---|---|
| `Pasted-I-wouldn-t-simply-dump-rpg-core-js-rpg-objects-js-rpg-s_1786529652318.txt` | Product guidance: keep one architecture, strengthen the living-world loop, and close concrete persistence/collision gaps. |
| `lmbs_1786529663994.zip` | Reference only; full entry inventory is in `source-manifests/`. |
| `fishing_1786529675495.zip` | Promoted fishing shoreline, rod, fish, and splash art under `public/legacy-rpg-assets/fishing/`. |
| `animations_1786529683315.zip` | Promoted status/combat effect art under `public/legacy-rpg-assets/animations/`. |

The uploaded fishing archive contains 22 entries and the animation archive
contains 118 entries. The LMBS archive was extracted and reviewed as a
reference; its complete manifest is retained as a text inventory instead of
shipping the entire engine/archive into the runtime bundle.

## Runtime mapping

| Reference idea | Niakofa implementation |
|---|---|
| Living navigation and safe exploration | Shared `legacy-world-layout` walkability and spawn contract; blocked saved positions are repaired instead of rendered as teleports. |
| Small, meaningful RPG activity | River-memory fishing encounter with cast-power choices, persistent catch journal, rarity, and Legacy Points. |
| Effects without a second engine | Promoted animation PNGs render as lightweight feedback overlays in the existing React encounter. |
| Resume and cross-surface continuity | Versioned demo state is sanitized, same-tab/cross-tab synced, and storage failures are surfaced to the player. |

## Source manifests

`source-manifests/` contains the line-by-line archive entry inventories generated
from the uploaded ZIP files. The original uploads remain session attachments;
the runtime promotion above is the intentionally small, auditable subset.