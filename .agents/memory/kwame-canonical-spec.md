---
name: Kwame Mensah Canonical Character Spec
description: Canonical character specs, color palette, art asset locations, and character evolution pipeline for Kwame Mensah — the calibration character for the entire Niakofa Legacy RPG world.
---

## Identity
- Name: Kwame Mensah · Age 16 · Year 1912 · Cape Coast, Gold Coast
- Role: Student / Protagonist · Status: Alive
- Route: `/legacy/kwame` (public, no auth) — `src/pages/legacy-kwame.tsx`

## Color Palette (canonical from Art Bible)
- Skin: #3D2116 · Skin Hi: #7B4A2D · Hair: #1A0F08
- Shirt: #D4C5A0 · Pants: #8B7355 · Sandals: #5C3D1E
- Accent: #B87333 · Env Warm: #C4A882

## Art Assets (canonical public locations)
- `public/legacy-character-assets/kwame/kwame-master-reference.png` — primary spec sheet
- `public/legacy-character-assets/kwame/kwame-character-sheet-v1.png` — combat poses
- `public/legacy-character-assets/kwame/kwame-4direction-sprites.png` — 4-dir sprite sheet
- `public/legacy-character-assets/kwame/kwame-fullspec-combat.png` — full spec + dialogue
- `public/legacy-character-assets/kwame/kwame-ingame-preview.png` — in-game viewport
- `public/legacy-environment-assets/niakofa-environment-full-sheet.png` — tileset + buildings
- `public/legacy-environment-assets/niakofa-environment-assets-dark.png` — dark theme env

## World Scale (Kwame = calibration character)
- Height: 1.65m = 2.5 tiles in-game · Footprint: 32×48 px · Tile: 64×64 px
- All environment scale derives from Kwame's height (doorways ≥ 3 tiles, streets ≥ 6 tiles)

## Animation States × 4 Directions
IDLE (4-8f, 6-10fps) · WALK (6-8f, 8-12fps) · RUN (6-8f, 10-14fps)
TALK (2-4f, 8fps) · INTERACT (4-8f, 10fps) · INSPECT (4-6f, 8fps) · HURT (4-6f, 10fps)
Directions: down (FRONT) · right · up (BACK) · left

**Why:** "up" direction = back view (away from camera); never use "back" as a facing type.
`KwameSilhouette` type is `"down" | "left" | "right" | "up"` — "back" is not a valid value.

## Character Evolution
- Age 16 (1912): Simple cotton shirt, short trousers, village sandals · Chapter 1
- Age 25 (1921): Merchant clothing, leather satchel
- Age 50 (1946): Elder's robes, heirlooms, staff

## Art Bible
Full canonical spec lives at: `docs/NIAKOFA_ART_BIBLE.md`
