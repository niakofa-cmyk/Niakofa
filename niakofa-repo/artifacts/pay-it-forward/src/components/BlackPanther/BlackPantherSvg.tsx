/**
 * Black Panther / African leopard spirit companion.
 *
 * This is an original, layered SVG master built for Niakofa's 40px marker
 * contract. The reference images in public/black-panther-reference/ guide the
 * silhouette, low stalking posture, visible melanistic rosettes, gold eyes,
 * and long counter-balancing tail without shipping raster art in the runtime.
 */

import { useId, type ReactElement } from "react";
import type { BlackPantherProps } from "./Core/Types";

const FUR_DARKEST = "#08090A";
const FUR_BASE = "#141618";
const FUR_MID = "#24282A";
const SPOT = "#3C4345";
const SPOT_HIGHLIGHT = "#687173";
const FUR_HIGHLIGHT = "#8B9696";
const MUSCLE_SHADE = "#4A5354";
const UNDERBODY = "#A8B0AE";
const WHISKER = "#D4DAD6";
const EYE_GOLD = "#FFD700";
const NOTIFY_ACCENT = "#00D4FF";

export function BlackPantherSvg({
  heading,
  mapBearing = 0,
  speed = 0,
  navigating = false,
  size = 40,
  celebrating = false,
  newNotification = false,
  accepted = false,
  donated = false,
  mapZoom = 14,
  batterySaver = false,
  nightMode = false,
  skyTier,
}: BlackPantherProps): ReactElement {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const furId = `bp-fur-${uid}`;
  const furNightId = `bp-fur-night-${uid}`;
  const eyeId = `bp-eye-${uid}`;
  const spotId = `bp-spot-${uid}`;
  const isNight = skyTier ? skyTier === "night" || skyTier === "twilight" : nightMode;
  const isMoving = !batterySaver && ((speed ?? 0) > 0.3 || navigating);
  const isSimplified = batterySaver || mapZoom < 10;
  const rotationDeg = heading == null ? 0 : heading - mapBearing;
  const reaction = celebrating || donated ? "celebrate" : newNotification ? "notify" : accepted ? "accepted" : "none";
  const playState = batterySaver ? "paused" : "running";

  return (
    <div
      className="bp-root"
      style={{
        width: size,
        height: size,
        transform: `rotate(${rotationDeg}deg)`,
        ["--bp-play-state" as string]: playState,
      }}
      aria-hidden="true"
    >
      <style>{`
        .bp-root { position: relative; contain: layout paint; }
        .bp-root svg { display: block; width: 100%; height: 100%; overflow: visible; }
        .bp-animated { animation-play-state: var(--bp-play-state, running); transform-box: fill-box; }
        .bp-fur { fill: url(#${isNight ? furNightId : furId}); }
        .bp-outline { stroke: #050606; stroke-width: .32; stroke-linejoin: round; }
        .bp-rosette { fill: url(#${spotId}); opacity: .78; }
        .bp-rosette-inner { fill: none; stroke: ${SPOT_HIGHLIGHT}; stroke-width: .28; opacity: .78; }
        .bp-detail { opacity: 1; transition: opacity 180ms ease; }
        .bp-simple { opacity: ${isSimplified ? "1" : "0"}; }
        @keyframes bp-breathe {
          0%, 100% { transform: scaleY(1); }
          50% { transform: scaleY(1.018); }
        }
        @keyframes bp-stalk {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-.45px); }
        }
        @keyframes bp-step-a {
          0%, 100% { transform: rotate(-8deg); }
          50% { transform: rotate(12deg); }
        }
        @keyframes bp-step-b {
          0%, 100% { transform: rotate(12deg); }
          50% { transform: rotate(-8deg); }
        }
        @keyframes bp-tail-idle {
          0%, 100% { transform: rotate(-5deg); }
          50% { transform: rotate(7deg); }
        }
        @keyframes bp-tail-walk {
          0%, 100% { transform: rotate(-12deg); }
          50% { transform: rotate(16deg); }
        }
        @keyframes bp-pounce {
          0% { transform: translateY(0) scale(1); }
          34% { transform: translateY(-2.1px) scale(1.045); }
          58% { transform: translateY(.3px) scale(.985); }
          100% { transform: translateY(0) scale(1); }
        }
        @keyframes bp-perk {
          0%, 100% { transform: rotate(0); }
          42% { transform: rotate(-8deg); }
        }
        @keyframes bp-ring {
          from { r: 3; opacity: .9; }
          to { r: 14; opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .bp-animated { animation: none !important; }
        }
      `}</style>

      <svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Black Panther spirit animal">
        <defs>
          <linearGradient id={furId} x1="0" y1="0" x2=".85" y2="1">
            <stop offset="0" stopColor={FUR_HIGHLIGHT} />
            <stop offset=".22" stopColor={FUR_MID} />
            <stop offset=".62" stopColor={FUR_BASE} />
            <stop offset="1" stopColor={FUR_DARKEST} />
          </linearGradient>
          <linearGradient id={furNightId} x1="0" y1="0" x2=".85" y2="1">
            <stop offset="0" stopColor="#394042" />
            <stop offset=".42" stopColor="#101314" />
            <stop offset="1" stopColor="#030404" />
          </linearGradient>
          <radialGradient id={spotId} cx=".38" cy=".28" r=".8">
            <stop offset="0" stopColor={SPOT_HIGHLIGHT} />
            <stop offset=".5" stopColor={SPOT} />
            <stop offset="1" stopColor="#111415" />
          </radialGradient>
          <radialGradient id={eyeId}>
            <stop offset="0" stopColor="#FFF6A2" />
            <stop offset=".35" stopColor={EYE_GOLD} />
            <stop offset="1" stopColor="#B87700" stopOpacity="0" />
          </radialGradient>
        </defs>

        {(reaction === "celebrate" || reaction === "notify") && !isSimplified && (
          <circle
            cx="20" cy="20" r="3" fill="none"
            stroke={reaction === "celebrate" ? EYE_GOLD : NOTIFY_ACCENT}
            strokeWidth="1.1" style={{ animation: "bp-ring 900ms ease-out 2" }}
          />
        )}

        <g
          className="bp-animated"
          transform="translate(2 1)"
          style={{
            transformOrigin: "18px 21px",
            animation: reaction === "celebrate"
              ? "bp-pounce 700ms ease-in-out 1"
              : isMoving ? "bp-stalk 520ms ease-in-out infinite" : "bp-breathe 3400ms ease-in-out infinite",
          }}
        >
          {/* Simplified silhouette stays readable at low zoom and in battery saver. */}
          <path className="bp-simple" d="M7 22c2-5 7-8 14-7 4 .4 7 2.2 9 5-3 2-7 4-12 4-4 0-8 0-11-2Z" fill={FUR_BASE} />

          {/* Tail: a long leopard tail with a dark tip, articulated at the hip. */}
          <g
            className="bp-animated"
            style={{
              transformOrigin: "8px 20px",
              animation: isMoving ? "bp-tail-walk 900ms ease-in-out infinite" : "bp-tail-idle 3400ms ease-in-out infinite",
            }}
          >
            <path d="M10.4 20.2C5.7 20.5 3.7 17.7 5.5 14c1.2-2.5 3.1-3.2 4.4-4.8 1-1.2.8-2.4-.2-3.3"
              fill="none" stroke={FUR_DARKEST} strokeWidth="2.5" strokeLinecap="round" />
            <path d="M10.4 19.7C6.1 20 4.8 17.4 6.1 14.3c1-2.4 3-3 4.2-4.8 1-1.4.8-2.5-.1-3.4"
              fill="none" stroke={FUR_HIGHLIGHT} strokeOpacity=".55" strokeWidth=".55" strokeLinecap="round" />
            {!isSimplified && (
              <path d="M6 15.1c1 .7 1.7 1 2.7 1.1M5.7 17.1c1 .4 1.9.5 2.7.4M8.1 11.8c.7.5 1.4.8 2.1.8"
                fill="none" stroke={SPOT} strokeWidth=".55" strokeLinecap="round" />
            )}
          </g>

          {/* Rear legs are behind the torso; tapered paths read better than bars at marker size. */}
          <g className="bp-animated" style={{ transformOrigin: "10px 22px", animation: isMoving ? "bp-step-b 520ms ease-in-out infinite" : "none" }}>
            <path className="bp-fur bp-outline" d="M9.4 20.2c-1.6 1.1-2.1 3.7-1.7 6.2l.6 3.8 1.8-.1.5-4.3 2-4.7Z" />
            {!isSimplified && <path d="M8.4 29.7c.8.9 1.8 1 2.6.2l-.2 1.1c-.8.7-2 .6-2.7-.2Z" fill={UNDERBODY} opacity=".7" />}
          </g>
          <g className="bp-animated" style={{ transformOrigin: "13px 22px", animation: isMoving ? "bp-step-a 520ms ease-in-out infinite" : "none" }}>
            <path className="bp-fur bp-outline" d="M12 20.3c-1.1 1.9-.9 4.3-.1 6.4l1.2 3.2 1.7-.4-.3-3.7 1.3-4.7Z" />
          </g>

          {/* Main body: chest, back, flank, and a shaded underbody. */}
          <path className="bp-fur bp-outline" d="M8.2 16.2c1.1-4.3 5.5-6.6 11.9-5.7 4.7.7 7.7 3.2 8.2 6.9.3 2.6-1.5 5-4.8 5.8-4.1 1-10.5.1-14.8-1.5-1.8-.7-2.7-3-1.1-5.5Z" />
          <path d="M10.7 19.7c3.7 1.3 10.3 2.1 15.4.2-1.3 2.1-4.6 3.2-8.3 2.8-3.1-.3-5.8-1.2-7.1-3Z" fill={UNDERBODY} opacity=".2" />
          <path d="M10.5 14.2c3.1-2 8.1-2.3 12.5-.6-2.9-.1-5.6.5-8.2 1.7-1.8.8-3.1.6-4.3-1.1Z" fill={FUR_HIGHLIGHT} opacity=".45" />
          <path d="M16.5 12.4c.8 1.1 1 2.3.7 3.8M22 12.9c.8 1.1 1.1 2.2 1 3.5" stroke={MUSCLE_SHADE} strokeWidth=".45" opacity=".7" fill="none" />

          {/* Rosettes remain visible on melanistic fur as broken graphite rings. */}
          {!isSimplified && (
            <g className="bp-detail">
              <g className="bp-rosette">
                <ellipse cx="14" cy="13.8" rx="1.55" ry="1.15" /><ellipse cx="18.2" cy="12.5" rx="1.45" ry=".95" />
                <ellipse cx="22.3" cy="13.8" rx="1.75" ry="1.1" /><ellipse cx="25.6" cy="16" rx="1.35" ry="1.05" />
                <ellipse cx="14.6" cy="17.1" rx="1.7" ry="1.15" /><ellipse cx="19.2" cy="17.1" rx="1.5" ry="1.1" />
                <ellipse cx="23" cy="18.4" rx="1.65" ry="1.05" /><ellipse cx="12.5" cy="19.1" rx="1.1" ry=".85" />
              </g>
              <g className="bp-rosette-inner">
                <path d="M12.9 13.8l.8-.5.9.4M17.1 12.5l.7-.4.8.4M21.1 13.9l.8-.5 1 .4M24.7 16l.7-.5.7.4M13.6 17l.8-.5.9.4M18.3 17l.8-.4.7.5M22.1 18.4l.8-.4.8.4" />
              </g>
            </g>
          )}

          {/* Near front leg and paw, angled forward for a stalking/route pose. */}
          <g className="bp-animated" style={{ transformOrigin: "22px 20px", animation: isMoving ? "bp-step-a 520ms ease-in-out infinite" : "none" }}>
            <path className="bp-fur bp-outline" d="M21 19.2c1.5.3 2.4 1.5 2.2 3.1l-.9 6.2c-.2 1.2-1.1 2-2.2 1.8l-1-.3.8-6.2-1.3-3.4Z" />
            <path d="M19.2 29.5c.7 1 2.1 1.3 3 .3l.1.8c-.9 1-2.6.9-3.3-.2Z" fill={UNDERBODY} opacity=".75" />
          </g>
          <path className="bp-fur bp-outline" d="M23.6 19.4c1.1.3 1.6 1.2 1.4 2.5l-.2 3.8-1.6-.1.1-3.3-1.4-2.3Z" opacity=".72" />

          {/* Head, ears, brow, muzzle, and two forward-facing gold eyes. */}
          <g
            className="bp-animated"
            transform="translate(27 15)"
            style={{ transformOrigin: "27px 15px", animation: reaction === "notify" || reaction === "accepted" ? "bp-perk 500ms ease-out 1" : "none" }}
          >
            <path d="M-4.1-2.1-4.3-5.7-1.8-3.8M1-3.6 3-6.2 3.2-2.2" fill={FUR_DARKEST} stroke="#050606" strokeWidth=".35" />
            <path d="M-3.8-2.4c1.1-2.2 4.4-2.6 6.3-.6 1.5 1.7 1.3 4.4-.4 5.7-1.7 1.4-4.7 1.2-6-.5-1-1.2-.9-3.2.1-4.6Z" className="bp-fur bp-outline" />
            {!isSimplified && (
              <>
                <path d="M-2.6-2.2c.7-.8 1.6-.9 2.3-.2M.5-2.4c.7-.6 1.6-.5 2.2.1" stroke={SPOT_HIGHLIGHT} strokeWidth=".35" fill="none" opacity=".8" />
                <circle cx="-1.35" cy="-1.25" r="1.05" fill={`url(#${eyeId})`} />
                <circle cx="1.25" cy="-1.25" r="1.05" fill={`url(#${eyeId})`} />
                <ellipse cx="-1.35" cy="-1.25" rx=".18" ry=".7" fill="#17120A" />
                <ellipse cx="1.25" cy="-1.25" rx=".18" ry=".7" fill="#17120A" />
                <circle cx="-1.7" cy="-1.55" r=".16" fill="#FFFCE0" />
                <circle cx=".9" cy="-1.55" r=".16" fill="#FFFCE0" />
              </>
            )}
            <path d="M-1.1.8c.7-.55 1.5-.55 2.2 0l-.25.65c-.6.45-1.1.45-1.7 0Z" fill={FUR_DARKEST} />
            <path d="M-.2 1.4c.25.3.5.3.75 0" fill="none" stroke={UNDERBODY} strokeWidth=".18" />
            {!isSimplified && (
              <g stroke={WHISKER} strokeWidth=".13" strokeLinecap="round" opacity=".75">
                <path d="M-1.2.6-5 .2M-1.1 1.1-5.2 1.4M-.8 1.5-4.4 2.5M1.1.6 4.7.1M1.1 1.1 5 1.4M.8 1.5 4.4 2.5" />
              </g>
            )}
          </g>
        </g>
      </svg>
    </div>
  );
}