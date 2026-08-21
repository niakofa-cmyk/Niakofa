# Legacy RPG extraction contract

Status: **Phase 1 — interface freeze**  
Last verified against: `origin/main` at commit `264e2edd`  
Canonical source: `artifacts/pay-it-forward`

This document freezes the boundary between Niakofa's family platform and the
Legacy RPG runtime before any folders are copied or moved. The first extraction
must be a controlled copy: the existing in-app world remains the production
reference until a standalone runtime boots, renders Mensah Compound, and passes
the same gameplay contracts.

## Product boundary

| Platform-owned | RPG-owned after extraction |
| --- | --- |
| Authentication and accounts | PixiJS game loop and canvas |
| Family tree and family-member records | Maps, collision, camera, movement |
| Family Vault, media, interviews | NPC controllers and dialogue runtime |
| Helper, Sankofa Bird, mutual-aid map | Fishing, activities, world mutations |
| Stripe, trust tiers, community, notifications | Character rendering and animation FSMs |
| Legacy launcher and family context | Scene assets and scene-specific save state |

The RPG may consume family context through a typed bridge or API. It must not
own the Vault database or create a second source of truth for family members.
RPG saves should reference stable `family_member_id` values rather than copy
biographical records.

## Frozen routes

### Canonical public gameplay

| Route | Current owner | Future owner | Contract |
| --- | --- | --- | --- |
| `/legacy/demo` | `legacy-demo-launcher.tsx` | `apps/web` | Baobab/branch picker; launches the public world |
| `/legacy/world` | `legacy-public-world.tsx` | `apps/web` launches; RPG owns runtime | Public playable House of Mensah / Cape Coast scene |

`/legacy/chapter/demo` is a compatibility alias for the public world. The
authenticated chapter/session routes remain platform-owned launch surfaces until
the standalone runtime has an authenticated bridge:

- `/legacy/play` and `/legacy/play/:sessionId`
- `/legacy/chapter/:chapterId`
- `/legacy/onboarding`
- `/legacy/journal` and `/legacy/journal/:familyId`
- `/legacy/map` and `/legacy/map/:familyId`

Other `/legacy/*` pages are platform UI and must not be copied into the RPG
runtime merely because they share the route prefix.

## Frozen runtime interfaces

### `LegacyGameCanvasProps`

Current source:
`artifacts/pay-it-forward/src/legacy-runtime/LegacyGameCanvas.tsx`

```ts
interface LegacyGameCanvasProps {
  scene: LegacyMapScene;
  environmentAssets: EnvironmentManifestEntry[];
  environmentBaseUrl: string;
  characterManifest: CharacterManifest | SheetBasedCharacterManifest;
  gameHour?: number;
  onPlayerPositionChange?: (x: number, y: number) => void;
  initialSpawn?: {
    x: number;
    y: number;
    facing: "up" | "down" | "left" | "right";
  };
}
```

The standalone app must preserve this contract initially. `gameHour` remains
externally controlled so the platform can later supply world time, while
`initialSpawn` remains scene data rather than an authentication concern.

### Mensah Compound scene

Current source:
`artifacts/pay-it-forward/src/legacy-runtime/scene-mensah-compound.ts`

Frozen exports:

- `mensahCompoundScene`
- `mensahCompoundAssets`
- `mensahCompoundBaseUrl`
- `MENSAH_COMPOUND_SPAWN`

The current public world mounts these with `KWAME_SHEET_MANIFEST` and spawns at
the compound gate. The standalone smoke target is a mock Kwame in this exact
scene before any authenticated family bridge is introduced.

### Character sheets

Current source:
`artifacts/pay-it-forward/src/legacy-runtime/kwame-sheet-manifest.ts`

Frozen export: `KWAME_SHEET_MANIFEST`.

The manifest is the runtime contract, not a permission to replace supplied art.
The production boundary remains the curated runtime sheets under
`public/legacy-character-assets/kwame-mensah/runtime-sheets/`; unresolved or
provenance-uncleared uploads remain reference/archive material only.

### Asset roots

Current public roots:

- `artifacts/pay-it-forward/public/environment-assets/`
- `artifacts/pay-it-forward/public/legacy-character-assets/`

The first copy into `apps/legacy-rpg/public/` must preserve URL-compatible
paths. Asset relocation is not complete until a standalone build verifies that
the Mensah scene and Kwame manifest load without web-app imports.

## Family and session context

The platform remains authoritative for identity and family data. A future
bridge may carry:

```ts
interface LegacyLaunchContext {
  mode: "mock" | "live";
  familyId?: string;
  characterId?: string;
  sessionToken?: string;
  gameHour?: number;
}
```

Initial standalone mode is mock-first and must not require authentication.
Live mode must pass an opaque session reference or token through a secure
integration boundary; it must not put family biography into a URL or local
runtime blob.

## Save and state boundaries

There are two existing persistence contracts and they must not be conflated:

1. **Demo journey state** — `legacy-demo-state.ts`, storage key
   `niakofa:demo:v2`. This covers the broader launcher/demo journey, including
   phase, quests, relationships, fishing, journal entries, and world version.
2. **Scene runtime state** — `LegacyGameCanvas`, storage key prefix
   `niakofa:legacy-runtime:<sceneId>`. This stores a versioned scene position and
   `MinimalWorldState` for resumable public gameplay.

During extraction, the RPG owns only the scene runtime save blob:
position, world mutations, quests, inventory, unlocks, and world version. The
platform continues to own family journal and Vault persistence. Optional API
sync must be additive and idempotent; it must not silently replace local resume
behavior.

## Extraction sequence and acceptance gates

1. Keep the current runtime unchanged as the reference implementation.
2. Copy the runtime, required FSM/type dependencies, and public assets into
   `apps/legacy-rpg`; do not delete the originals.
3. Add a mock-first standalone Vite entry and bridge.
4. Verify a standalone build and dev server render Mensah Compound with Kwame.
5. Compare asset URLs, movement/collision, scene interactions, fishing, journal
   mutations, and local resume behavior against the in-app reference.
6. Only after those gates pass, make `/legacy/world` launch the standalone
   package or host.
7. Remove duplicate in-app runtime code only after the launch path and fallback
   are verified.

## Explicit non-goals

- Do not create disconnected GitHub repositories yet.
- Do not move Sankofa Bird, mutual aid, Mapbox, Vault capture, Stripe, or
  community features into the RPG.
- Do not start world-engine AI generation as part of this extraction.
- Do not claim a standalone RPG exists until its own entry boots and its assets
  load independently.