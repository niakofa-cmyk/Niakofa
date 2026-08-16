# Niakofa Legacy — PixiJS Game Runtime (real, typechecked code)

Implements `RUNTIME_ARCHITECTURE_UPDATE.md` rollout steps 2–3: a real PixiJS
renderer replacing the DOM/CSS-grid path, with Kwame's actual 384 hand-drawn
frames driving an on-screen animated actor. **Every file in `src/legacy-runtime/`
passed a real `tsc --noEmit` check against the actual `pixi.js` and `react`
type definitions** — not just a design sketch, this compiles.

## Files

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

## Known limitations in this pass (honest, not hidden)

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
