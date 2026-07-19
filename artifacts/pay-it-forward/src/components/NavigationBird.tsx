/**
 * NavigationBird.tsx
 *
 * Drop-in navigation map marker — wraps SankofaBirdSvg with the
 * useBirdNavigation hook so callers only need to pass raw GPS/nav data.
 *
 * ── Minimal example (any map SDK) ────────────────────────────────────────────
 *
 *   import { NavigationBird } from "@/components/NavigationBird";
 *
 *   // Inside your map component:
 *   <NavigationBird
 *     heading={gps.heading}
 *     speed={gps.speed}
 *     mapBearing={map.getBearing()}
 *     mapZoom={map.getZoom()}
 *     navigating={route.isActive}
 *     upcomingTurnDirection={route.nextTurn}
 *     skyTier={skyTier}
 *     isHelping={!!activeHelpRequest}
 *     activityLevel={openRequestCount / MAX_REQUESTS}
 *   />
 *
 * ── Mapbox GL JS example ──────────────────────────────────────────────────────
 *
 *   const [bearing, setBearing] = useState(0);
 *   const [zoom, setZoom]       = useState(14);
 *   map.on("rotate", () => setBearing(map.getBearing()));
 *   map.on("zoom",   () => setZoom(map.getZoom()));
 *
 *   <NavigationBird
 *     heading={gps.heading}
 *     speed={gps.speed}
 *     mapBearing={bearing}
 *     mapZoom={zoom}
 *     navigating={isNavigating}
 *     upcomingTurnDirection={nextStep ? computeUpcomingTurn(
 *       currentStep.bearing_before,
 *       nextStep.bearing_after,
 *     ) : null}
 *     userLat={gps.lat}        // auto-compute approaching
 *     userLng={gps.lng}
 *     destinationLat={dest.lat}
 *     destinationLng={dest.lng}
 *   />
 *
 * ── Performance notes ─────────────────────────────────────────────────────────
 * Battery-saver auto-activates when:
 *   • Device battery < 20 % and not charging (Battery Status API)
 *   • App is backgrounded during navigation (Page Visibility API)
 *   • navLod escalates after 10 min (LOD1) and 30 min (LOD2) of continuous nav
 * These protections keep older iPhones smooth throughout a 20-min+ session.
 *
 * ── Device compatibility ──────────────────────────────────────────────────────
 * The bird degrades gracefully across browsers:
 *   iOS 14.1+  → full animation (individual transform properties)
 *   iOS 12–14  → CSS animations + transform shorthand (no individual rotate/translate)
 *   iOS < 12   → static SVG silhouette (animations skipped by @supports guards)
 *   Android Chrome 85+ → full animation
 *   Android Chrome < 85 → same as iOS 12–14 fallback
 * Battery-saver mode further reduces GPU load to a simple teal silhouette.
 */

import { SankofaBirdSvg } from "@/components/SankofaBirdSvg";
import { useBirdNavigation, type NavInput } from "@/lib/useBirdNavigation";

export interface NavigationBirdProps extends NavInput {
  /** Optional CSS class applied to the wrapper div. */
  className?: string;
  /** Optional inline style for the wrapper div. */
  style?: React.CSSProperties;
}

/**
 * NavigationBird
 *
 * Thin wrapper: NavInput → useBirdNavigation → SankofaBirdSvg.
 * All SankofaBirdSvg props are derived automatically from the NavInput;
 * you never need to import or compose SankofaBirdProps manually.
 */
export function NavigationBird({
  className,
  style,
  ...navInput
}: NavigationBirdProps) {
  const birdProps = useBirdNavigation(navInput);

  return (
    <div
      className={className}
      style={{
        display: "inline-block",
        lineHeight: 0,
        // GPU-promote the outer wrapper — isolates the bird's composited
        // layers from the map canvas so repaints don't cross boundaries.
        // translateZ(0) is the widest-compat hardware-acceleration trigger
        // (iOS 9+, Android 4.4+). No visual effect — pure layer promotion.
        transform: "translateZ(0)",
        willChange: "transform",
        ...style,
      }}
      aria-label="Sankofa navigation bird"
      role="img"
    >
      <SankofaBirdSvg {...birdProps} />
    </div>
  );
}

// Re-export the utilities so callers can import from one place
export { computeUpcomingTurn, haversineDistanceM } from "@/lib/useBirdNavigation";
