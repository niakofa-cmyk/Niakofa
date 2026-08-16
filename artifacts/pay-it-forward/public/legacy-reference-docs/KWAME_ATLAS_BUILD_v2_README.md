# Kwame Mensah — Full Hand-Drawn Build (v2)

Complete extraction pass using the consolidated `Hand_Drawn_Kwame_Mensah.zip`,
which turned out to contain all 12 atlas files (not just the 5 from last
time) plus the RPG Maker MV sheet. Switched from per-file grid *detection*
(fragile — character art occasionally crossed the sample scanline) to
**fixed grid geometry**, measured once from the cleanest file and applied
uniformly, since all 12 hand-drawn atlases share the same generator template.
Result: **all 12 hand-drawn atlases now extract cleanly — 384 real frames,
every one visually spot-checked.**

## What changed from v1

- **The missing DOWN direction is filled.** The unsuffixed
  `Kwame Mensah 32-Frame Hand-Drawn Animation Atlas.png` file (present in
  this upload) turned out to be the DOWN + LEFT direction set —
  `down-left-master/` now has real idle-down, walk-down, idle-left, walk-left
  frames. This was the single biggest gap flagged last time.
- **The 6 previously-failed atlases are fixed** (`hurt`, `inspect`,
  `pick-up`, `run-down-left`, `talk`, `talk-down-left`) — all extract
  cleanly now with the fixed-geometry approach.
- **The RPG Maker MV sheet is extracted too**, per your instruction to use
  it — 70 frames in `rpg-maker-mv-prototype/`, tagged `artTier:
  "prototypePixel"`, **not** `"handDrawn"`.

## Coverage — what Kwame can now do, by art tier

| Action | Directions covered (hand-drawn) | Source |
|---|---|---|
| Idle | down, up, left, right (+ diagonals) | down-left-master, up-direction, right-direction |
| Walk | down, up, left, right (+ diagonals) | same as above |
| Run | up, right, down, left (+ diagonals) | run-up-right, run-down-left |
| Talk | down, up, left, right | talk, talk-up-right, talk-down-left |
| Interact | down, up, left, right | interact |
| Inspect | down + variants | inspect |
| Pick up | down, left, right, up | pick-up |
| Hurt / knockback | down, up, left, right | hurt |
| **Attack / dash / jump / guard / aerial** | **none** | not in any upload yet — still the real gap for `COMBAT_SYSTEM.md` |

Full movement, talk, interact, and reaction animations are now **100%
hand-drawn-sourced**. Combat-specific frames are the one remaining gap.

## On the RPG Maker MV sheet specifically

Extracted as instructed, but flagged `prototypePixel`, which matters
concretely: per `legacy-hand-drawn-assets.ts`'s enforcement gate from the
combat pack, Kwame's `role: "protagonist"` requires `artTier: "handDrawn"`
for anything that resolves in a real chapter scene. Since hand-drawn coverage
is now complete for every non-combat action, **there's no actual gap left
for the RPG Maker frames to fill for Kwame** — they'd only be used if the
policy were deliberately relaxed, or for a different character (e.g. a
`background`-role NPC, where `prototypePixel` was always allowed). I extracted
and included them per your instruction, but left the enforcement policy as-is
rather than quietly loosening it, since you didn't ask for that — say the word
if you want background NPCs specifically to use this sheet.

## Known remaining cleanup (same as v1, still true)

- Small in-cell caption text ("idle-up-1" etc.) is still baked into each
  hand-drawn frame — cosmetic, not blocking, worth a cropping pass before
  final ship.
- `KWAME_FULL_BUILD_MANIFEST.json`'s `likelyCovers` labels for some
  atlases (e.g. exact diagonal-direction naming) are my best read from the
  visible in-frame captions, not exhaustively OCR-verified frame-by-frame —
  spot-check against the actual caption text before wiring into
  `legacy-character-engine.ts` if a specific direction matters for a scene.
