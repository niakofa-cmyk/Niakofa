interface LocationPuckProps {
  /** World-frame heading in degrees (0 = true north), or null if unknown. */
  heading: number | null;
  /** Current map camera bearing in degrees — 0 in north-up mode, live in heading-up mode. */
  mapBearing: number;
  size?: number;
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
export function LocationPuck({ heading, mapBearing, size = 34 }: LocationPuckProps) {
  const hasHeading = typeof heading === "number" && !Number.isNaN(heading);
  // Screen-space rotation is the heading relative to the current camera
  // bearing, wrapped into [0, 360) for a clean CSS transform value.
  const screenRotationDeg = hasHeading ? ((((heading as number) - mapBearing) % 360) + 360) % 360 : 0;

  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <div
        className="absolute rounded-full bg-primary opacity-15 animate-ping"
        style={{ width: size, height: size, animationDuration: "2s" }}
      />
      <div
        className="absolute rounded-full bg-primary opacity-25 animate-ping"
        style={{ width: size * 0.6, height: size * 0.6, animationDuration: "2s", animationDelay: "0.5s" }}
      />

      {hasHeading ? (
        <div
          className="absolute transition-transform duration-150 ease-linear"
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
