import { useIsAnimationSuppressed } from "@/hooks/useAnimationPreference";
import type { LocationMarkerState } from "@/lib/location-marker";

interface LocationPuckProps {
  /** World-frame heading in degrees (0 = true north), or null if unknown. */
  heading: number | null;
  /** Current map camera bearing in degrees — 0 in north-up mode, live in heading-up mode. */
  mapBearing: number;
  size?: number;
  /** GPS/fallback state used to distinguish live, stale, and approximate fixes. */
  locationState?: LocationMarkerState;
}

/**
 * LocationPuck
 *
 * The "blue dot" every serious nav app has — but with a directional cone
 * instead of a plain circle. Every real turn-by-turn product (Google Maps,
 * Waze, Apple Maps) rotates a cone/arrow to show which way you're actually
 * facing, independent of which way the camera is currently pointed.
 *
 * The cone's screen-space rotation is (heading - mapBearing), NOT just
 * `heading`, because:
 *   - In north-up mode, mapBearing stays 0, so the cone always points in
 *     your true compass direction on screen — turn around and it turns.
 *   - In heading-up mode, the camera rotates to match your heading, so the
 *     cone should stay pointing straight "up" on screen (heading - bearing
 *     ≈ 0 once the camera catches up) — exactly like Google Maps' arrow.
 *
 * When heading is unavailable (no compass/GPS course yet), we fall back to
 * a plain pulsing dot with no cone — matches the old behavior rather than
 * showing a meaningless/stale direction.
 */
export function LocationPuck({
  heading,
  mapBearing,
  size = 34,
  locationState,
}: LocationPuckProps) {
  const hasHeading = typeof heading === "number" && !Number.isNaN(heading);
  const suppressed = useIsAnimationSuppressed();
  const signal = locationState?.signal ?? "live";
  const accuracyMeters = locationState?.accuracyMeters ?? null;
  const accuracyRatio = accuracyMeters == null
    ? 0
    : Math.min(1, Math.max(0, accuracyMeters) / 200);
  // The ring is proportional to the reported horizontal accuracy, capped so a
  // poor fix cannot cover the whole map. It is intentionally not a map-scale
  // circle: its job is to communicate confidence at marker size.
  const accuracyDiameter = accuracyMeters == null
    ? 0
    : size * (1.2 + accuracyRatio * 2.3);
  const signalLabel =
    signal === "live" ? "Live GPS location" :
    signal === "stale" ? "Stale GPS location" :
    signal === "privacy" ? "Privacy-protected approximate location" :
    "Approximate location";
  // Screen-space rotation is the heading relative to the current camera
  // bearing, wrapped into [0, 360) for a clean CSS transform value.
  const screenRotationDeg = hasHeading ? ((((heading as number) - mapBearing) % 360) + 360) % 360 : 0;

  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: size, height: size }}
      aria-label={signalLabel}
      data-location-signal={signal}
      data-location-accuracy-meters={accuracyMeters == null ? undefined : Math.round(accuracyMeters)}
    >
      {/* Reported horizontal GPS accuracy. This ring is omitted for IP/privacy
          locations because those sources do not provide meter-level accuracy. */}
      {accuracyDiameter > 0 && (
        <div
          className={`absolute rounded-full border border-primary/45 ${
            signal === "stale" ? "border-dashed opacity-60" : "opacity-70"
          }`}
          style={{ width: accuracyDiameter, height: accuracyDiameter }}
          title={`GPS accuracy approximately ${Math.round(accuracyMeters!)} meters`}
        />
      )}
      {/* A small source ring keeps approximate/privacy state visible without
          changing the canonical blue puck or implying false GPS precision. */}
      {accuracyDiameter === 0 && signal !== "live" && (
        <div
          className={`absolute rounded-full border ${
            signal === "privacy" ? "border-violet-300/70" : "border-amber-300/70"
          } ${signal === "stale" ? "border-dashed opacity-60" : "opacity-70"}`}
          style={{ width: size * 1.45, height: size * 1.45 }}
        />
      )}
      {/* GPS accuracy rings — animated only when motion is allowed. */}
      {suppressed ? (
        <div
          className="absolute rounded-full bg-primary opacity-10"
          style={{ width: size, height: size }}
        />
      ) : (
        <>
          <div
            className="absolute rounded-full bg-primary opacity-15 animate-ping"
            style={{ width: size, height: size, animationDuration: "2s" }}
          />
          <div
            className="absolute rounded-full bg-primary opacity-25 animate-ping"
            style={{ width: size * 0.6, height: size * 0.6, animationDuration: "2s", animationDelay: "0.5s" }}
          />
        </>
      )}

      {hasHeading ? (
        <div
          className={`absolute transition-transform duration-150 ease-linear ${
            signal === "stale" || signal === "privacy" ? "opacity-60" : ""
          }`}
          style={{
            width: size,
            height: size,
            transform: `rotate(${screenRotationDeg}deg)`,
            willChange: "transform",
          }}
        >
          <svg
            width={size}
            height={size}
            viewBox="0 0 34 34"
            className="drop-shadow-[0_0_10px_rgba(0,212,255,0.9)]"
          >
            {/* Directional cone — wide base pointing away from travel direction, apex up */}
            <path
              d="M17 2 L26 26 L17 20.5 L8 26 Z"
              fill="hsl(190, 100%, 50%)"
              stroke="white"
              strokeWidth="1"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      ) : null}

      <div
        className="rounded-full bg-primary border-2 border-background shadow-[0_0_12px_rgba(0,212,255,0.9)]"
        style={{ width: size * 0.32, height: size * 0.32 }}
      />
    </div>
  );
}
