# Niakofa Legacy RPG — Runtime Architecture Update
### (amends `ARCHITECTURE_PLAN.md` and `COMBAT_SYSTEM.md` from the earlier rebuild packs)

This document's own diagnosis checks out against what's actually in the
codebase — worth confirming point by point before adopting its
recommendation, since the last few packs are the source of that ground truth.

## Confirms what we already found

- **"Your current world renderer is still essentially a DOM/CSS grid"** —
  matches `BUGS_AND_FINDINGS.md`'s finding that `legacy-chapter.tsx` has zero
  map rendering today; the "HTML + CSS Grid + PNG backgrounds +
  absolute-positioned actors" description is the accurate baseline, not an
  exaggeration.
- **"You have already implemented a combat state machine... light attack 1,
  light attack 2, heavy attack, aerial attack, dash, air dash, jump, double
  jump, fall, guard, parry, knockback, stamina, combo window, invulnerability
  window"** — this is `legacy-combat-fsm.ts` from the combat pack, confirmed
  accurate down to the field names.
- **"Attack / dash / jump / guard / aerial = none in the current hand-drawn
  upload"** — matches `Kwame_Mensah_Full_HandDrawn_Build_v2`'s coverage
  table exactly. Combat art is still the #1 art gap, unchanged by the
  environment atlas delivery since.

So the diagnosis is grounded, not speculative. The recommendation on top of
it is what this document adds, and it's a real, adoptable decision.

## Decision: adopt the WebGL/PixiJS runtime, reject embedding RPG Maker MV

This settles a question the doc itself poses in its comparison table ("Add
RPG Maker runtime embedded?") — the rest of the document's own reasoning
answers it, and it matches every prior pack's stance:

- **Rejected:** `Niakofa → RPG Maker MV → bolt the family platform on top`.
  Would recreate the "second architecture inside the application" problem
  flagged as far back as the very first rebuild pack, just at the scale of
  the whole app instead of one asset folder.
- **Adopted:** `Niakofa (React/Vite platform) → Legacy Game Runtime
  (PixiJS/WebGL) → World Regeneration`, as one process, not a separate
  embedded game. RPG Maker assets/logic remain reference-and-prototyping
  material only — same rule that's applied to every RPG-Maker-sourced asset
  since the first style-gap report.

This is additive to `ARCHITECTURE_PLAN.md` §3 (the map/environment system),
not a replacement — the `LegacyMapScene` / `LegacyMapLayer` types are
renderer-agnostic already (plain data: assetId, position, kind). What
changes is *what reads that data*: a PixiJS scene graph instead of a future
DOM/CSS component.

## Updated layer stack

Extends `legacy-map-engine.ts`'s five-layer model
(ground→decoration→building→prop→foreground) to the full stack this
document specifies, now that depth and parallax are in scope:

```
sky -> background (parallax) -> far vegetation -> buildings -> structures
-> ground -> props -> NPCs -> player -> foreground -> lighting -> weather
-> particles -> UI
```

Two concrete new capabilities this unlocks that DOM/CSS genuinely couldn't:

- **Occlusion / depth sorting** — Kwame walking behind a tree canopy, then
  in front of it, sorted by a y-position-to-depth rule, not fixed z-index.
  This is exactly why `WorldPack`/environment "foreground" layer exists
  conceptually already — PixiJS is what makes it actually render correctly
  instead of being a layer type with no working occlusion behind it.
- **Parallax background** — distant hills/sky scroll slower than the
  midground, matching the environment concept boards' "BACKGROUND PANORAMAS
  (PARALLAX LAYERS)" panel, which had no rendering path to attach to before.

## Confirmed technical parameters (no change from calibration sheet)

The document's proposed runtime numbers match `calibration-sheet.json`
exactly — 64×64 logical tiles, semi-top-down 2.5D camera, ~2.5-tile actor
height, 12fps authored hand-drawn animation. No renumbering needed; the art
that's already been extracted (Kwame's 384 frames, the 180 environment
tiles/buildings) was produced against the right numbers already.

## Updated rollout order (supersedes `ARCHITECTURE_PLAN.md` §5)

1. Archive the stale `niakofa-repo/` tree — unchanged, still first, still
   unrelated to any of this.
2. **New step:** stand up a minimal PixiJS canvas inside `legacy-chapter.tsx`,
   rendering one static `LegacyMapScene` (the ground/building/prop layers
   already extracted) with zero actors yet — proves the rendering pipeline
   before wiring movement into it.
3. Wire `LegacyActorController`/`LegacyCombatController` (already built,
   renderer-agnostic) to drive a Kwame sprite inside that PixiJS scene,
   using the 384 hand-drawn frames — this is the "art becomes gameplay, not
   an asset library" moment the document calls out.
4. Land depth-sorting/occlusion and parallax background once basic movement
   is confirmed working — sequencing this after movement, not before, so
   there's a playable loop to test against at every step rather than a
   polished renderer with nothing moving in it.
5. Combat art production (attack/dash/jump/guard/aerial frames) — still the
   #1 outstanding art gap, unchanged priority from the combat pack.

## What does NOT change

- The hand-drawn-only enforcement gate (`legacy-hand-drawn-assets.ts`) —
  applies identically regardless of renderer.
- The Living World Map (macro, painted overworld + pins) from
  `WORLD_MAP_ARCHITECTURE.md` — that's a 2D image + pin UI, not a PixiJS
  scene; the runtime change here is about per-location playable scenes, not
  the overworld navigation screen.
- The Family Vault → AI extraction → World Regeneration pipeline — entirely
  unaffected; it produces `LegacyMapScene`/character data, and now that data
  has a real renderer to reach instead of nothing.
