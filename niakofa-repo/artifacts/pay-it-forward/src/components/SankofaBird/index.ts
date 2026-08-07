/**
 * SankofaBird/index.ts
 *
 * Public barrel for the SankofaBird component system.
 *
 * Preserves the exact same public API as the old index.tsx so all existing
 * callers (map.tsx, request-active.tsx, bird-test.tsx, etc.) compile unchanged.
 */

export { SankofaBirdSvg }  from "./Core/Bird";
export type { SankofaBirdProps } from "./Core/Types";

// ── Context (for custom wrappers) ─────────────────────────────────────────────
export { useBird, BirdProvider } from "./Core/Context";
export type { BirdContextValue } from "./Core/Context";

// ── Anatomy components (for test harness + turnaround board) ──────────────────
export { Gradients }      from "./Effects/Gradients";
export { Shadow }         from "./Effects/Shadow";
export { GroundRings }    from "./Effects/GroundRings";
export { Particles }      from "./Effects/Particles";
export { MissionRings }   from "./Effects/MissionRings";
export { ChirpArcs }      from "./Effects/ChirpArcs";
export { ParticleTrail }  from "./Effects/ParticleTrail";
export { DustMotes }      from "./Effects/DustMotes";
export { AdinkraOverlay } from "./Effects/AdinkraOverlay";
export { Tail }           from "./Anatomy/Tail";
export { RightWing, LeftWing, WingJoints, Scapulars } from "./Flight/Wings";
export { Body as BodyGroup } from "./Anatomy/Body";
export { Neck, HeadSphere as Head, Crest, Eye, Beak, ChirpRings, Egg } from "./Anatomy/Head";
export { Legs }           from "./Anatomy/Legs";

// ── Geometry (for turnaround board + Rive/Spine pipeline) ─────────────────────
export * as TailPaths  from "./Skeleton/Bones";
export * as WingPaths  from "./Skeleton/Bones";
export * as BodyPaths  from "./Skeleton/Bones";
export * as HeadPaths  from "./Skeleton/Bones";

// ── Animation utilities ────────────────────────────────────────────────────────
export * as Pivots     from "./Skeleton/Pivots";
export * as Transforms from "./Skeleton/Constraints";

// ── Metadata ──────────────────────────────────────────────────────────────────
export * as Colors     from "./Skeleton/Colors";
export * as Ids        from "./Skeleton/Ids";
export * as LayerOrder from "./Skeleton/LayerOrder";

// ── Pose definitions (for 2.5D turnaround views) ──────────────────────────────
export { FRONT, BACK, LEFT_45, RIGHT_45 } from "./Skeleton/Poses";
