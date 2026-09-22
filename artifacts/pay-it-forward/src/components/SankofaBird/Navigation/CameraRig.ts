/**
 * SankofaBird/Navigation/CameraRig.ts
 *
 * Camera-rig utilities — approach detection and proximity thresholds.
 * The actual IntersectionObserver lives in Altitude.ts (tied to rigRef).
 */

/** Distance in metres below which the bird enters approach deceleration. */
export const APPROACH_THRESHOLD_M = 50;

/** Distance in metres below which the bird enters "arrived" state. */
export const ARRIVED_THRESHOLD_M = 10;
