# Implementing the Kwame 32-Frame Atlas into Niakofa Legacy RPG + Demo

This is the concrete "how" — wiring `kwame_atlas/packaged/verified/*` into the
actual codebase, using the enforcement gate from the last rebuild pack
(`legacy-hand-drawn-assets.ts`) so Kwame renders as hand-drawn art, not the
RPG-Maker chibi placeholder, anywhere the policy requires it.

## Step 1 — Land the frames as static assets

```
artifacts/pay-it-forward/public/legacy-character-assets/hand-drawn/kwame/
  idle-up/           (from verified/up-direction, rows 0)
  walk-up/            (verified/up-direction, row 1)
  idle-up-left/        (verified/up-direction, row 2)
  walk-up-left/         (verified/up-direction, row 3)
  idle-right/          (verified/right-direction, row 0)
  walk-right/           (verified/right-direction, row 1)
  run-up-right/          (verified/run-up-right, all rows)
  interact/               (verified/interact, all rows)
  talk-up-right/           (verified/talk-up-right, all rows)
  hurt/                     ("needs-manual-regrid/hurt" -- regrid first, see below)
```

Regrid `hurt/`, `run-down-left/`, `talk/`, `inspect/`, `pick-up/`,
`talk-down-left/` before landing them — `kwame_atlas/packaged/README.md`
explains exactly why those six didn't auto-slice cleanly. Don't skip this:
`hurt`/knockback frames are the one combat-relevant art asset that already
exists (see `COMBAT_SYSTEM.md`), so it's worth the extra few minutes to fix
that one specifically before the other five.

## Step 2 — Register them in the asset engine

Extend `legacy-character-engine.ts`'s `APPROVED_LAYER_ASSETS` (or add
alongside it, per `legacy-hand-drawn-assets.ts` from the last pack) with
records like:

```ts
{
  assetId: "kwame-hand-drawn-idle-up",
  representation: "TV",
  ageGroup: "youth",
  gender: "male",
  artTier: "handDrawn",          // <-- the field the enforcement gate checks
  animState: "idle",
  facing: "up",
  frameCount: 8,
  frameFiles: [
    "hand-drawn/kwame/idle-up/up-direction_r0_c0.png",
    "hand-drawn/kwame/idle-up/up-direction_r0_c1.png",
    // ... through _c7
  ],
  fps: 8,
  source: "Hand_Drawn_Kwame_Mensah 32-frame atlas, extracted 2026-08-15",
}
```

This is additive — nothing about the existing pixel-sprite records changes;
Kwame simply now has an `artTier: "handDrawn"` option available where before
he only had `prototypePixel`.

## Step 3 — Point Kwame's character record at it

Wherever Kwame's `characterId: "kwame-mensah"` is resolved (the design notes'
"deterministic identity" — same `characterId` + `appearanceSeed` always
resolves the same visual), set `role: "protagonist"`. Per
`legacy-hand-drawn-assets.ts`'s `enforceArtTierPolicy()`, this now requires
`artTier: "handDrawn"` — which is exactly what step 2 registered. Kwame
switches from the pixel placeholder to the real hand-drawn frames the moment
his asset records exist and his role is set, with no other code change.

## Step 4 — Wire the animation FSM to the new frame counts

`legacy-animation-fsm.ts`'s `ANIM_SPEC` currently has *generic* placeholder
frame counts (idle: 6, walk: 8, etc.) written before real art existed. Update
it per character now that real data exists — e.g. Kwame's idle-up is
genuinely 8 frames at whatever fps you land on (the calibration sheet
suggested 6–10fps for idle; these atlases were captioned `-1` through `-8`,
so 8 frames fits cleanly at 8fps for a 1-second loop). Directions without
extracted frames yet (down-facing, left-facing walk/run) keep using
`prototypePixel` or the placeholder marker from `enforceArtTierPolicy()`
until they're extracted too — this is a partial rollout, not all-or-nothing.

## Step 5 — Render in `legacy-chapter.tsx` / the demo

Per `BUGS_AND_FINDINGS.md`, `legacy-chapter.tsx` currently has zero map/sprite
rendering — it's the right place to land the **first real playable scene**,
not a retrofit. Minimum viable version for the demo:

1. Mount a `LegacyCharacterSprite`-style component that reads
   `LegacyActorController.state` (position/facing/anim/frame) each render
   tick and draws the matching frame from Kwame's new hand-drawn asset
   record instead of the pixel sheet's CSS background-position math.
2. Drive it with keyboard input → `LegacyActorController.tick()` (already
   in the last rebuild pack) → re-render.
3. Place it over one static background from `art-bible/environment/` (as a
   backdrop image, not yet a real tileset — that's still the map-engine
   work in `ARCHITECTURE_PLAN.md` §3) so there's an actual moving,
   hand-drawn Kwame walking on screen for the demo, today, without waiting
   on the full map system.

That's a real, honest "Kwame walks around" demo milestone — small, but it's
the first frame of actual gameplay per `BUGS_AND_FINDINGS.md`'s finding that
none exists yet, and it's built on genuine hand-drawn frames, not a stand-in.

## Step 6 — Combat hookup (once attack/jump/dash frames exist)

`LegacyCombatController` (scaffold) is already usable today at the
physics/state level even with zero attack art — hitboxes, damage, SP, combo
timing all work. Wire `lightAttack()`/`jump()`/`dash()` to input, and let
`COMBAT_ANIM_SPEC`'s `artStatus: "placeholder"` flag drive a visible "art
pending" box (same rule as the character-role gate: never silently substitute
the wrong tier). `knockback` already has real art via the (regridded) `hurt`
frames — that's the one combat state that can look finished today.

## Priority order if you're producing more atlas frames next

1. **`down` direction** (idle-down, walk-down) — missing entirely, and it's
   the default-facing camera angle in a top-down RPG, used more than any
   other direction
2. Regrid the 6 failed/suspect files from this pass (`hurt` especially, for
   combat)
3. `attack-light`, `jump`, `dash`, `guard` — unlocks real combat art per
   `COMBAT_SYSTEM.md`'s "what this needs from the art pipeline" list
4. `left`-facing walk/run (currently only up/right variants came through
   cleanly)
