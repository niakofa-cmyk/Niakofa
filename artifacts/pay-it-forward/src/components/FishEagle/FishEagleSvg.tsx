/**
 * FishEagle/FishEagleSvg.tsx
 *
 * Fish Eagle spirit animal companion — rivers, blue skies, flowing motion.
 * Circles. Soars. Crisp, clean, wide open.
 *
 * Data-attrs applied by SpiritController:
 *   data-eagle-phase: idle | observe | travel | navigate | celebrate | alert | interact | rest | guide
 *   data-eagle-circle: true | tight | wide
 *   data-eagle-dive: true
 *   data-eagle-hover: true
 */

import { useMemo } from "react";
import type { SpiritCompanionProps } from "@/components/SpiritAnimal/types";
import { computeSpiritBehavior } from "@/components/SpiritAnimal/SpiritController";

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface FishEagleProps extends SpiritCompanionProps {}

export function FishEagleSvg({
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
}: FishEagleProps) {
  const behavior = useMemo(
    () =>
      computeSpiritBehavior("fish_eagle", {
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

  const isFlying = behavior.gait === "fly" || behavior.gait === "soar" || behavior.gait === "glide";
  const isCelebrating = behavior.celebrating;
  const isAlerting = behavior.alerting;
  const isSoaring = behavior.gait === "soar";

  // Wing spread based on gait
  const wingSpread = isSoaring ? 1.15 : isFlying ? 1.05 : 0.85;
  const wingY = isSoaring ? 16 : isFlying ? 18 : 22;

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
        transition: "transform var(--spirit-transition-dur, 340ms) var(--spirit-transition-ease, ease)",
        filter: isCelebrating
          ? "drop-shadow(0 0 8px rgba(30, 143, 220, 0.9))"
          : isAlerting
          ? "drop-shadow(0 0 5px rgba(30, 143, 220, 0.6))"
          : "drop-shadow(0 2px 6px rgba(0,0,0,0.3))",
      }}
      {...(Object.fromEntries(
        Object.entries(behavior.dataAttrs).map(([k, v]) => [k, v])
      ) as Record<string, string>)}
    >
      <style>{`
        @keyframes eagle-glide {
          0%, 100% { transform: translateY(0px) rotate(-1deg); }
          50% { transform: translateY(-3px) rotate(1deg); }
        }
        @keyframes eagle-soar {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-5px); }
        }
        @keyframes eagle-flap {
          0%, 100% { transform: scaleY(1); }
          50% { transform: scaleY(0.7); }
        }
        @keyframes eagle-breathe {
          0%, 100% { transform: scaleY(1); }
          50% { transform: scaleY(1.04); }
        }
        @keyframes eagle-dive {
          0%, 100% { transform: rotate(0deg); }
          50% { transform: rotate(15deg) translateY(3px); }
        }
        @keyframes eagle-hover {
          0%, 100% { transform: translateY(0px) scaleY(1); }
          25% { transform: translateY(-2px) scaleY(0.85); }
          75% { transform: translateY(2px) scaleY(1.05); }
        }
        .eagle-body {
          animation: ${
            isCelebrating ? `eagle-dive 0.8s ease-in-out infinite` :
            isAlerting ? `eagle-hover 0.6s ease-in-out infinite` :
            isSoaring ? `eagle-soar ${1.2 / Math.max(0.3, behavior.intensity)}s ease-in-out infinite` :
            isFlying ? `eagle-glide ${1.5 / Math.max(0.3, behavior.intensity)}s ease-in-out infinite` :
            !batterySaver ? "eagle-breathe 3.5s ease-in-out infinite" : "none"
          };
          transform-origin: 24px 26px;
        }
        .eagle-left-wing {
          animation: ${isFlying && !batterySaver ? `eagle-flap ${0.7 / Math.max(0.3, behavior.intensity)}s ease-in-out infinite` : "none"};
          transform-origin: 24px 24px;
        }
        .eagle-right-wing {
          animation: ${isFlying && !batterySaver ? `eagle-flap ${0.7 / Math.max(0.3, behavior.intensity)}s ease-in-out infinite 0.35s` : "none"};
          transform-origin: 24px 24px;
        }
      `}</style>

      {/* Ripple circle effect when circling */}
      {behavior.dataAttrs["data-eagle-circle"] && !batterySaver && (
        <circle
          cx="24"
          cy="44"
          r="8"
          fill="none"
          stroke="rgba(30,143,220,0.2)"
          strokeWidth="1"
          style={{ animation: "eagle-soar 2s ease-in-out infinite" }}
        />
      )}

      <g className="eagle-body">
        {/* === Wings === */}
        {/* Left wing (far) */}
        <g className="eagle-left-wing">
          <path
            d={`M 24 ${wingY + 4} Q ${24 - 14 * wingSpread} ${wingY} ${24 - 22 * wingSpread} ${wingY + 4} Q ${24 - 16 * wingSpread} ${wingY + 8} 24 ${wingY + 10}`}
            fill="#1A5C8A"
            opacity="0.85"
          />
          {/* Wing tip accent — white (fish eagle's distinctive marking) */}
          <path
            d={`M ${24 - 18 * wingSpread} ${wingY + 3} Q ${24 - 20 * wingSpread} ${wingY + 2} ${24 - 22 * wingSpread} ${wingY + 4}`}
            stroke="white"
            strokeWidth="1.5"
            strokeLinecap="round"
            fill="none"
            opacity="0.7"
          />
        </g>

        {/* Right wing (near) */}
        <g className="eagle-right-wing">
          <path
            d={`M 24 ${wingY + 4} Q ${24 + 14 * wingSpread} ${wingY} ${24 + 22 * wingSpread} ${wingY + 4} Q ${24 + 16 * wingSpread} ${wingY + 8} 24 ${wingY + 10}`}
            fill="#2472A4"
            opacity="0.9"
          />
          <path
            d={`M ${24 + 18 * wingSpread} ${wingY + 3} Q ${24 + 20 * wingSpread} ${wingY + 2} ${24 + 22 * wingSpread} ${wingY + 4}`}
            stroke="white"
            strokeWidth="1.5"
            strokeLinecap="round"
            fill="none"
            opacity="0.7"
          />
        </g>

        {/* Body */}
        <ellipse cx="24" cy="26" rx="6" ry="8" fill="#1A5C8A" />
        {/* White chest — fish eagle's signature */}
        <ellipse cx="24" cy="24" rx="4" ry="5" fill="white" opacity="0.92" />

        {/* Head */}
        <circle cx="24" cy="17" r="5.5" fill="white" />
        <circle cx="24" cy="17" r="4.5" fill="#F5F5F0" />

        {/* Beak */}
        <path
          d="M 24 19.5 L 27.5 21 L 26 22.5 Z"
          fill="#DAA520"
        />

        {/* Eye */}
        <circle cx="22" cy="16" r="2" fill="#2D1B0E" />
        <circle cx="22" cy="16" r="1.3" fill="#FF6B00" />
        <circle cx="22" cy="16" r="0.6" fill="#1A0A00" />
        <circle cx="22.4" cy="15.5" r="0.3" fill="white" opacity="0.9" />

        {/* Yellow feet/talons (visible when perched/idle) */}
        {!isFlying && (
          <>
            <path d="M 21 34 L 19 38 M 21 34 L 21 39 M 21 34 L 23 38" stroke="#DAA520" strokeWidth="1.2" strokeLinecap="round" />
            <path d="M 27 34 L 25 38 M 27 34 L 27 39 M 27 34 L 29 38" stroke="#DAA520" strokeWidth="1.2" strokeLinecap="round" />
          </>
        )}

        {/* Tail feathers */}
        <path
          d="M 20 33 Q 24 35 28 33 Q 26 37 24 38 Q 22 37 20 33 Z"
          fill="#1A5C8A"
          opacity="0.8"
        />

        {/* Celebration glow */}
        {isCelebrating && (
          <circle cx="24" cy="22" r="10" fill="rgba(30,143,220,0.18)" />
        )}
      </g>

      {/* River shimmer reflection */}
      {!batterySaver && isFlying && (
        <ellipse
          cx="24"
          cy="46"
          rx="10"
          ry="1.5"
          fill="rgba(30,143,220,0.15)"
          style={{ animation: "eagle-soar 2.5s ease-in-out infinite" }}
        />
      )}
    </svg>
  );
}
