---
name: SankofaBird systems-based directory layout
description: Final directory structure after the systems-based refactor (Task #5, July 2026).
---

## Directory layout (post-refactor)

```
SankofaBird/
  Core/         Bird.tsx (orchestrator), Context.tsx, Renderer.tsx, Types.ts, index.ts
  Skeleton/     Bones.ts (all SVG paths), Pivots.ts, Constraints.ts, Colors.ts, Ids.ts, LayerOrder.ts, Poses.ts, index.ts
  Flight/       Wings.tsx (all 4 wing components), FlightPhysics.ts, Banking.ts, Glide.ts, Hover.ts, index.ts
  Navigation/   GPSHeading.ts, Compass.ts, Altitude.ts, MapBearing.ts, CameraRig.ts, index.ts
  Behavior/     Landing.ts, Idle.ts, Takeoff.ts, Search.ts, Deliver.ts, Aero.ts, index.ts
  Anatomy/      Body.tsx, Head.tsx (7 merged: Neck/HeadSphere/Crest/Eye/Beak/ChirpRings/Egg), Tail.tsx, Legs.tsx, index.ts
  Effects/      Shadow.tsx, GroundRings.tsx, Particles.tsx, MissionRings.tsx, ChirpArcs.tsx,
                ParticleTrail.tsx, DustMotes.tsx, AdinkraOverlay.tsx, Gradients.tsx, index.ts
                Animations/  base.ts, phase-3-11.ts, phase-12-13.ts, phase-14-19.ts, index.ts
  index.ts      (same public surface as old index.tsx, updated paths)
```

## Key decisions

- **CSS class names never changed** — only file locations moved.
- **Anatomy/Head.tsx** merges all 7 head sub-components as named exports.
- **Skeleton/Bones.ts** merges all 4 geometry files.
- **Flight/Wings.tsx** merges LeftWing, RightWing, WingJoints, Scapulars.
- **Effects/Gradients.tsx** moved from defs/Gradients.tsx.
- **Effects/Animations/** renamed from sankofa-bird-css/ (CSS content unchanged).
- **Core/Bird.tsx** owns all hooks + computed state + BirdContext assembly.
- **Core/Renderer.tsx** owns all JSX (reads from useBird() only).
- **lightingFactor** computed inline in Bird.tsx (NOT in Compass hook), using world-frame heading.
- **Compass.useCompass** does NOT return lightingFactor (removed from CompassState interface).
- **External shims** SankofaBird.tsx (wrapper) and SankofaBirdSvg.tsx now point to Core/Bird.tsx.

**Why:** Game-engine system organization for maintainability; enables parallel work on systems without cross-system merge conflicts.

**How to apply:** When adding new animation effects, add to Effects/. New navigation logic goes to Navigation/. New behavior states go to Behavior/. CSS changes go to Effects/Animations/ phase files.
