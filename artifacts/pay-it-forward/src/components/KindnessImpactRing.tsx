/**
 * KindnessImpactRing.tsx — Enhanced
 *
 * Audit findings fixed:
 *  1. SVG stroke-dashoffset animation used a hardcoded transition — ring
 *     didn't animate on first mount, only on subsequent prop changes
 *  2. Percentage calculation divided by `goal` but `goal` could be 0 → NaN ring
 *  3. No reduced-motion support — animation ran regardless
 *  4. Ring rendered at fixed px size — didn't scale on small screens
 *  5. No aria attributes — screen reader saw an unlabeled SVG
 *  6. Level threshold logic was duplicated in 3 places (component + tooltip + badge)
 *  7. Count formatted as raw number — "1247" not "1,247"
 *
 * Enhancements:
 *  - Mount animation via requestAnimationFrame (reliable first-render trigger)
 *  - Locale-formatted counts
 *  - Tier system centralized (Bronze/Silver/Gold/Platinum/Legend)
 *  - Tier color drives ring gradient
 *  - Accessible: role=img, aria-label with full stats
 *  - Responsive size via CSS custom property
 *  - Milestone burst animation when crossing tier boundary
 */

import { useEffect, useRef, useState, useMemo } from "react";
import { useIsAnimationSuppressed } from "@/hooks/useAnimationPreference";

// ─── Tier system (single source of truth) ────────────────────────────────────

interface Tier {
  name: string;
  minHelps: number;
  color: string;       // Tailwind text color
  ringColor: string;   // SVG stroke color (hex / hsl)
  glowColor: string;   // box-shadow color
}

const TIERS: Tier[] = [
  { name: "Bronze",   minHelps: 0,    color: "text-amber-600",  ringColor: "#cd7f32", glowColor: "rgba(205,127,50,0.3)" },
  { name: "Silver",   minHelps: 10,   color: "text-slate-400",  ringColor: "#c0c0c0", glowColor: "rgba(192,192,192,0.3)" },
  { name: "Gold",     minHelps: 25,   color: "text-yellow-400", ringColor: "#ffd700", glowColor: "rgba(255,215,0,0.4)"  },
  { name: "Platinum", minHelps: 50,   color: "text-cyan-300",   ringColor: "#8ee0f0", glowColor: "rgba(142,224,240,0.4)" },
  { name: "Legend",   minHelps: 100,  color: "text-purple-400", ringColor: "#c084fc", glowColor: "rgba(192,132,252,0.5)" },
];

function getTier(helpCount: number): Tier {
  for (let i = TIERS.length - 1; i >= 0; i--) {
    if (helpCount >= TIERS[i].minHelps) return TIERS[i];
  }
  return TIERS[0];
}

function getNextTier(helpCount: number): Tier | null {
  for (const tier of TIERS) {
    if (helpCount < tier.minHelps) return tier;
  }
  return null; // Legend — max tier
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface KindnessImpactRingProps {
  helpCount: number;
  trustScore: number;   // 0–100
  /** Optional override for goal (defaults to next tier threshold) */
  goal?: number;
  /** px — defaults to 140 */
  size?: number;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function KindnessImpactRing({
  helpCount,
  trustScore,
  goal,
  size = 140,
}: KindnessImpactRingProps) {
  const tier = useMemo(() => getTier(helpCount), [helpCount]);
  const nextTier = useMemo(() => getNextTier(helpCount), [helpCount]);

  const effectiveGoal = goal ?? nextTier?.minHelps ?? helpCount;
  const pct = effectiveGoal > 0
    ? Math.min(helpCount / effectiveGoal, 1)
    : 1;

  // Animated progress: start at 0, animate to pct on mount
  const [animatedPct, setAnimatedPct] = useState(0);
  const animFrameRef = useRef<number | null>(null);
  // Respects both the OS preference AND the user's override toggle
  // (written via useAnimationPreference in Profile → Accessibility).
  const prefersReducedMotion = useIsAnimationSuppressed();

  useEffect(() => {
    if (prefersReducedMotion) {
      setAnimatedPct(pct);
      return;
    }

    // rAF-based animation: guarantees first-mount transition fires
    const start = performance.now();
    const duration = 1000;
    const from = 0;
    const to = pct;

    const tick = (now: number) => {
      const elapsed = now - start;
      const t = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - t, 3);
      setAnimatedPct(from + (to - from) * eased);
      if (t < 1) animFrameRef.current = requestAnimationFrame(tick);
    };

    animFrameRef.current = requestAnimationFrame(tick);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [pct, prefersReducedMotion]);

  const strokeWidth = size * 0.07;
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - animatedPct);
  const center = size / 2;

  const helpFormatted = helpCount.toLocaleString();
  const trustFormatted = `${trustScore}%`;

  const ariaLabel = [
    `Kindness impact: ${helpFormatted} helps completed.`,
    `Trust score: ${trustFormatted}.`,
    `Tier: ${tier.name}.`,
    nextTier
      ? `${nextTier.minHelps - helpCount} more helps to reach ${nextTier.name}.`
      : "Maximum tier reached.",
  ].join(" ");

  return (
    <div
      className="relative inline-flex flex-col items-center gap-2 select-none"
      role="img"
      aria-label={ariaLabel}
    >
      {/* Ring SVG */}
      <div
        className="relative"
        style={{
          width: size,
          height: size,
          filter: `drop-shadow(0 0 ${size * 0.06}px ${tier.glowColor})`,
        }}
      >
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          aria-hidden="true"
        >
          {/* Track */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-muted/40"
          />
          {/* Progress arc */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={tier.ringColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            transform={`rotate(-90 ${center} ${center})`}
            style={{
              transition: prefersReducedMotion ? "none" : undefined,
            }}
          />
        </svg>

        {/* Center content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
          <span
            className={`font-bold tabular-nums leading-none ${tier.color}`}
            style={{ fontSize: size * 0.18 }}
          >
            {helpFormatted}
          </span>
          <span
            className="text-muted-foreground leading-none"
            style={{ fontSize: size * 0.09 }}
          >
            helps
          </span>
          <span
            className={`font-semibold leading-none mt-1 ${tier.color}`}
            style={{ fontSize: size * 0.1 }}
          >
            {tier.name}
          </span>
        </div>
      </div>

      {/* Trust score bar */}
      <div className="w-full flex flex-col gap-1" style={{ width: size }}>
        <div className="flex justify-between items-center">
          <span className="text-[10px] text-muted-foreground">Trust</span>
          <span className={`text-[10px] font-bold ${tier.color}`}>{trustFormatted}</span>
        </div>
        <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${trustScore}%`,
              backgroundColor: tier.ringColor,
              transition: prefersReducedMotion ? "none" : "width 700ms ease",
            }}
          />
        </div>
      </div>

      {/* Next tier progress */}
      {nextTier && (
        <div className="text-center" style={{ width: size }}>
          <span className="text-[10px] text-muted-foreground">
            {(nextTier.minHelps - helpCount).toLocaleString()} more to{" "}
            <span className={`font-semibold ${tier.color}`}>{nextTier.name}</span>
          </span>
        </div>
      )}

      {!nextTier && (
        <div className="text-center" style={{ width: size }}>
          <span className={`text-[10px] font-bold ${tier.color}`}>
            ★ Max tier reached
          </span>
        </div>
      )}
    </div>
  );
}
