/**
 * SankofaBird/Flight/index.ts
 *
 * Barrel for the Flight system — banking, physics, glide, hover, and wing rendering.
 */

export { useBanking }       from "./Banking";
export type { BankingState } from "./Banking";

export { useFlightPhysics }       from "./FlightPhysics";
export type { FlightPhysicsState } from "./FlightPhysics";

export { VISUAL_GLIDE_THRESHOLD_MS, FULL_GLIDE_THRESHOLD_MS } from "./Glide";
export { HOVER_PHASES }                                         from "./Hover";
export type { HoverPhase }                                      from "./Hover";

export { RightWing, LeftWing, WingJoints, Scapulars } from "./Wings";
