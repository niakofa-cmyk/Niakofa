# What the four new uploads actually are

Being direct about this because it changes what's buildable today vs. what
needs another production step first.

## `Hand_Drawn_Kwame_Mensah.zip` and `Hand_Drawn_Envirnonment_Assets.zip`

**These are concept/pitch-board mockups, not production sprite sheets or
tilesets.** Each of the 8 files is a single flattened AI-generated image
(1536×1024 or 1254×1254) that *illustrates* what a character sheet, a
4-directional walk cycle, a tileset grid, or a building set could look like —
compiled into one poster-style board with baked-in text labels ("IDLE",
"WALK", "FRONT", "TILESET EXAMPLE 64×64", etc).

What this means concretely:
- The "sprite frames" shown in the Kwame boards are part of one continuous
  painting — there's no per-frame transparency, no consistent pixel grid
  across frames, no isolation between a frame and the text/background around
  it. They can't be sliced into a working 4-direction walk cycle by cropping.
- Same for the "tileset" grids in the environment boards — the individual
  tile swatches shown are illustrative, not seamless/tileable source art.
- Nothing in either zip is usable as a drop-in replacement for
  `APPROVED_LAYER_ASSETS` in `legacy-character-engine.ts` today.

**What they're genuinely excellent for:** they're a real, detailed **art
bible**. This is exactly the gap flagged in my last style-gap report (I said
then that the RPG-Maker placeholder sprites don't match the app's painterly
target look, and that producing real matching art "requires either a
commissioned illustrator... or an AI image pipeline run outside this chat").
These 8 boards *are* that brief, likely from exactly such a pipeline. They
also happen to specify hard numbers a production pipeline needs — see
`calibration-sheet.json`, pulled directly from the boards' own annotations
(grid size, frame rate, palette, resolution target, character footprint).

**Recommended next step:** hand these boards to whoever produces final art
(illustrator or a proper AI sprite-generation pipeline with per-frame,
transparent, consistent output — e.g. driving a tool through ControlNet/pose
references per frame, or a human artist tracing the turnaround) as the style
brief. What comes back should be individual PNGs per frame/tile with alpha
transparency, matching the calibration sheet. At that point they slot
directly into the architecture in `ARCHITECTURE_PLAN.md`.

## `lmbs.zip`

Confirmed: this is the raw RPG Maker MV plugin bundle described in the design
doc — `rpg_core.js`, `rpg_objects.js`, `rpg_managers.js`,
`LinearMotionBattleSystem_Core.js`, `MOG_LMBS.js`, `MOG_BattleCamera.js`,
`MOG_BattleHud.js`, `SRD_PreloaderCore.js`, and ~40 more MOG_*/KienLib plugins
— 250 files total.

**Do not import this into the Niakofa codebase.** It's a full second game
engine (RPG Maker MV's own runtime, `rpg_core.js` alone is a from-scratch
canvas/sprite/input engine) written in vanilla ES5 JS, architecturally
unrelated to Niakofa's React/TypeScript stack. Dropping it in would recreate
the exact duplicate-architecture problem found in section 1 of
`BUGS_AND_FINDINGS.md`, just bigger — "a second application architecture
inside the application," which is the specific mistake the original design
document opened by warning against.

**What to actually take from it:** the *concepts*, translated to native
TypeScript. `ARCHITECTURE_PLAN.md` and `scaffold/legacy-animation-fsm.ts`
extract the useful parts — the movement/animation state machine shape, the
camera-follow-with-reframe idea, the hit-frame/action-name feedback pattern —
as a from-scratch TS module with zero RPG Maker code in it.

## `StylooVillageFREEPack.zip`

Same 3D FBX/GLTF village-prop pack already reviewed in the last WorldPack
delivery (houses, carts, fences, benches, street lights — with GLB exports).
Confirmed again: Tier-4, "future 3D Living World" reference only. Not part of
the current 2D/2.5D map system. No change to that recommendation.
