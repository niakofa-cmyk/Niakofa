# Pixel DarkNinja — Animation Pipeline Reference

**Source:** `Pixel_DarkNinja_32px.zip`  
**Art tier:** `prototypePixel` — NOT for use as Kwame Mensah or any hand-drawn character  
**Purpose:** Combat animation pipeline reference and structural model for Kwame's pending combat clips

## Why This Exists

Kwame Mensah's 36 combat-specific clips (attack, dash, jump, guard, aerial)
are still undrawn. This DarkNinja asset set establishes the expected **frame
counts, animation structure, and timing** that Kwame's combat artist should
match. It is a pipeline spec, not a substitute for hand-drawn art.

Kwame's `artTier: "handDrawn"` enforcement gate in `legacy-character-asset-engine.ts`
will throw visibly if a `prototypePixel` asset reaches a protagonist render slot —
this set is intentionally gated out of Kwame's render pipeline.

## Frame Inventory (101 total, 32×32 px per cell)

| Animation | Frames | Notes |
|---|---|---|
| Attack1 | 6 | Light combo opener |
| Attack2 | 6 | Combo link |
| Attack3 | 6 | Heavy finisher |
| Defend | 8 | Parry/block stance |
| Jump | 12 | Full arc: rise → peak → fall → land |
| Idle | 8 | Breathing cycle |
| Move | 8 | Walk/run cycle |
| Hurt | 3 | Knockback reaction |
| Invisibility | 14 | Vanish effect |
| Teleport1 | 16 | Dash/blink exit |
| Teleport2 | 14 | Dash/blink entrance |

## Structural Spec for Kwame's Combat Artist

Based on DarkNinja conventions, apply these targets to Kwame's pending clips:

| Kwame clip group | Reference | Target frames |
|---|---|---|
| light-attack-{dir} | Attack1 (6f) | 6–8 frames |
| heavy-attack-{dir} | Attack3 (6f) | 8–10 frames |
| dodge-{dir} | Teleport1 (16f) trimmed | 8 frames |
| guard-{dir} | Defend (8f) | 8 frames |
| jump-start-{dir} | Jump rows 0–4 (12f total) | 4 frames |
| rising-{dir} | Jump rows 4–8 | 4 frames |
| falling-{dir} | Jump rows 8–12 | 4 frames |
| aerial-attack-{dir} | Attack2 (6f) | 6 frames |
| land-{dir} | Jump final 2f | 2 frames |

## Cell Geometry (consistent with Kwame 32-frame atlas)

- Cell size: 32×32 px (matches DarkNinja)
- Baseline: character bottom at row px 28 of 32
- Center: horizontally centered in cell
- Atlas layout: N rows × M columns, `_rN_cM.png` naming matches Kwame v2 convention

## Pending Kwame Clips (36 total)

From `KWAME_PENDING_ART_CLIPS` in `kwame-sprite-atlas.ts`:

```
light-attack-{down,left,right,up}   (4 clips)
heavy-attack-{down,left,right,up}   (4 clips)
dodge-{down,left,right,up}          (4 clips)
guard-{down,left,right,up}          (4 clips)
jump-start-{down,left,right,up}     (4 clips)
rising-{down,left,right,up}         (4 clips)
falling-{down,left,right,up}        (4 clips)
aerial-attack-{down,left,right,up}  (4 clips)
land-{down,left,right,up}           (4 clips)
```

Once delivered, add frames to `KWAME_ATLAS_FRAMES` in `kwame-sprite-atlas.ts`
and remove the clip name from `KWAME_PENDING_ART_CLIPS`.

## Files

Located at: `public/legacy-reference-docs/animation-reference/darkninja/frames/`
- `Attack1/`, `Attack2/`, `Attack3/` — 01.png–06.png each
- `Defend/` — 01.png–08.png
- `Jump/` — 01.png–12.png
- `Idle/`, `Move/` — 01.png–08.png
- `Hurt/` — 01.png–03.png
- `Invisibility/` — 01.png–14.png
- `Teleport1/` — 01.png–16.png
- `Teleport2/` — 01.png–14.png
