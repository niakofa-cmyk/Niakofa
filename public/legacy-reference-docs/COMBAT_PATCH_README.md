# Niakofa Legacy — Real-Time Combat (Path A)

Path A, as decided in chat: semi-top-down exploration stays the default
(nothing about it changed), and a dedicated side-view battle scene is
triggered from it — real gravity/jump physics, aerial combos, dash i-frames,
a skill system — then hands control back. No engine migration; this is
the Godot client's PlayerController logic, done for real in the actual web
stack (PixiJS/TypeScript), verified against the real compiler and library
the same way every patch before the Godot one was.

## Apply

```bash
git checkout -b realtime-combat
git apply --check niakofa-realtime-combat.patch
git apply niakofa-realtime-combat.patch
```

Or copy the three files in `files/` over your working tree.

## What's in here

**New: `legacy-battle-scene.tsx`** — the actual combat scene.
- Real gravity/jump physics (not the top-down grid's row/column movement —
  genuine `vy`, gravity accumulation, ground collision)
- **3-hit ground combo** (each hit different reach/damage/knockback) and a
  **separate 2-hit aerial combo** (attack while airborne — the specific
  thing a top-down grid structurally can't do, now real)
- **Dash** with real i-frames (a defensive option, not just a speed burst —
  dashing through an enemy's telegraphed attack window avoids the hit)
- **One skill** ("Legacy Burst" — ties into the existing Legacy stat
  already used elsewhere in this game's HUD): builds a meter from landed
  hits, unleashes a big AoE when full
- A simple enemy AI with a real read-and-react loop: idle → approach →
  **telegraph** (visibly flashes red before attacking — the player has a
  window to dash through it) → attack → recover
- All hit detection is real frame-timed AABB overlap against active
  hitbox/hurtbox rectangles, not instant on-press damage

**Modified: `legacy-chapter-world.tsx`** — added a permanent "Training
Ground" landmark (⚔️) to the exploration world. It's generated
client-side at a deterministic, collision-free position near spawn — not
tied to real family scene data, deliberately: inventing a "combat
encounter" attached to someone's actual family history isn't something
this world should do implicitly. Walking onto it fires the new
`onEnterBattle` callback.

**Modified: `legacy-chapter.tsx`** — wires that callback to open
`LegacyBattleScene` as a full-screen overlay, same pattern as the existing
Journal/Map overlays. Win/lose/flee all just close the overlay — this is a
practice ground, no permanent stat loss on defeat.

## A real bug this caught and fixed — twice

1. **TypeScript caught a genuine logic risk during development**, not just
   a style nit: the win-condition flag (`outcomeRef.current = "victory"`)
   was originally set inside a nested helper function
   (`applyDamageToEnemy`), and TypeScript's control-flow analysis silently
   excluded `"victory"` from the type at the final win/loss check —
   meaning that check would never have fired correctly at runtime either.
   Fixed by moving the win-condition check to the ticker's top-level body
   (mirroring how the defeat check already worked correctly), not by
   suppressing the type error. See the comment at that check in
   `legacy-battle-scene.tsx` for the specifics.
2. **While wiring the battle overlay in, I found the same input-leak bug
   already existed for the Journal and Map overlays from the earlier
   patches**: `legacy-chapter-world.tsx`'s keyboard listener stayed active
   underneath any full-screen overlay, so arrow keys would move the hidden
   exploration character at the same time as whatever was on top of it.
   Added an `inputEnabled` prop and wired it to `!battleOpen && !journalOpen
   && !mapOpen && !placeSheetOpen` — fixed for all four overlays, not just
   the new one.

## Verification

All three files syntax-checked clean (`tsc`, zero `TS1xxx` errors) against
this repo's actual context. `legacy-battle-scene.tsx` additionally went
through the same real-library rigor as the PixiJS renderer patch:
compiled against actual installed `pixi.js@8.6.0` + `react`/`@types/react`
(ticker callbacks, `Graphics.clear()`/redraw, `Text.text` mutation — all
verified against the real library before writing the final file, not
assumed from memory), and the TS2367 error above is the real compiler
catching a real bug, not a fabricated example.

## What this does NOT do yet

- **No real side-view battle sprites.** Player/enemy are colored
  rectangles — same "real logic, placeholder visuals" honesty as every
  world-rendering patch so far. `legacy-character-engine.ts` already
  reserves an `"SV"` (side-view) representation type alongside `"TV"`
  (walking) for exactly this, but there's no resolver function for it yet
  and no verified SV asset catalog data to resolve against — noted, not
  invented.
- **One enemy type, one arena.** No enemy variety, no real
  difficulty/level design, no loot/rewards for winning — this is the
  combat *system* working end-to-end, not content built on top of it.
- **Training Ground is the only trigger point.** Real story-integrated
  encounters (a specific chapter moment escalating into combat) aren't
  wired up — that needs a product decision about which chapter beats
  actually call for it, not something to invent unilaterally against real
  family history content.
