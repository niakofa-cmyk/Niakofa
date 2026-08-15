# Niakofa Legacy RPG — Rebuild Architecture Plan

Goal: Kwame Mensah, every main/antagonist character, and every map/structure
render exclusively from hand-drawn art. RPG-Maker-style assets (the
generator/img.zip packs from earlier) become explicitly prototype-only and
are locked out of those roles at the type level, not just by convention.

This plan extends what's already correctly built (`legacy-character-engine.ts`'s
typed asset registry) rather than replacing it, and designs the map/environment
system that — per the repo findings — doesn't exist yet.

---

## 1. Character system: add an art-tier gate

Today `LegacyAssetRecord` has `runtime: "approved" | "catalog-only"`. Add a
second axis, `artTier`, and a role concept, so hand-drawn-only enforcement is
a type/runtime check rather than a hope:

```ts
export type LegacyArtTier = "handDrawn" | "prototypePixel";
export type LegacyCharacterRole = "protagonist" | "antagonist" | "namedNPC" | "background";

export interface LegacyAssetRecord {
  // ...existing fields
  artTier: LegacyArtTier;
}

// A role→required-tier policy, enforced at resolve time:
const ROLE_REQUIRES_HAND_DRAWN: Record<LegacyCharacterRole, boolean> = {
  protagonist: true,   // Kwame and any playable ancestor
  antagonist: true,
  namedNPC: false,      // may use prototypePixel until art exists, flagged in UI
  background: false,    // crowd/filler NPCs — prototypePixel is fine indefinitely
};
```

`resolveWalkingAppearance()` (and the `Face` portrait resolver) should accept
a `role` argument and throw — or, in dev, render a visible "MISSING HAND-DRAWN
ART" placeholder rather than silently falling back to a pixel sprite — when
`role` requires `handDrawn` but only `prototypePixel` assets are registered.
That turns "only hand-drawn art for main/antagonist characters" from a policy
you have to remember into something the build enforces.

See `scaffold/legacy-hand-drawn-assets.ts` for a working version of this.

**Until real hand-drawn frames exist**, every protagonist/antagonist should
resolve to that visible placeholder, not the RPG-Maker chibi sprite — that
sprite is fine for `background` NPCs during prototyping, never for Kwame.

## 2. Character asset production spec

Once an artist/pipeline produces real frames, they get registered as
`artTier: "handDrawn"` records against `calibration-sheet.json`:

- 64×64 canonical grid (confirm isometric offset with the artist)
- 4 directions × states from the calibration sheet's `animationSet`
- Individual PNG per frame, alpha transparency, consistent crop/anchor
  (foot anchor + head clearance measured once against the Kwame master
  turnaround, then reused for every character so scale stays consistent —
  this is the "calibration character" idea from the design doc, made literal)
- Layered where possible (body / clothing / hair / accessories) so Character
  Evolution (age 16 → 25 → 40 → elder) can swap layers instead of needing a
  full redraw per life stage

## 3. Map/Environment system (new — none exists today)

Per `BUGS_AND_FINDINGS.md`, `legacy-chapter.tsx` has zero map rendering
today. Proposed shape, matching the calibration sheet's world unit:

```ts
interface LegacyMapScene {
  id: string;                     // e.g. "cape-coast-market-1912"
  tileSizePx: 64;
  layers: LegacyMapLayer[];       // ground → decoration → buildings → props → foreground
  collision: LegacyCollisionShape[];
  interactionPoints: LegacyInteractionPoint[];
  npcSpawnPoints: LegacyNpcSpawn[];
  worldStateVariant?: string;     // "prosperous" | "collapsed" | ... — same location, different art
  lighting: "morning" | "afternoon" | "evening" | "night" | "rainy";
}

interface LegacyMapLayer {
  kind: "ground" | "decoration" | "building" | "prop" | "foreground";
  assetId: string;                // resolves through the SAME art-tier-gated registry as characters
  artTier: "handDrawn" | "prototypePixel";
  position: { x: number; y: number };
}
```

Same enforcement rule as characters: any `LegacyMapLayer` used in a real
chapter scene must resolve `artTier: "handDrawn"`. `prototypePixel` (the
curated `WorldPack` tilesets from the earlier delivery) is fine for internal
prototyping builds only.

`worldStateVariant` is what makes "the same location, different era" (the
document's Golden Path table entry: prosperous compound → collapsed compound)
possible without duplicating map logic — one `LegacyMapScene.id`, multiple art
variants keyed by world state, matching the environment board's own "Colonial
Town" appearing across multiple lighting/weather states.

See `scaffold/legacy-map-engine.ts`.

## 4. Movement/animation — LMBS concepts, zero LMBS code

Per `HAND_DRAWN_ASSET_ASSESSMENT.md`, none of `lmbs.zip`'s JS gets imported.
What's extracted instead is the *shape* of a movement/animation state machine,
reimplemented natively:

```
Character
  → Movement (velocity, facing, collision-resolved position)
  → Animation state (Idle/Walk/Run/Interact/Talk/Attack — from calibration sheet)
  → Action (interact/attack resolves against a target in range)
  → Collision (map's LegacyCollisionShape[] + other actors)
  → World response (dialogue trigger, quest flag, world-evolution event)
```

`scaffold/legacy-animation-fsm.ts` is a from-scratch TypeScript state machine
implementing this loop — no RPG Maker dependency, framework-agnostic (works
whether the actual renderer ends up being Canvas, PixiJS, or plain DOM
sprites like the current `LegacyCharacterSprite`).

The one LMBS idea worth carrying over conceptually (per the earlier design
doc's own callout) is attaching **real recorded family audio** to actions
instead of generic sound effects — that's a Niakofa-specific win no RPG Maker
plugin can give you, and it plugs into the existing Family Vault audio
pipeline, not into LMBS at all.

## 5. Rollout order

1. Archive the stale `niakofa-repo/` tree (`BUGS_AND_FINDINGS.md` §1) — do this first, it's unrelated to art but will bite whoever works on the map system next if left alone.
2. Land the `artTier`/`role` typing extension in `legacy-character-engine.ts` (non-breaking — everything currently registered becomes `artTier: "prototypePixel"`).
3. Land `legacy-map-engine.ts` types + a minimal renderer wired into `legacy-chapter.tsx`, populated with `prototypePixel` WorldPack assets so the loop is playable end-to-end.
4. Commission/produce real hand-drawn frames against `calibration-sheet.json`, starting with Kwame (the calibration character) and the Ancestral Village / Market Square scenes (highest reuse across chapters per the environment board).
5. Register those as `artTier: "handDrawn"`; the protagonist/antagonist/map enforcement rule then does the rest — nothing renders in the shipped build without passing the gate.
