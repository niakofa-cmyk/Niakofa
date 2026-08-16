/**
 * LegacyWeatherOverlay — chapter-driven weather particle system.
 *
 * Renders as a fixed full-screen overlay (pointer-events-none) that sits on top
 * of the world. Weather intensity and type are driven by the chapter's narrative
 * phase — morning sun, darkening clouds for tension chapters, rain for collapse,
 * fog/storm for migration.
 *
 * Design principle from ASSET_PIPELINE_ANALYSIS.md:
 *   "Lighting/weather state → runtime tint/overlay over one base image."
 *   This IS the runtime overlay. It does not require separate painted backgrounds.
 */

import { useMemo } from "react";

export type LegacyWeatherType =
  | "clear"       // bright sunlight — warm amber tint
  | "overcast"    // clouds gathering — desaturated
  | "rain"        // heavy rain — dark + streaks
  | "storm"       // storm (migration chapter) — rain + lightning flash
  | "fog"         // coastal/ocean fog — white mist
  | "dust"        // harmattan dust — ochre haze
  | "golden"      // golden afternoon — warm late-day light
  | "night";      // night stars

export interface LegacyWeatherOverlayProps {
  weather: LegacyWeatherType;
  /** 0–1. 0 = barely there, 1 = full intensity. Lets you fade in gradually. */
  intensity?: number;
}

/** Derive weather from scene progress (0–1) and chapter era for use in legacy-chapter.tsx */
export function deriveChapterWeather(
  sceneProgress: number,
  era?: string,
): LegacyWeatherType {
  // Night scenes (last quarter of chapter)
  if (sceneProgress >= 0.75) return "night";
  // Evening golden light (third quarter)
  if (sceneProgress >= 0.5) return "golden";
  // Collapse/tension era (1920s)
  if (era && (era.includes("1920") || era.includes("1930") || era.includes("collapse"))) {
    if (sceneProgress >= 0.4) return "rain";
    return "overcast";
  }
  // Migration era
  if (era && (era.includes("migration") || era.includes("diaspora") || era.includes("1935") || era.includes("1940"))) {
    return sceneProgress >= 0.5 ? "storm" : "fog";
  }
  // Harmattan (dry season, Gold Coast 1890–1910)
  if (era && (era.includes("1890") || era.includes("1900") || era.includes("1910"))) {
    return sceneProgress >= 0.6 ? "dust" : "clear";
  }
  return "clear";
}

interface RainDrop {
  x: number; // 0-100vw
  delay: number; // s
  duration: number; // s
  opacity: number;
  width: number;
}

function useRainDrops(count: number): RainDrop[] {
  return useMemo(() => {
    const drops: RainDrop[] = [];
    // Deterministic seeding so drops don't flicker on re-render
    for (let i = 0; i < count; i++) {
      const seed = i * 137.508 + 13; // golden angle spread
      drops.push({
        x: ((seed * 7.3) % 100),
        delay: (seed * 0.031) % 2,
        duration: 0.4 + (seed * 0.017) % 0.4,
        opacity: 0.15 + (seed * 0.009) % 0.35,
        width: 1 + (i % 2),
      });
    }
    return drops;
  }, [count]);
}

interface StarParticle {
  x: number;
  y: number;
  size: number;
  delay: number;
  duration: number;
}

function useStars(count: number): StarParticle[] {
  return useMemo(() => {
    const stars: StarParticle[] = [];
    for (let i = 0; i < count; i++) {
      const seed = i * 79.39 + 7;
      stars.push({
        x: (seed * 11.3) % 100,
        y: (seed * 7.7) % 60,
        size: 1 + (i % 3 === 0 ? 1 : 0),
        delay: (seed * 0.04) % 4,
        duration: 2 + (seed * 0.03) % 3,
      });
    }
    return stars;
  }, [count]);
}

export function LegacyWeatherOverlay({ weather, intensity = 1 }: LegacyWeatherOverlayProps) {
  const rainDrops = useRainDrops(weather === "storm" ? 80 : weather === "rain" ? 50 : 0);
  const stars = useStars(weather === "night" ? 40 : 0);
  const eff = Math.max(0, Math.min(1, intensity));

  if (weather === "clear") return null;

  return (
    <div
      className="fixed inset-0 pointer-events-none overflow-hidden"
      style={{ zIndex: 15 }}
      aria-hidden="true"
    >
      {/* ─── Tint layer ─────────────────────────────────────────────────── */}
      {weather === "overcast" && (
        <div
          className="absolute inset-0"
          style={{ background: `rgba(60,70,80,${0.18 * eff})` }}
        />
      )}
      {weather === "rain" && (
        <div
          className="absolute inset-0"
          style={{ background: `rgba(20,30,50,${0.30 * eff})` }}
        />
      )}
      {weather === "storm" && (
        <div
          className="absolute inset-0"
          style={{ background: `rgba(10,15,35,${0.45 * eff})` }}
        />
      )}
      {weather === "fog" && (
        <div
          className="absolute inset-0"
          style={{
            background: `radial-gradient(ellipse at 50% 110%, rgba(255,255,255,${0.22 * eff}) 0%, rgba(200,210,220,${0.10 * eff}) 60%, transparent 100%)`,
          }}
        />
      )}
      {weather === "dust" && (
        <div
          className="absolute inset-0"
          style={{ background: `rgba(180,140,80,${0.12 * eff})` }}
        />
      )}
      {weather === "golden" && (
        <div
          className="absolute inset-0"
          style={{
            background: `radial-gradient(ellipse at 70% 0%, rgba(255,200,80,${0.12 * eff}) 0%, transparent 70%)`,
          }}
        />
      )}
      {weather === "night" && (
        <div
          className="absolute inset-0"
          style={{ background: `rgba(5,8,20,${0.50 * eff})` }}
        />
      )}

      {/* ─── Rain streaks ────────────────────────────────────────────────── */}
      {(weather === "rain" || weather === "storm") && (
        <div className="absolute inset-0">
          {rainDrops.map((drop, i) => (
            <div
              key={i}
              className="absolute"
              style={{
                left: `${drop.x}%`,
                top: "-10px",
                width: `${drop.width}px`,
                height: "60px",
                background: `rgba(180,210,255,${drop.opacity * eff})`,
                transform: "rotate(12deg)",
                animation: `fall ${drop.duration}s ${drop.delay}s linear infinite`,
                opacity: eff,
              }}
            />
          ))}
        </div>
      )}

      {/* ─── Fog wisps ──────────────────────────────────────────────────── */}
      {weather === "fog" && (
        <>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="absolute bottom-0 w-full"
              style={{
                height: `${30 + i * 15}%`,
                background: `linear-gradient(to top, rgba(220,230,240,${(0.15 - i * 0.04) * eff}), transparent)`,
                animation: `drift ${8 + i * 3}s ease-in-out ${i * 2}s infinite alternate`,
              }}
            />
          ))}
        </>
      )}

      {/* ─── Dust haze ──────────────────────────────────────────────────── */}
      {weather === "dust" && (
        <div
          className="absolute inset-0"
          style={{
            background: `url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/></filter><rect width='200' height='200' filter='url(%23n)' opacity='0.08'/></svg>") repeat`,
            opacity: 0.5 * eff,
          }}
        />
      )}

      {/* ─── Night stars ────────────────────────────────────────────────── */}
      {weather === "night" && (
        <div className="absolute inset-0">
          {stars.map((star, i) => (
            <div
              key={i}
              className="absolute rounded-full bg-amber-100"
              style={{
                left: `${star.x}%`,
                top: `${star.y}%`,
                width: `${star.size}px`,
                height: `${star.size}px`,
                opacity: 0.4 * eff,
                animation: `pulse ${star.duration}s ease-in-out ${star.delay}s infinite`,
              }}
            />
          ))}
        </div>
      )}

      {/* ─── Storm lightning flash ──────────────────────────────────────── */}
      {weather === "storm" && (
        <div
          className="absolute inset-0 bg-white/5"
          style={{ animation: `lightning 6s ease-in-out 3s infinite` }}
        />
      )}

      {/* ─── CSS keyframes (injected inline) ────────────────────────────── */}
      <style>{`
        @keyframes fall {
          from { transform: rotate(12deg) translateY(-80px); }
          to   { transform: rotate(12deg) translateY(110vh); }
        }
        @keyframes drift {
          from { transform: translateX(-10px); }
          to   { transform: translateX(10px); }
        }
        @keyframes lightning {
          0%, 90%, 100% { opacity: 0; }
          92%           { opacity: 0.3; }
          94%           { opacity: 0; }
          96%           { opacity: 0.15; }
          98%           { opacity: 0; }
        }
      `}</style>
    </div>
  );
}
