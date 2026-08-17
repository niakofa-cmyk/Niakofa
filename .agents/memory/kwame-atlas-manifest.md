---
name: Kwame Atlas Manifest
description: baseUrl, directory layout, and frame-naming conventions for all 784 Kwame Mensah animation frames; what's registered vs still placeholder.
---

# Kwame Atlas Manifest (current as of Aug 2026)

## Two source trees — one unified manifest

`kwame-manifest.ts` baseUrl is **`/legacy-character-assets/`** (common root, changed Aug 17 2026).

| Tree | Path | Naming convention |
|---|---|---|
| Old hand-drawn | `hand-drawn/kwame/kwame_{anim}_{dir}/kwame_{anim}_{dir}_{N}.png` | `kwame_idle_down_1.png` |
| New atlas | `kwame-mensah/atlas/{DIR}/{stem}-{dir}-{N}.png` | `interact-down-1.png` |

## Registered animation states (kwame-manifest.ts)

| animState | Frames | Directions | Atlas dir |
|---|---|---|---|
| idle | 8 | down/left/right/up/up_right(8)/up_left(9) | hand-drawn/kwame + RIGHT_Direction + UP_Direction |
| walk | 8-9 | 6 directions | hand-drawn/kwame + RIGHT_Direction + UP_Direction |
| run | 6-7 | down/left/right/up/up_right | RUN_DOWN_LEFT + RUN_UP_RIGHT |
| interact | 8 | 4 cardinal | INTERACT |
| pick_up | 8 | 4 cardinal | PICK_UP |
| inspect | 6 | 4 cardinal | INSPECT |
| hurt | 6 | 4 cardinal | HURT |
| knockback | 6 | 4 cardinal | HURT (same art reused) |
| talk | 4 (cardinal) / 7 (diag) | 6 directions | TALK + TALK_DOWN_LEFT + TALK_UP_RIGHT |

## NOT registered (no art yet)
lightAttack1, lightAttack2, heavyAttack, dash, jump, guard, aerial — fall back to idle.

## Key rules
- UP_Direction walk-up-left has 9 frames (not 8) — do not truncate to 8
- talk-up-right in TALK_UP_RIGHT: exactly 7 files (`talk-up-right-1..7.png`)
- The old hand-drawn/kwame path still exists with 20 dirs; it provides idle/walk 4-cardinal
- Source sheets (full 32-frame atlas PNGs) saved to `kwame-mensah/source-sheets/`

**Why:** The manifest path change (hand-drawn/kwame → unified root) lets both old and new frames share one `CharacterManifest` object without duplicating the interface or forking the loader.

**How to apply:** When adding a new animation, check which atlas directory it belongs to, use `atlasFrames(dir, stem, count)` helper, verify exact frame count from `ls | wc -l` before committing.
