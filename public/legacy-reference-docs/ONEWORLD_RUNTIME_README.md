# Niakofa Legacy — PixiJS Game Runtime + One-World System (real, typechecked code)

## Read this first: repo mismatch

I fetched `github.com/niakofa-cmyk/Niakofa`'s actual README (twice, to be
sure) before writing any code this round. **It describes a completely
different product**: "Niakofa — Community Help Platform," a pay-it-forward
mutual aid app for Tarrant County, TX — Mapbox map, Stripe payments, help
requests, `/wallet`, `/community`, `/admin` routes. Its documented stack
(Wouter routing, Drizzle ORM, Orval codegen, BullMQ) and "Product Screens"
table have **zero mention** of Legacy Mode, Kwame, chapters, fishing, or
anything from this entire build thread.

I can't reconcile this from here — possibilities: wrong URL, a private
branch/fork, or the Legacy RPG work exists only in the `Niakofa-main.zip`
uploaded earlier in this conversation and was never pushed to this public
repo. **Everything in this package is built against `Niakofa-main.zip`**
(the actual source inspected throughout this thread — confirmed real:
`legacy-character-engine.ts`, the duplicate-tree bug, etc.), not against
whatever is actually live at that GitHub URL today. Worth resolving before
merging any of this — point me at the right repo/branch and I'll re-verify
against it directly.

## What's new this round: the One-World system

Implements the "no outside panels or components — one livable world"
requirement. Chapter scenes, Living Relationships, Fishing/River Memory, and
What Remains are now all the same three shapes (`WorldLocation`,
`WorldActivity`, `WorldMutation`) instead of four separate systems:

| File | What it is |
|---|---|
| `legacy-world/types.ts` | The three shared shapes. `runtime: "inline" \| "focused"` is the mechanism that keeps everything inside one PixiJS world — `"focused"` means camera/controls narrow (e.g. fishing), **never that the world unmounts** |
| `legacy-world/locations.ts` | The Home Region registry — compound, trading post, river bank, jetty, What Remains ruins, elder's home, all as real `WorldLocation`s |
| `legacy-world/activities.ts` | Fishing, What Remains, Living Relationships (elder dialogue), and a Chapter 1 objective — all as `WorldActivity`s producing `WorldMutation[]` |
| `legacy-world/fishing-runtime.ts` | The recurring in-world fishing minigame — state machine (idle→casting→waiting→bite→reeling→catch/fail), River Memory chance built in |
| `legacy-world/mutations.ts` | Applies mutations to a persistent world state (journal, relationships, inventory, memory echoes) |
| `legacy-world/geometry.ts`, `runtime-interaction.ts` | Player-position → location/activity detection, plus a React-side mirror hook for UI chrome |

**`LegacyGameCanvas.tsx` was rewired**, not just extended: `tryInteract()`
now dispatches through `evaluateInteraction()` into the real activity
system. Fishing specifically demonstrates the "focused, not away" rule —
walk to the river bank, press Space, the prompt changes to fishing controls,
the PixiJS canvas **never unmounts or navigates**, Space becomes hook/land,
Escape cancels back to free movement. This is the concrete, working version
of the design doc's Phase 2 (its own stated highest priority).

## On FishSettings.xls / fishing.zip

Confirmed: `FishSettings.xls` is a parameter-string generator for **Galv's
MV Fishing Mini Game**, an RPG Maker MV plugin; `fishing.zip` is that
plugin's graphic assets (rod, bait, splash, surface/underwater fish sprites).
Same rule as LMBS and the RPG Maker character generator throughout this
project: **useful as a mechanics reference, never imported as code.**
`fishing-runtime.ts` reimplements Galv's own fish-parameter shape (graphic/
speed/pull/moveType/level/detect-range/take-range/baits) as native
TypeScript (`FishSpecies` in the same file) — no RPG Maker code anywhere in
it.

## Everything from the previous round, unchanged

| File | What it is |
|---|---|
| `legacy-animation-fsm.ts`, `legacy-combat-fsm.ts`, `legacy-hand-drawn-assets.ts`, `legacy-map-engine.ts` | Carried over unchanged from the earlier rebuild packs — pure state/types, renderer-agnostic, confirmed still correct against this real renderer |
| `legacy-asset-loader.ts` | **New.** Loads extracted PNG frames into PixiJS `Texture`s, indexes character frames by `(animState, facing)`, with a visible-fallback resolver (never silently swaps art tiers) |
| `legacy-scene-renderer.ts` | **New.** Builds the full layer stack from `RUNTIME_ARCHITECTURE_UPDATE.md` (ground→decoration→building→prop→actors→foreground), renders a `LegacyMapScene`'s static layers, depth-sorts actors by y-position each frame |
| `legacy-actor-sprite.ts` | **New.** Bridges `LegacyActorController`/`LegacyCombatController` state to a real `AnimatedSprite` — this is where "the atlas becomes gameplay art" actually happens |
| `LegacyGameCanvas.tsx` | **New.** The mountable React component — boots a PixiJS `Application`, runs the 60fps game loop, wires keyboard input (arrows/WASD move, Shift runs, Space interacts, J/K attack, L jumps) |
| `kwame-manifest.ts` | **New.** Kwame's real character manifest, built from the actual filenames in `Kwame_Mensah_Full_HandDrawn_Build_v2.zip` — movement/talk/interact/hurt fully mapped; combat states left deliberately unregistered with a comment explaining why (no art exists yet) |
| `scene-cape-coast-compound.ts` | **New.** A real sample scene using actual filenames from `Niakofa_Environment_Assets_v1.zip` — not a placeholder example |

## What this does NOT include

The real `legacy-character-engine.ts` — that file already exists in the app
repo (confirmed in earlier inspection). `legacy-character-engine.stub.ts` is
a typecheck-only stand-in so this package compiles standalone; **delete it
when integrating** and point `legacy-hand-drawn-assets.ts`'s import at the
real file's actual relative path in the repo.

## Setup

```bash
npm install pixi.js react react-dom
npm install -D typescript @types/react @types/react-dom
```

Copy the two extracted asset packs into the app's public folder so the
`baseUrl`s in `kwame-manifest.ts` / `scene-cape-coast-compound.ts` resolve:

```
public/legacy-character-assets/hand-drawn/kwame/        <- from Kwame_Mensah_Full_HandDrawn_Build_v2.zip's extracted/ folder
public/legacy-character-assets/hand-drawn/environment/  <- from Niakofa_Environment_Assets_v1.zip's extracted/ folder
```

Then in `legacy-chapter.tsx`:

```tsx
import { LegacyGameCanvas } from "./legacy-runtime/LegacyGameCanvas";
import { kwameHandDrawnManifest } from "./legacy-runtime/kwame-manifest";
import {
  capeCoastCompoundScene,
  capeCoastCompoundAssets,
  environmentBaseUrl,
} from "./legacy-runtime/scene-cape-coast-compound";

<LegacyGameCanvas
  scene={capeCoastCompoundScene}
  environmentAssets={capeCoastCompoundAssets}
  environmentBaseUrl={environmentBaseUrl}
  characterManifest={kwameHandDrawnManifest}
/>
```

That's a real, moving, hand-drawn Kwame walking around a real hand-drawn
compound scene — the first actual playable frame per every prior pack's
"no map renderer exists" finding.

## Known limitations in the One-World system specifically

- **Non-fishing activities dispatch with a stub `{}` result** — `tryInteract()`
  calls `activity.onComplete({}, ctx)` immediately for dialogue/memory-echo/
  quest-objective types rather than opening real dialogue UI first. That's
  because dialogue/vault UI components are part of the actual app repo,
  which — per the mismatch note above — I couldn't inspect this round. The
  activity/mutation plumbing is real and complete; the "show a dialogue box
  and wait for player choice before calling onComplete" step is a stub.
- **`MinimalWorldState` is a placeholder** for the real `legacy-demo-state.ts`
  state shape (referenced in earlier packs but not re-inspected this round
  given the repo mismatch) — same rationale as above.
- **Location bounds in `locations.ts` are starter placements**, not
  measured against final map authoring — flagged explicitly in the file's
  own comment.
- **`spawn-npc`/`unlock-path`/`change-building` mutations log instead of
  acting** — they need real scene-mutation APIs on `legacy-map-engine.ts`
  that don't exist yet (structural, not cosmetic, changes to the map).

## Known limitations in the base runtime (previous round, still true)

- **Combat has no art yet** — `combat.lightAttack()`/`jump()`/`dash()` all
  work at the physics level (wired to J/K/L keys), but will render Kwame's
  idle frames as a fallback with a console warning, since no attack/dash/
  jump/guard frames exist in any upload yet. This is the enforcement
  philosophy working as intended, not a bug.
- **Partial occlusion (walking *behind* a tree) is not implemented** — full
  depth-sort-by-y handles actor-vs-actor and actor-vs-building ordering
  correctly, but a single tree sprite can't have Kwame occluded by its top
  half only. That needs a split-sprite tree (trunk in `prop`, canopy in a
  separate `foreground` sprite) — noted as a follow-up, not built here.
- **NPC AI is not implemented** — `scene.npcSpawns` are defined in the
  sample scene but nothing currently drives their movement/behavior; only
  the player actor is wired to the game loop.
- **Interaction currently only logs to console** — `tryInteract()` finds
  the right `LegacyInteractionPoint` but stops short of actually opening
  dialogue/vault UI, since that wiring is specific to the real app's
  existing dialogue/vault components, which aren't part of this package.
- **Parallax background/sky layers are not yet in the renderer** — the
  layer stack comment documents where they'd go; this pass focused on
  getting ground/building/prop/actor rendering and movement working first,
  per the rollout order's own sequencing rationale.
