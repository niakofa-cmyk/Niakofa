# Niakofa Legacy — Living World Engine (core)

This is a real, tested, framework-agnostic implementation of the pieces the
design doc described as missing: **WorldState**, **TimeManager**,
**WeatherManager**, a **data-driven AnimationController** (hitboxes tied to
authored frames, not a timer), and a full **combat pipeline**
(input → animation → hitbox → collision → damage → knockback → recovery),
plus `PlayerController` and `EnemyController` state machines built on top
of it.

It is a **new package**, not a patch to the existing `Niakofa` monorepo,
because the repo audit found that repo's `legacy-*.tsx` components don't
currently contain this engine at all — there was nothing to patch. Drop
this in as a dependency of `artifacts/pay-it-forward` (see "Integrating"
below) and replace the ad-hoc parts of `legacy-chapter-world.tsx` with it
incrementally.

## Real art is now wired in (update: processed your Kwame + environment packs)

You uploaded `Hand_Drawn_Kwame_Mensah_2.zip` and `Hand_Drawn_Envirnonment_Assets_2.zip`. Here's exactly what I did with them and what's honestly still missing.

### What the source packs actually were

Both packs are AI-generated (ChatGPT image tool) **contact-sheet atlases**, not slice-ready exports:
- Grid spacing is consistent but not pixel-uniform (frame columns vary ~223-229px, not a clean fixed number).
- Most character atlases have a per-cell **caption baked into the pixels** (e.g. "idle-right-1") that had to be cropped out, not just a filename.
- **None of the source PNGs have a real alpha channel** (`PIL` reports `mode: RGB` on every one) - the checkerboard "transparency" you see is drawn pixels, not actual transparency. Unusable in a renderer as-is.
- The character production spec sheet included in the pack (`kwame_mensah_hand_drawn_character_production_spec.png`) documents a canonical **256×256 cell, baseline Y=224, center X=128, 12fps authoring** contract - I extracted every frame onto that grid so all clips share one ground plane.

### What I built: `tools/sprite-extractor/`

A real, reusable CLI tool (`extract.py`) - the "sprite-extractor" the design doc referenced but that didn't exist in the repo. It:
1. Auto-detects each atlas's actual grid lines (handles the non-uniform spacing).
2. Crops out baked-in caption text.
3. Converts the fake checkerboard/white background to **real alpha** using saturation+brightness matting (verified: doesn't eat the cream-colored shirt, does remove the checkerboard).
4. Tight-crops to content and re-places every frame on a shared 256×256 canvas at the spec's baseline, so every clip - regardless of the source art's original crop - lines up on the same feet-position.
5. For environment **tiles** (grass/dirt/sand/etc.) it skips the matting step entirely, because a full-bleed stone or sand texture would otherwise get holes punched in it by the same "remove desaturated-bright pixels" rule that correctly strips a checkerboard from behind a character.

Run it yourself: `python3 tools/sprite-extractor/extract.py --config tools/sprite-extractor/kwame-manifest.json --atlas-dir <path-to-unzipped-pack> --out assets/kwame` (needs `pillow`, `numpy`; `pip install pillow numpy`).

### What's now real, verified, working art (not placeholder)

| Asset | Count | Verified by |
|---|---|---|
| Kwame idle + walk, 6 directions (down/left/right/up/up-left/up-right) | 12 clips × 8 frames = 96 frames | `src/__tests__/asset-integrity.test.ts` - every frame file exists on disk |
| Kwame hurt reaction, 4 directions | 4 clips × 6 frames = 24 frames | same |
| Kwame talk gesture, 4 directions | 4 clips × 4 frames = 16 frames | same |
| Ground tiles: grass, dirt, path, cobble, sand, water-edge | 6 types × 8 variants, 128×128 | visual QA (`env_preview.png` during build) |
| Buildings: compound, hut, trading house, church, mission school, colonial admin | 6 types × 11 variants each | visual QA |
| Structures/props: fence, gate, wall, well, chest, market stall | 6 types × 11 variants each | visual QA |

All of it lives under `assets/kwame/<clipId>/<clipId>_<n>.png` and `assets/environment/<clipId>/<clipId>_<n>.png`, described by `src/data/kwame-locomotion.json` and `assets/environment-manifest.json`.

### What's still genuinely missing (be aware)

- **No attack/dodge/guard/jump-attack art.** The character spec itself lists the "combat pass" as a *next pass*, not done - your source pack has no such frames. `src/data/kwame-animations.json` (the original placeholder file from the first delivery) still describes fictional attack/dodge/stagger/recovery clips with made-up hit-frame numbers, used only so `CombatController`'s logic has something to test against. Once real attack art exists, run it through `sprite-extractor` the same way and swap `kwame-animations.json`'s clips for real ones - the combat *logic* doesn't change at all.
- **No down-left / down-right idle+walk art** - only 6 of 8 compass directions were drawn. `src/animation/direction.ts` documents and tests the fallback (folds those two onto left/right).
- **`PixiActorAdapter` (`src/examples/PixiAdapter.ts`) is still unverified against a live `Application`** - this sandbox has no display. It does now point at asset paths that actually exist and are the right shape (`${clipId}_{n}.png`), which they didn't before.
- Buildings/structures were matted with the same character-style background removal, tuned for skin/cloth colors - inspect them yourself for edge cases (e.g. very light-colored buildings) before shipping; I did a visual spot-check, not a pixel audit of all 132 building/structure/prop frames.

---



| Piece | File | Verified by |
|---|---|---|
| Persistent world document, versioned, additive regeneration | `src/core/WorldState.ts` | headless demo, type-checked |
| Simulation clock (dawn/morning/midday/afternoon/sunset/evening/night) | `src/core/TimeManager.ts` | headless demo (`[time] day 1 07:00 -> phase "morning"`) |
| Simulation-driven weather (not quest-triggered VFX) | `src/world/WeatherManager.ts` | headless demo (`[weather] clear -> cloudy -> light_rain -> ...`) |
| Data-driven animation clips with frame-accurate hit windows | `src/animation/AnimationController.ts`, `src/data/kwame-animations.json` | `src/__tests__/combat.test.ts` — "hitbox is only active on authored hit frames" |
| Hitbox vs. hurtbox AABB collision | `src/combat/HitboxSystem.ts` | test — "a target outside the hitbox never takes damage" |
| Damage, knockback, hit reactions, defeat | `src/combat/DamageSystem.ts` | test — "lethal damage transitions the target to defeated" |
| Full combat state machine (idle→walk→attack/dodge→hurt→stagger→recovery→idle) | `src/actors/ActorState.ts`, `src/combat/CombatController.ts` | test — "attack -> recovery -> idle happens automatically" |
| Enemy AI (idle→patrol→detect→chase→attack→recover) | `src/actors/EnemyController.ts` | headless demo (bandit fights back and is eventually defeated) |
| PixiJS v8 rendering adapter (sprite/texture glue only) | `src/examples/PixiAdapter.ts` | type-checked against pixi.js 8.6.0; **not asset-tested** — you don't have Kwame's real exported frames in this sandbox |

Run it yourself:

```bash
npm install
npm run typecheck   # tsc --noEmit, strict mode, zero errors
npm test            # 6 passing combat-correctness tests (node:test)
npm run demo:headless   # simulates a full fight + a day/night + weather cycle, no renderer
npm run build        # emits dist/ with .d.ts declarations
```

## What is *not* in this package (be aware)

- **No NPCSchedule engine** (villagers moving to compound/farm/market by
  time of day) — `WorldState.npcs[id].location` exists as a field for it,
  and `npc:scheduleChanged` fires when it changes, but nothing yet decides
  *when* to change it. That's the natural next system to add, following
  the same pattern as `WeatherManager`.
- **No quest generation from world events** ("uncle didn't return from the
  farm" → quest) — `WorldState.quests` and the `quest:unlocked` /
  `quest:completed` events exist for a quest layer to plug into; the
  generation logic itself isn't written.
- **No family-knowledge → world-regeneration pipeline** (interview
  transcript → new NPC/landmark/quest) — `WorldState.mergeContentSeed()`
  is the additive-merge primitive that layer would call; nothing produces
  seeds yet.
- **No real sprite art wiring** — `PixiAdapter.ts` expects textures at
  `${baseUrl}${clipId}_${frame}.png` (e.g. `kwame_attack_01_6.png`). It
  type-checks against pixi.js but was never run against a live `Application`
  because this sandbox has no display and no access to your actual asset
  files under `artifacts/pay-it-forward/public/legacy-rpg-assets/`.

Don't take "engine builds and tests pass" to mean "the game is done" —
it means the combat/time/weather **logic** is real and correct. Wiring it
to your actual art and to the rest of `pay-it-forward`'s React tree is the
next step, and worth doing incrementally rather than in one big swap.

## Integrating into `artifacts/pay-it-forward`

1. Copy this folder in as e.g. `artifacts/pay-it-forward/packages/legacy-engine/`,
   or `npm install` it as a local path dependency:
   ```json
   "dependencies": { "niakofa-legacy-engine": "file:./packages/legacy-engine" }
   ```
2. In `legacy-chapter-world.tsx`, replace whatever currently owns combat/time
   state with one `LivingWorld` instance (see `src/LivingWorld.ts`), created
   once per session (e.g. in a `useRef` so it survives re-renders):
   ```ts
   const worldRef = useRef<LivingWorld>();
   if (!worldRef.current) worldRef.current = new LivingWorld();
   ```
3. Drive it from Pixi's ticker, not `requestAnimationFrame` directly, so
   timing matches whatever Pixi `Application` the component already owns:
   ```ts
   app.ticker.add((ticker) => worldRef.current!.tick(ticker.deltaMS / 1000));
   ```
4. Replace hand-rolled sprite/frame logic with `PixiActorAdapter` (see
   `src/examples/PixiAdapter.ts`) once you point `baseUrl` at your real
   exported Kwame frames from the sprite-extractor tool.
5. Author real hit-frame data for Kwame's actual attack animation by editing
   `src/data/kwame-animations.json` — the `hitFrames` / `hitbox` values
   there are illustrative placeholders (based on the design doc's own
   example numbers), not measured against real exported frames.

## On the master reference docs

The original request also asked to refresh `NIAKOFA_LEGACY_REFERENCE.md`
and the `.agents/memory` files. I did not do that here, since you chose to
prioritize the engine code, and writing that doc *before* this code existed
would have documented aspirational architecture as if it were shipped —
which is the exact problem the repo audit found in the first place. Once
you've integrated and adjusted this engine against real assets, updating
the reference docs to describe *this* (the actual, working architecture)
is a fast, low-risk follow-up — say the word and I'll write it.
