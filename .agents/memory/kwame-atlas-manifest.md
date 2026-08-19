---
name: Kwame Atlas Manifest
description: baseUrl, directory layout, and frame-naming conventions for all 784 Kwame Mensah animation frames; what's registered vs still placeholder.
---

# Kwame Atlas Manifest (current as of Aug 2026)

## Source and runtime trees — one unified manifest

`kwame-manifest.ts` baseUrl is **`/legacy-character-assets/`** (common root, changed Aug 17 2026).

| Tree | Path | Naming convention |
|---|---|---|
| Old hand-drawn | `hand-drawn/kwame/kwame_{anim}_{dir}/kwame_{anim}_{dir}_{N}.png` | `kwame_idle_down_1.png` |
| New atlas | `kwame-mensah/atlas/{DIR}/{stem}-{dir}-{N}.png` | `interact-down-1.png` |
| Production sheet runtime | `kwame-mensah/runtime-sheets/{atlas}.png` | one transparent 2048×1024 sheet, sliced in memory |

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
- RGB source sheets (full 32-frame atlas PNGs) stay in `kwame-mensah/source-sheets/`; the live Legacy world uses derived transparent sheets in `runtime-sheets/`

**Why:** The supplied source boards include baked checkerboard/guide pixels rather than alpha. Keeping them as provenance and deriving transparent runtime sheets preserves the art contract while avoiding both visual artifacts and hundreds of rate-limited frame requests.

**How to apply:** When adding a new animation, prefer one transparent runtime sheet and an in-memory slice manifest. Keep raw source boards separate; only use the exploded-frame manifest for migration/custom packs.
