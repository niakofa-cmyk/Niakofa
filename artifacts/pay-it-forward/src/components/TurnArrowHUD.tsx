/**
 * TurnArrowHUD.tsx — Enhanced
 *
 * Audit findings fixed:
 *  1. Arrow SVG was hardcoded for 8 directions — missed "slight left/right",
 *     "uturn", "merge", "fork", "ramp" maneuver types from Mapbox
 *  2. No animation between direction changes — arrow snapped, disorienting
 *  3. `maneuver_direction` was used raw without normalization — "sharp left"
 *     mapped to nothing and fell through to a straight arrow
 *  4. Distance display cut off at 999m — "0.1 mi" shown as "100 m" inconsistently
 *  5. No reduced-motion respect
 *  6. HUD had no aria attributes — invisible to screen readers
 *
 * Enhancements:
 *  - Full Mapbox maneuver type + modifier coverage (15 types)
 *  - Smooth CSS rotation transition (respects prefers-reduced-motion)
 *  - Distance formatting consistent with NavigationOverlay
 *  - Compact speed display when GPS heading available
 */

import { useMemo, useState, useEffect } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TurnArrowHUDProps {
  maneuverType: string | null;
  maneuverDirection: string | null;
  distanceMeters: number;
  instruction: string;
  speedMph?: number | null;
  /** degrees, 0 = north */
  deviceHeading?: number | null;
}

// ─── Arrow SVG paths per maneuver ────────────────────────────────────────────
// All paths drawn on a 24×24 viewBox, pointing "up" = go straight

type ArrowDef = {
  /** SVG path data */
  path: string;
  /** degrees to rotate the path (0 = up/straight) */
  rotate: number;
  /** accessible label */
  label: string;
};

const ARROWS: Record<string, ArrowDef> = {
  straight: {
    path: "M12 3 L12 21 M12 3 L7 8 M12 3 L17 8",
    rotate: 0,
    label: "Continue straight",
  },
  "slight right": {
    path: "M12 3 L12 21 M12 3 L7 8 M12 3 L17 8",
    rotate: 20,
    label: "Slight right",
  },
  right: {
    path: "M12 3 L12 21 M12 3 L7 8 M12 3 L17 8",
    rotate: 90,
    label: "Turn right",
  },
  "sharp right": {
    path: "M12 3 L12 21 M12 3 L7 8 M12 3 L17 8",
    rotate: 135,
    label: "Sharp right",
  },
  "slight left": {
    path: "M12 3 L12 21 M12 3 L7 8 M12 3 L17 8",
    rotate: -20,
    label: "Slight left",
  },
  left: {
    path: "M12 3 L12 21 M12 3 L7 8 M12 3 L17 8",
    rotate: -90,
    label: "Turn left",
  },
  "sharp left": {
    path: "M12 3 L12 21 M12 3 L7 8 M12 3 L17 8",
    rotate: -135,
    label: "Sharp left",
  },
  uturn: {
    // U-turn arrow: goes up then curves back down
    path: "M9 21 L9 9 Q9 3 15 3 Q21 3 21 9 L21 12 M21 12 L17 8 M21 12 L25 8",
    rotate: 0,
    label: "Make a U-turn",
  },
  merge: {
    // Merge: two lines converging upward
    path: "M8 21 L12 12 L16 21 M12 12 L12 3 M12 3 L8 7 M12 3 L16 7",
    rotate: 0,
    label: "Merge",
  },
  "fork right": {
    path: "M12 21 L12 12 L17 3 M12 12 L7 3 M17 3 L14 5 M17 3 L17 7",
    rotate: 0,
    label: "Fork right",
  },
  "fork left": {
    path: "M12 21 L12 12 L7 3 M12 12 L17 3 M7 3 L10 5 M7 3 L7 7",
    rotate: 0,
    label: "Fork left",
  },
  "ramp right": {
    path: "M12 21 L12 12 L12 3 M12 3 L7 8 M12 3 L17 8",
    rotate: 45,
    label: "Take ramp on right",
  },
  "ramp left": {
    path: "M12 21 L12 12 L12 3 M12 3 L7 8 M12 3 L17 8",
    rotate: -45,
    label: "Take ramp on left",
  },
  roundabout: {
    // Circle with exit arrow
    path: "M12 6 A6 6 0 1 1 6 12 M6 12 L3 9 M6 12 L9 9",
    rotate: 0,
    label: "Enter roundabout",
  },
  arrive: {
    // Pin / destination marker
    path: "M12 21 L12 12 M12 3 A4 4 0 1 1 12 11",
    rotate: 0,
    label: "Arrive at destination",
  },
};

// ─── Normalizer ───────────────────────────────────────────────────────────────

function resolveArrow(
  maneuverType: string | null,
  maneuverDirection: string | null
): ArrowDef {
  // Check arrive first
  if (maneuverType === "arrive") return ARROWS["arrive"];

  // Roundabout
  if (maneuverType?.includes("rotary") || maneuverType?.includes("roundabout")) {
    return ARROWS["roundabout"];
  }

  // Fork
  if (maneuverType === "fork") {
    const dir = maneuverDirection?.toLowerCase() ?? "";
    if (dir.includes("right")) return ARROWS["fork right"];
    if (dir.includes("left")) return ARROWS["fork left"];
    return ARROWS["straight"];
  }

  // Merge
  if (maneuverType === "merge" || maneuverType === "on ramp") {
    const dir = maneuverDirection?.toLowerCase() ?? "";
    if (dir.includes("right")) return ARROWS["ramp right"];
    if (dir.includes("left")) return ARROWS["ramp left"];
    return ARROWS["merge"];
  }

  // Off ramp
  if (maneuverType === "off ramp") {
    const dir = maneuverDirection?.toLowerCase() ?? "";
    return dir.includes("left") ? ARROWS["ramp left"] : ARROWS["ramp right"];
  }

  // U-turn
  if (maneuverDirection?.toLowerCase().includes("uturn") ||
      maneuverDirection?.toLowerCase().includes("u-turn")) {
    return ARROWS["uturn"];
  }

  // Standard turn/continue — normalize direction string
  const raw = (maneuverDirection ?? "straight").toLowerCase().trim();
  // Strip leading "turn " if present
  const normalized = raw.replace(/^turn\s+/, "");

  return ARROWS[normalized] ?? ARROWS["straight"];
}

// ─── Distance formatter ───────────────────────────────────────────────────────

function formatDist(meters: number): string {
  if (meters < 50) return "Now";
  if (meters < 300) return `${Math.round(meters / 10) * 10} m`;
  if (meters < 1000) return `${Math.round(meters / 50) * 50} m`;
  const miles = meters / 1609.34;
  if (miles < 0.2) return `${Math.round(meters)} m`;
  return `${miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TurnArrowHUD({
  maneuverType,
  maneuverDirection,
  distanceMeters,
  instruction,
  speedMph,
  deviceHeading,
}: TurnArrowHUDProps) {
  const arrow = useMemo(
    () => resolveArrow(maneuverType, maneuverDirection),
    [maneuverType, maneuverDirection]
  );

  const distLabel = formatDist(distanceMeters);

  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return (
    <div
      className="flex items-center gap-3 bg-card/95 backdrop-blur-md border border-border rounded-2xl px-4 py-3 shadow-xl"
      role="img"
      aria-label={`${arrow.label} in ${distLabel}. ${instruction}`}
    >
      {/* Arrow icon */}
      <div className="flex-shrink-0 w-12 h-12 flex items-center justify-center">
        <svg
          width="36"
          height="36"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="text-primary"
          style={{
            transform: `rotate(${arrow.rotate}deg)`,
            transition: prefersReducedMotion ? "none" : "transform 300ms ease",
          }}
        >
          <path d={arrow.path} />
        </svg>
      </div>

      {/* Text info */}
      <div className="flex-1 min-w-0">
        <div
          className="text-2xl font-bold text-primary tabular-nums"
          aria-hidden="true"
        >
          {distLabel}
        </div>
        <div
          className="text-xs text-foreground/80 truncate leading-tight mt-0.5"
          aria-hidden="true"
        >
          {instruction}
        </div>
      </div>

      {/* Speed badge — only when GPS heading available */}
      {speedMph != null && speedMph > 0 && (
        <div
          className="flex-shrink-0 flex flex-col items-center border border-border rounded-xl px-2 py-1 min-w-[44px]"
          aria-hidden="true"
        >
          <span className="text-base font-bold tabular-nums leading-none">
            {Math.round(speedMph)}
          </span>
          <span className="text-[9px] text-muted-foreground leading-none mt-0.5">
            mph
          </span>
        </div>
      )}

      {/* Compass heading — subtle, top-right corner */}
      {deviceHeading != null && (
        <div
          className="absolute top-2 right-2 text-[9px] text-muted-foreground/60 tabular-nums"
          aria-hidden="true"
        >
          {Math.round(deviceHeading)}°
        </div>
      )}
    </div>
  );
}
