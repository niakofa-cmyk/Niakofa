/**
 * Elephant/ElephantSvg.tsx
 *
 * African Elephant spirit animal companion — warm earth, dust motes, sunrise.
 * Grounded, steady, unhurried. Walks with ancient wisdom.
 *
 * Data-attrs applied by SpiritController:
 *   data-elephant-phase: idle | observe | travel | navigate | celebrate | alert | interact | rest | guide
 *   data-elephant-stride: normal | long
 *   data-elephant-trumpet: true
 *   data-elephant-ears: flare
 */

import { useMemo } from "react";
import type { SpiritCompanionProps } from "@/components/SpiritAnimal/types";
import { computeSpiritBehavior } from "@/components/SpiritAnimal/SpiritController";

export interface ElephantProps extends SpiritCompanionProps {}

export function ElephantSvg({
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
}: ElephantProps) {
  const behavior = useMemo(
    () =>
      computeSpiritBehavior("elephant", {
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

  // Heading: face left (<90 or >270 heading) vs right
  const facingRight = heading == null || (heading >= 90 && heading <= 270);
  const scaleX = facingRight ? 1 : -1;

  // Animation class from gait
  const isWalking = behavior.gait === "walk" || behavior.gait === "trot";
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
        transition: "transform var(--spirit-transition-dur, 260ms) var(--spirit-transition-ease, ease)",
        filter: isCelebrating
          ? "drop-shadow(0 0 6px rgba(205, 133, 66, 0.9))"
          : isAlerting
          ? "drop-shadow(0 0 4px rgba(205, 133, 66, 0.6))"
          : "drop-shadow(0 2px 4px rgba(0,0,0,0.3))",
      }}
      {...(Object.fromEntries(
        Object.entries(behavior.dataAttrs).map(([k, v]) => [k, v])
      ) as Record<string, string>)}
    >
      <style>{`
        @keyframes elephant-walk {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-1.5px); }
        }
        @keyframes elephant-breathe {
          0%, 100% { transform: scaleY(1); }
          50% { transform: scaleY(1.03); }
        }
        @keyframes elephant-trumpet {
          0%, 100% { transform: rotate(0deg); }
          25% { transform: rotate(-15deg); }
          75% { transform: rotate(10deg); }
        }
        @keyframes elephant-ear-flare {
          0%, 100% { transform: scaleX(1); }
          50% { transform: scaleX(1.2); }
        }
        .elephant-body {
          animation: ${isWalking ? `elephant-walk ${0.9 / Math.max(0.3, behavior.intensity)}s ease-in-out infinite` :
                       !batterySaver ? "elephant-breathe 3.8s ease-in-out infinite" : "none"};
          transform-origin: 24px 30px;
        }
        .elephant-trunk {
          animation: ${isCelebrating ? "elephant-trumpet 0.7s ease-in-out infinite" : "none"};
          transform-origin: 14px 28px;
        }
        .elephant-ear {
          animation: ${isAlerting ? "elephant-ear-flare 0.8s ease-in-out infinite" : "none"};
          transform-origin: 30px 22px;
        }
      `}</style>

      {/* Dust particles when walking */}
      {isWalking && (
        <>
          <circle cx="12" cy="42" r="2" fill="rgba(210,105,30,0.25)" style={{ animation: "elephant-breathe 1.2s ease-in-out infinite" }} />
          <circle cx="8" cy="43" r="1.5" fill="rgba(210,105,30,0.18)" style={{ animation: "elephant-breathe 1.5s ease-in-out infinite 0.3s" }} />
        </>
      )}

      {/* Body */}
      <g className="elephant-body">
        {/* Main body — warm grey with earth tones */}
        <ellipse cx="24" cy="30" rx="14" ry="10" fill="#8B7355" />
        <ellipse cx="24" cy="28" rx="13" ry="9" fill="#9C8B6E" />

        {/* Head */}
        <ellipse cx="17" cy="21" rx="9" ry="8" fill="#9C8B6E" />
        <ellipse cx="17" cy="20" rx="8" ry="7" fill="#A89575" />

        {/* Ear */}
        <g className="elephant-ear">
          <ellipse cx="26" cy="21" rx="7" ry="9" fill="#8B7355" opacity="0.9" />
          <ellipse cx="26" cy="21" rx="5.5" ry="7" fill="#CD8542" opacity="0.4" />
        </g>

        {/* Trunk */}
        <g className="elephant-trunk">
          <path
            d="M 11 26 Q 7 28 6 32 Q 5 36 9 37"
            stroke="#8B7355"
            strokeWidth="4"
            strokeLinecap="round"
            fill="none"
          />
          <path
            d="M 11 26 Q 7 28 6 32 Q 5 36 9 37"
            stroke="#9C8B6E"
            strokeWidth="2.5"
            strokeLinecap="round"
            fill="none"
          />
        </g>

        {/* Tusk */}
        <path
          d="M 12 27 Q 10 29 11 31"
          stroke="#F5E6C8"
          strokeWidth="1.5"
          strokeLinecap="round"
          fill="none"
        />

        {/* Eye */}
        <circle cx="14" cy="19" r="2" fill="#2D1B0E" />
        <circle cx="14.6" cy="18.4" r="0.6" fill="white" opacity="0.8" />

        {/* Legs */}
        <rect x="13" y="37" width="5" height="7" rx="2" fill="#8B7355" />
        <rect x="19" y="37" width="5" height="7" rx="2" fill="#8B7355" />
        <rect x="25" y="37" width="5" height="7" rx="2" fill="#7A6348" />
        <rect x="31" y="37" width="5" height="7" rx="2" fill="#7A6348" />

        {/* Tail */}
        <path
          d="M 37 28 Q 41 30 40 34"
          stroke="#8B7355"
          strokeWidth="1.5"
          strokeLinecap="round"
          fill="none"
        />

        {/* Celebration glow */}
        {isCelebrating && (
          <ellipse cx="17" cy="21" rx="9" ry="8" fill="rgba(205,133,66,0.25)" />
        )}
      </g>

      {/* Sunrise glow underneath when active */}
      {!batterySaver && (
        <ellipse
          cx="24"
          cy="44"
          rx="12"
          ry="2"
          fill="rgba(205,133,66,0.12)"
          style={{ animation: "elephant-breathe 3.8s ease-in-out infinite" }}
        />
      )}
    </svg>
  );
}
