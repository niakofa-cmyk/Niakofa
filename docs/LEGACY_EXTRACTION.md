# Legacy RPG extraction contract

Status: **Phase 2/3 — standalone runtime verified; RPG reference migration staged**
Last verified: **2026-09-01**
Canonical source: `artifacts/pay-it-forward`

The controlled standalone copy is maintained in the separate
`niakofa-cmyk/niakofa-legacy-rpg` repository. This platform checkout does not
contain a tracked `artifacts/pay-it-forward/src/legacy-runtime` tree; the
historical runtime paths below remain frozen contract references and must be
revalidated against the standalone repository before any further source
relocation.

This document freezes the boundary between Niakofa's family platform and the
Legacy RPG runtime during the staged extraction. The standalone runtime is now
the controlled validation target, while the existing platform APIs, tables, and
authenticated launch surfaces remain the production fallback until cutover
gates pass.

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

## Reference and source migration boundary

RPG-owned textual references and the archived Supabase RPG prototype are being
moved to the standalone repository under `docs/from-niakofa/` and
`archive/legacy-mode-supabase-prototype-*`. The complete transfer inventory,
including SHA-256 checksums and source-to-target paths, is maintained at:

`https://github.com/niakofa-cmyk/niakofa-legacy-rpg/blob/main/docs/niakofa-migration-manifest.json`

The current Niakofa-side review packet preserves the uploaded migration note and
the path-level classification used for this checkout:

`reference/uploads/2026-09-02/README.md`

That packet is an audit reference, not a second source of truth. The standalone
repository manifest remains authoritative for files already transferred, while
this repository retains the platform-owned contracts and unresolved binary
provenance listed below.

The following remain in this repository because they are platform-owned or
still required for release safety:

- `artifacts/api-server/src/routes/legacy-*` and their supporting services
- `artifacts/api-server/src/routes/legacy-launch.ts`
- Legacy database schemas, migrations, and family/Vault persistence
- Platform launch/session routes and compatibility fallbacks
- `scripts/src/release-validate.js` and the platform asset-provenance audits
- `.agents/memory/` and unresolved uploaded binary provenance

The standalone repository receives reference copies of platform contracts where
needed, but it does not become an owner of authentication, family records,
Stripe, Community Pool, or Legacy database state.

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

Frozen reference:
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

Frozen reference:
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

Frozen reference:
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
  gameHour?: number;
}
```

Initial standalone mode is mock-first and must not require authentication.
Live mode uses the platform's authenticated
`POST /api/legacy/launch-ticket` issuer followed by the one-use
`GET /api/legacy/launch-context` exchange. The ticket is short-lived,
opaque, and never contains family biography or a raw session credential. The
exchange returns only the narrow context above.

The current standalone bridge calls the platform API through a relative
`/api` path. Until it accepts a configured platform origin, a separately
hosted RPG requires a same-origin reverse proxy; this is a cutover gate, not a
reason to redirect `/legacy/world` early.

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

## Current implementation checkpoint

The controlled copy now lives in the separate
`niakofa-cmyk/niakofa-legacy-rpg` repository. It has its own Vite entry,
mock-first launch bridge, plain-CSS boundary, copied Pixi runtime, and the
production environment and character-sheet asset roots. Shared launch/save
contracts live in that repository's `packages/shared-types`, and the future
generation boundary is stubbed in its `services/world-engine`.

Verified on 2026-08-21:

- `tsc -p apps/legacy-rpg/tsconfig.json --noEmit`
- standalone `vite build`
- standalone landing HTML response on port 5174
- representative `environment-assets` PNG response on port 5174
- Mensah Compound validation: standalone typecheck, build, runtime assets,
  authored interactions, collision-constrained movement, NPC dialogue,
  fishing, local resume, and ticket-only bridge checks

Reference migration staged on 2026-09-01:

- 157 RPG-owned textual reference/code files copied to the standalone
  repository with SHA-256 checksums
- Archived Supabase RPG prototype copied outside the standalone runtime
- No credential-shaped values found in the staged textual transfer
- Platform-owned API, database, authentication, release checks, and unresolved
  binary provenance intentionally retained here

The `/legacy/world` launch has not been redirected. The existing platform
Legacy tables and routes remain in place, while the standalone repository is
the controlled validation target. Redirection remains gated on interactive
parity, authenticated ticket exchange from the hosted origin, and the
same-origin/configured-origin bridge decision.

## Explicit non-goals

- Do not move Sankofa Bird, mutual aid, Mapbox, Vault capture, Stripe, or
  community features into the RPG.
- Do not start world-engine AI generation as part of this extraction.
- Do not claim a standalone RPG exists until its own entry boots and its assets
  load independently.