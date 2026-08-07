/**
 * SankofaBird/Skeleton/index.ts
 *
 * Barrel for the Skeleton system — pure geometry, pivots, constraints,
 * metadata, and pose definitions. No React, no animation state.
 */

export * as Bones      from "./Bones";
export * as Pivots     from "./Pivots";
export * as Constraints from "./Constraints";
export * as Colors     from "./Colors";
export * as Ids        from "./Ids";
export * as LayerOrder from "./LayerOrder";
export * as Poses      from "./Poses";

// Named exports for common direct imports
export { pivotOrigin } from "./Pivots";
export { buildRigStyle, perspectiveMatrix } from "./Constraints";
export { FRONT, BACK, LEFT_45, RIGHT_45 } from "./Poses";
