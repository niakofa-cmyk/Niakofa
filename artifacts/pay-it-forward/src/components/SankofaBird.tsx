/**
 * SankofaBird.tsx — backward-compatibility re-export shim.
 *
 * The component was originally named `SankofaBird`. It was renamed to
 * `SankofaBirdSvg` to reflect its SVG-first, CSS-in-JS architecture and to
 * leave the simpler name available for integration wrappers (NavigationBird).
 *
 * This shim restores the original name so existing imports in bird-test.tsx
 * and any host app code continue to resolve without changes.
 *
 * Usage is unchanged:
 *   import { SankofaBird } from "@/components/SankofaBird";
 *   <SankofaBird heading={...} speed={...} navigating={...} />
 *
 * For new integration work, prefer NavigationBird (takes raw GPS/nav data)
 * or SankofaBirdSvg (full prop control) directly.
 */
export { SankofaBirdSvg as SankofaBird } from "./SankofaBirdSvg";
export type { SankofaBirdProps } from "./SankofaBirdSvg";
