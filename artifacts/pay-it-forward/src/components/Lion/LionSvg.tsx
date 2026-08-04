/**
 * Lion/LionSvg.tsx
 *
 * Lion spirit animal companion — golden savannah, sovereign authority.
 * Patrols. Regal. Bold typography. Warm gold.
 *
 * Data-attrs applied by SpiritController:
 *   data-lion-phase: idle | observe | travel | navigate | celebrate | alert | interact | rest | guide
 *   data-lion-gait: sprint | patrol
 *   data-lion-survey: true
 *   data-lion-roar: true
 *   data-lion-mane: flare
 */

import { useMemo } from "react";
import type { SpiritCompanionProps } from "@/components/SpiritAnimal/types";
import { computeSpiritBehavior } from "@/components/SpiritAnimal/SpiritController";

export interface LionProps extends SpiritCompanionProps {}

export function LionSvg({
  heading,
  size = 48,
  celebrating,
  newNotification,
  accepted,
  donated,
  navigating,
  isHelping,
  batterySaver,
  nearbyUser,
  speed,
  activityLevel,
  upcomingTurnDirection,
}: LionProps) {
  const behavior = useMemo(
    () =>
      computeSpiritBehavior("lion", {
        heading,
        celebrating,
        newNotification,
        accepted,
        donated,
        navigating,
        isHelping,
        batterySaver,
        nearbyUser,
        speed,
        activityLevel,
        upcomingTurnDirection,
      }),
    [heading, celebrating, newNotification, accepted, donated, navigating,
     isHelping, batterySaver, nearbyUser, speed, activityLevel, upcomingTurnDirection]
  );

  const facingRight = heading == null || (heading >= 90 && heading <= 270);
  const scaleX = facingRight ? 1 : -1;

  const isMoving = behavior.gait !== "idle";
  const isCelebrating = behavior.celebrating;
  const isAlerting = behavior.alerting;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{
        transform: `scaleX(${scaleX})`,
        overflow: "visible",
        transition: "transform var(--spirit-transition-dur, 320ms) var(--spirit-transition-ease, ease)",
        filter: isCelebrating
          ? "drop-shadow(0 0 8px rgba(218, 165, 32, 0.95))"
          : isAlerting
          ? "drop-shadow(0 0 5px rgba(218, 165, 32, 0.7))"
          : "drop-shadow(0 2px 5px rgba(0,0,0,0.35))",
      }}
      {...(Object.fromEntries(
        Object.entries(behavior.dataAttrs).map(([k, v]) => [k, v])
      ) as Record<string, string>)}
    >
      <style>{`
        @keyframes lion-patrol {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          50% { transform: translateY(-2px) rotate(0.5deg); }
        }
        @keyframes lion-breathe {
          0%, 100% { transform: scaleY(1); }
          50% { transform: scaleY(1.04); }
        }
        @keyframes lion-roar {
          0%, 100% { transform: scaleX(1) scaleY(1); }
          30% { transform: scaleX(1.1) scaleY(1.15); }
          60% { transform: scaleX(0.95) scaleY(1.05); }
        }
        @keyframes lion-mane-flare {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.15); opacity: 0.9; }
        }
        @keyframes lion-tail-swish {
          0%, 100% { transform: rotate(0deg); }
          33% { transform: rotate(20deg); }
          66% { transform: rotate(-15deg); }
        }
        .lion-body {
          animation: ${isMoving ? `lion-patrol ${0.8 / Math.max(0.3, behavior.intensity)}s ease-in-out infinite` :
                       !batterySaver ? "lion-breathe 3.2s ease-in-out infinite" : "none"};
          transform-origin: 24px 30px;
        }
        .lion-head {
          animation: ${isCelebrating ? "lion-roar 0.8s ease-in-out infinite" : "none"};
          transform-origin: 17px 20px;
        }
        .lion-mane {
          animation: ${isAlerting ? "lion-mane-flare 0.7s ease-in-out infinite" :
                       !batterySaver ? "lion-breathe 4s ease-in-out infinite 0.5s" : "none"};
          transform-origin: 17px 20px;
        }
        .lion-tail {
          animation: ${!batterySaver ? "lion-tail-swish 2.5s ease-in-out infinite" : "none"};
          transform-origin: 37px 28px;
        }
      `}</style>

      {/* Golden savannah dust */}
      {isMoving && !batterySaver && (
        <>
          <circle cx="10" cy="43" r="2.5" fill="rgba(218,165,32,0.2)" style={{ animation: "lion-breathe 1s ease-in-out infinite" }} />
          <circle cx="6" cy="44" r="1.5" fill="rgba(218,165,32,0.15)" style={{ animation: "lion-breathe 1.3s ease-in-out infinite 0.2s" }} />
        </>
      )}

      {/* Body */}
      <g className="lion-body">
        {/* Main body */}
        <ellipse cx="26" cy="30" rx="13" ry="9" fill="#C8960C" />
        <ellipse cx="26" cy="29" rx="12" ry="8" fill="#DAA520" />

        {/* Head + Mane */}
        <g className="lion-mane">
          {/* Mane outer ring */}
          <circle cx="17" cy="21" r="12" fill="#8B6914" opacity="0.85" />
          <circle cx="17" cy="21" r="10" fill="#A07820" opacity="0.7" />
        </g>

        <g className="lion-head">
          {/* Face */}
          <circle cx="17" cy="21" r="8" fill="#DAA520" />
          <circle cx="17" cy="21" r="7" fill="#E6B830" />

          {/* Nose area */}
          <ellipse cx="17" cy="24" rx="4" ry="2.5" fill="#C8960C" />

          {/* Nose */}
          <ellipse cx="17" cy="23.5" rx="1.8" ry="1.2" fill="#8B4513" />

          {/* Eyes */}
          <circle cx="13.5" cy="19" r="2.2" fill="#1A0A00" />
          <circle cx="20.5" cy="19" r="2.2" fill="#1A0A00" />
          {/* Amber iris */}
          <circle cx="13.5" cy="19" r="1.5" fill="#FF8C00" />
          <circle cx="20.5" cy="19" r="1.5" fill="#FF8C00" />
          {/* Pupil */}
          <circle cx="13.5" cy="19" r="0.7" fill="#1A0A00" />
          <circle cx="20.5" cy="19" r="0.7" fill="#1A0A00" />
          {/* Eye shine */}
          <circle cx="14" cy="18.5" r="0.4" fill="white" opacity="0.9" />
          <circle cx="21" cy="18.5" r="0.4" fill="white" opacity="0.9" />

          {/* Whisker marks */}
          <circle cx="14" cy="24" r="0.5" fill="#8B6914" opacity="0.6" />
          <circle cx="17" cy="24.5" r="0.5" fill="#8B6914" opacity="0.6" />
          <circle cx="20" cy="24" r="0.5" fill="#8B6914" opacity="0.6" />
        </g>

        {/* Legs */}
        <rect x="14" y="36" width="5" height="8" rx="2" fill="#C8960C" />
        <rect x="20" y="36" width="5" height="8" rx="2" fill="#C8960C" />
        <rect x="27" y="36" width="5" height="8" rx="2" fill="#B8860B" />
        <rect x="33" y="36" width="5" height="8" rx="2" fill="#B8860B" />

        {/* Paws */}
        <ellipse cx="16.5" cy="44" rx="3" ry="1.5" fill="#B8860B" />
        <ellipse cx="22.5" cy="44" rx="3" ry="1.5" fill="#B8860B" />
        <ellipse cx="29.5" cy="44" rx="3" ry="1.5" fill="#A07820" />
        <ellipse cx="35.5" cy="44" rx="3" ry="1.5" fill="#A07820" />

        {/* Tail */}
        <g className="lion-tail">
          <path
            d="M 38 27 Q 43 28 44 32 Q 45 36 42 37"
            stroke="#C8960C"
            strokeWidth="2.5"
            strokeLinecap="round"
            fill="none"
          />
          {/* Tail tuft */}
          <circle cx="41.5" cy="37" r="3" fill="#8B6914" />
        </g>

        {/* Celebration glow */}
        {isCelebrating && (
          <circle cx="17" cy="21" r="14" fill="rgba(218,165,32,0.2)" />
        )}
      </g>

      {/* Ground shadow */}
      {!batterySaver && (
        <ellipse
          cx="26"
          cy="45"
          rx="11"
          ry="1.5"
          fill="rgba(218,165,32,0.1)"
        />
      )}
    </svg>
  );
}
