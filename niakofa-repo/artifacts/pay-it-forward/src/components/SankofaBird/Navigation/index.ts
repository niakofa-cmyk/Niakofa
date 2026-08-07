/**
 * SankofaBird/Navigation/index.ts
 *
 * Barrel for the Navigation system.
 */

export { useGPSHeading }       from "./GPSHeading";
export type { GPSHeadingState } from "./GPSHeading";

export { useAltitude }       from "./Altitude";
export type { AltitudeState, ZoomTier } from "./Altitude";

export { useCompass }       from "./Compass";
export type { CompassState } from "./Compass";

export { computeScreenRotation, normalizeAngle, headingToCardinal } from "./MapBearing";
export { APPROACH_THRESHOLD_M, ARRIVED_THRESHOLD_M }                from "./CameraRig";

export { computeViewOpacities, computeViewAngle } from "./ViewSelector";
export type { ViewAngle, ViewOpacities }          from "./ViewSelector";
