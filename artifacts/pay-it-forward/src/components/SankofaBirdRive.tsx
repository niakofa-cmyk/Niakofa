/**
 * SankofaBirdRive
 *
 * Rive runtime wrapper for the Sankofa Bird mascot.
 * Loads `sankofa-bird.riv` from the public directory and maps all the existing
 * SankofaBird props to Rive state machine inputs, so a designer can drop in a
 * `.riv` file and get the full cinematic bird without touching React code.
 *
 * ── Drop-in guide ─────────────────────────────────────────────────────────
 *  1. Create the state machine in Rive editor following SANKOFA_BIRD_RIVE_SPEC.md
 *  2. Export as `sankofa-bird.riv` → place in `artifacts/pay-it-forward/public/`
 *  3. Set `VITE_USE_RIVE_BIRD=true` in Replit Secrets
 *  4. Restart the web workflow — the Rive bird replaces the SVG automatically.
 *
 * ── Fallback ──────────────────────────────────────────────────────────────
 * If the .riv file is absent or fails to load, this component transparently
 * falls back to the SVG SankofaBirdSvg so the map is never broken.
 */

import { useEffect, useState } from "react";
import { useRive, useStateMachineInput } from "@rive-app/react-canvas";
import { SankofaBirdSvg, type SankofaBirdProps } from "./SankofaBirdSvg";
import { useIsAnimationSuppressed } from "@/hooks/useAnimationPreference";

// ── Rive file + state machine constants ────────────────────────────────────
// These must match what the designer creates in Rive editor exactly.
// See public/SANKOFA_BIRD_RIVE_SPEC.md for the full contract.
const RIVE_SRC           = "/sankofa-bird.riv";
const STATE_MACHINE_NAME = "BirdStateMachine";

export function SankofaBirdRive(props: SankofaBirdProps) {
  const {
    heading,
    mapBearing = 0,
    speed = 0,
    navigating = false,
    size = 40,
    celebrating = false,
    newNotification = false,
    accepted = false,
    donated = false,
    upcomingTurnDirection = null,
    mapZoom = 14,
    nearbyUser = false,
    approaching = false,
    isHelping = false,
    batterySaver = false,
  } = props;

  // ── Reduce Motion: mirror the same override logic as the SVG bird ────────
  // When OS "Reduce Motion" is active and the user has NOT toggled the
  // in-app override, force batterySaver=true on the Rive state machine and
  // suppress the CSS pulse rings entirely. The Rive SM itself handles the
  // rest (static idle pose) via its own batterySaver input.
  const animSuppressed = useIsAnimationSuppressed();

  // ── Load failure state: fall back to SVG if .riv is absent or corrupt ──
  const [loadFailed, setLoadFailed] = useState(false);

  const { rive, RiveComponent } = useRive({
    src: RIVE_SRC,
    stateMachines: STATE_MACHINE_NAME,
    autoplay: true,
    onLoadError: () => {
      console.warn(
        "[SankofaBirdRive] Could not load sankofa-bird.riv — " +
        "falling back to SVG bird. " +
        "Place the .riv file in public/ and set VITE_USE_RIVE_BIRD=true to activate Rive.",
      );
      setLoadFailed(true);
    },
  });

  // ── State machine inputs ───────────────────────────────────────────────
  // Number inputs
  const headingInput        = useStateMachineInput(rive, STATE_MACHINE_NAME, "heading");
  const speedInput          = useStateMachineInput(rive, STATE_MACHINE_NAME, "speed");
  const mapZoomInput        = useStateMachineInput(rive, STATE_MACHINE_NAME, "mapZoom");
  const mapBearingInput     = useStateMachineInput(rive, STATE_MACHINE_NAME, "mapBearing");

  // Boolean inputs
  const navigatingInput     = useStateMachineInput(rive, STATE_MACHINE_NAME, "navigating");
  const celebratingInput    = useStateMachineInput(rive, STATE_MACHINE_NAME, "celebrating");
  const notificationInput   = useStateMachineInput(rive, STATE_MACHINE_NAME, "newNotification");
  const acceptedInput       = useStateMachineInput(rive, STATE_MACHINE_NAME, "accepted");
  const donatedInput        = useStateMachineInput(rive, STATE_MACHINE_NAME, "donated");
  const nearbyUserInput     = useStateMachineInput(rive, STATE_MACHINE_NAME, "nearbyUser");
  const turnLeftInput       = useStateMachineInput(rive, STATE_MACHINE_NAME, "upcomingTurnLeft");
  const turnRightInput      = useStateMachineInput(rive, STATE_MACHINE_NAME, "upcomingTurnRight");
  // New inputs — added per design doc gaps (isHelping, batterySaver, approaching)
  const isHelpingInput      = useStateMachineInput(rive, STATE_MACHINE_NAME, "isHelping");
  const batterySaverInput   = useStateMachineInput(rive, STATE_MACHINE_NAME, "batterySaver");
  const approachingInput    = useStateMachineInput(rive, STATE_MACHINE_NAME, "approaching");

  // ── Sync props → Rive inputs ─────────────────────────────────────────
  useEffect(() => {
    if (headingInput)    headingInput.value    = heading ?? 0;
  }, [heading, headingInput]);

  useEffect(() => {
    if (speedInput)      speedInput.value      = speed ?? 0;
  }, [speed, speedInput]);

  useEffect(() => {
    if (mapZoomInput)    mapZoomInput.value    = mapZoom;
  }, [mapZoom, mapZoomInput]);

  useEffect(() => {
    if (mapBearingInput) mapBearingInput.value = mapBearing;
  }, [mapBearing, mapBearingInput]);

  useEffect(() => {
    if (navigatingInput) navigatingInput.value = navigating;
  }, [navigating, navigatingInput]);

  useEffect(() => {
    if (celebratingInput) celebratingInput.value = celebrating;
  }, [celebrating, celebratingInput]);

  useEffect(() => {
    if (notificationInput) notificationInput.value = newNotification;
  }, [newNotification, notificationInput]);

  useEffect(() => {
    if (acceptedInput)  acceptedInput.value   = accepted;
  }, [accepted, acceptedInput]);

  useEffect(() => {
    if (donatedInput)   donatedInput.value    = donated;
  }, [donated, donatedInput]);

  useEffect(() => {
    if (nearbyUserInput) nearbyUserInput.value = nearbyUser;
  }, [nearbyUser, nearbyUserInput]);

  useEffect(() => {
    if (turnLeftInput)  turnLeftInput.value  = upcomingTurnDirection === "left";
    if (turnRightInput) turnRightInput.value = upcomingTurnDirection === "right";
  }, [upcomingTurnDirection, turnLeftInput, turnRightInput]);

  useEffect(() => {
    if (isHelpingInput)    isHelpingInput.value    = isHelping;
  }, [isHelping, isHelpingInput]);

  // When OS Reduce Motion is active (and user hasn't overridden), force the
  // Rive SM into its battery-saver / static-idle state regardless of the prop.
  useEffect(() => {
    if (batterySaverInput) batterySaverInput.value = batterySaver || animSuppressed;
  }, [batterySaver, animSuppressed, batterySaverInput]);

  useEffect(() => {
    if (approachingInput)  approachingInput.value  = approaching;
  }, [approaching, approachingInput]);

  // ── Fallback: SVG bird if .riv failed to load ─────────────────────────
  if (loadFailed) {
    return <SankofaBirdSvg {...props} />;
  }

  // ── Rive canvas: sized to match the SVG bird's outer container ────────
  // The SVG bird uses size * 1.6 for the outer div to accommodate particles
  // and pulse rings. The Rive artboard should be designed to the same aspect
  // ratio — centred in the canvas with space for those outer effects.
  const containerSize = size * 1.6;

  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: containerSize, height: containerSize }}
    >
      {/* Ground-presence pulse rings — suppressed when OS Reduce Motion is on
          and the user hasn't enabled the override, matching the SVG bird's CSS
          `prefers-reduced-motion` block. Static opacity-15 dot replaces them
          so the map marker still has a subtle ground-presence indicator. */}
      {animSuppressed ? (
        <div
          className="absolute rounded-full bg-primary opacity-15"
          style={{ width: size, height: size }}
        />
      ) : (
        <>
          <div
            className="absolute rounded-full bg-primary opacity-15 animate-ping"
            style={{
              width: size,
              height: size,
              animationDuration: (speed ?? 0) > 0.5 ? "1.2s" : "2s",
            }}
          />
          <div
            className="absolute rounded-full bg-primary opacity-25 animate-ping"
            style={{
              width: size * 0.6,
              height: size * 0.6,
              animationDuration: (speed ?? 0) > 0.5 ? "1.2s" : "2s",
              animationDelay: "0.5s",
            }}
          />
        </>
      )}

      {/* Rive canvas — the bird + all its animations */}
      <RiveComponent
        style={{
          width: containerSize,
          height: containerSize,
          position: "absolute",
          top: 0,
          left: 0,
        }}
      />

      {/* Center anchor dot — same as SVG bird */}
      <div
        className="rounded-full bg-primary border-2 border-background shadow-[0_0_12px_rgba(0,212,255,0.9)] z-10"
        style={{ width: size * 0.14, height: size * 0.14 }}
      />
    </div>
  );
}
