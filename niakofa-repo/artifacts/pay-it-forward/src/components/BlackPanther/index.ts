/**
 * BlackPanther — public entry point.
 *
 * Only the SVG renderer exists for MVP; no Rive variant yet (see
 * SankofaBird.tsx for that pattern — a `BlackPantherRive.tsx` can be added
 * later behind its own VITE_USE_RIVE_PANTHER flag the same way, without
 * touching call sites). Exported as `BlackPanther` so SpiritAnimalAvatar's
 * import stays symmetric with `SankofaBird`.
 */

export { BlackPantherSvg as BlackPanther } from "./BlackPantherSvg";
export type { BlackPantherProps } from "./Core/Types";

// 15-view / turn-sequence expansion scaffold; the layered master is shipped.
// See public/BLACK_PANTHER_ASSET_PIPELINE.md, "Current Implementation Status."
export * from "./BlackPantherViews";
