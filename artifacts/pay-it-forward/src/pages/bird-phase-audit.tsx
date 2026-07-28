/**
 * bird-phase-audit.tsx
 *
 * Comprehensive per-phase animation verification suite for SankofaBird.
 * Each phase tab renders every feature, state, data-* attribute, and CSS
 * animation that phase introduced, side-by-side, live, with no mocks.
 *
 * Mounted at /bird-test (imported by bird-test.tsx) below the existing
 * regression checklist. Navigate tabs with the pill bar or keyboard
 * ← → arrow keys.
 *
 * Phases covered: 1 · 2 · 3 · 4 · 5 · 6 · 7 · 8 · 9 · 10 · 11 · 12 · 13 · 14 · 15 · 16
 */

import React, { useEffect, useRef, useState } from "react";
import { SankofaBird } from "@/components/SankofaBird";

/* ─────────────────────────────────────────────────────────────────────────
   Mini BirdCard (self-contained — no dependency on bird-test.tsx internals)
   ──────────────────────────────────────────────────────────────────────── */
interface CardState {
  heading: number | null;
  mapBearing?: number;
  speed: number;
  navigating: boolean;
  celebrating?: boolean;
  newNotification?: boolean;
  accepted?: boolean;
  donated?: boolean;
}

function PCard({
  label,
  sub,
  state,
  size = 44,
  skyTier,
  nightMode,
  nearbyUser,
  approaching,
  isHelping,
  batterySaver,
  mapZoom = 15,
  upcomingTurnDirection,
  activityLevel,
  navLodOverride,
  tag,
  tagColor = "rgba(0,212,255,0.85)",
  // Phase 13
  wairMode,
  soaring,
  matingDisplay,
  // Phase 14
  missionComplete,
  chirp,
  weather,
  trustLevel,
  communityMilestone,
}: {
  label: string;
  sub: string;
  state: CardState;
  size?: number;
  skyTier?: "day" | "golden" | "twilight" | "night";
  nightMode?: boolean;
  nearbyUser?: boolean;
  approaching?: boolean;
  isHelping?: boolean;
  batterySaver?: boolean;
  mapZoom?: number;
  upcomingTurnDirection?: "left" | "right" | null;
  activityLevel?: number;
  navLodOverride?: 0 | 1 | 2;
  tag?: string;
  tagColor?: string;
  // Phase 13
  wairMode?: boolean;
  soaring?: boolean;
  matingDisplay?: boolean;
  // Phase 14
  missionComplete?: boolean;
  chirp?: boolean;
  weather?: "clear" | "rain" | "snow";
  trustLevel?: number;
  communityMilestone?: boolean;
}) {
  const isNight = nightMode || skyTier === "night";
  const bg =
    isNight ? "rgba(8,12,28,0.88)" :
    skyTier === "twilight" ? "rgba(12,18,38,0.7)" :
    skyTier === "golden"   ? "rgba(38,22,6,0.76)" :
    "rgba(255,255,255,0.04)";
  const border =
    isNight ? "1px solid rgba(80,120,220,0.18)" :
    skyTier === "twilight" ? "1px solid rgba(80,110,170,0.22)" :
    skyTier === "golden"   ? "1px solid rgba(210,150,35,0.22)" :
    "1px solid rgba(255,255,255,0.08)";

  return (
    <div
      className="flex flex-col items-center gap-2 rounded-xl p-3"
      style={{ background: bg, border, minWidth: 128, maxWidth: 164 }}
    >
      <div style={{ width: size + 24, height: size + 24, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <SankofaBird
          heading={state.heading}
          mapBearing={state.mapBearing ?? 0}
          speed={state.speed}
          navigating={state.navigating}
          size={size}
          celebrating={state.celebrating}
          newNotification={state.newNotification}
          accepted={state.accepted}
          donated={state.donated}
          nearbyUser={nearbyUser}
          approaching={approaching}
          upcomingTurnDirection={upcomingTurnDirection ?? null}
          isHelping={isHelping}
          batterySaver={batterySaver}
          mapZoom={mapZoom}
          nightMode={nightMode}
          skyTier={skyTier}
          activityLevel={activityLevel ?? 0.4}
          navLodOverride={navLodOverride}
          wairMode={wairMode}
          soaring={soaring}
          matingDisplay={matingDisplay}
          missionComplete={missionComplete}
          chirp={chirp}
          weather={weather}
          trustLevel={trustLevel}
          communityMilestone={communityMilestone}
        />
      </div>
      <p className="text-xs font-semibold text-white text-center leading-tight">{label}</p>
      <p className="text-[10px] text-center" style={{ color: "rgba(255,255,255,0.45)" }}>{sub}</p>
      {tag && (
        <span
          className="px-1.5 py-0.5 rounded text-[9px] font-bold"
          style={{ background: `${tagColor}1a`, color: tagColor, border: `1px solid ${tagColor}33` }}
        >
          {tag}
        </span>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Shared cycling helpers
   ──────────────────────────────────────────────────────────────────────── */

/** Live banking: oscillates heading to produce visible bank animation. */
function useBankCycle(direction: "left" | "right"): number {
  const [heading, setHeading] = useState(90);
  useEffect(() => {
    const base = 90;
    const sign = direction === "left" ? -1 : 1;
    const steps = [
      { h: base,               hold: 1300 },
      { h: base + sign * 35,   hold: 1100 },
      { h: base + sign * 55,   hold: 900  },
      { h: base,               hold: 1300 },
    ];
    let idx = 0;
    let timer: ReturnType<typeof setTimeout>;
    function next() {
      setHeading(steps[idx].h);
      timer = setTimeout(() => { idx = (idx + 1) % steps.length; next(); }, steps[idx].hold);
    }
    next();
    return () => clearTimeout(timer);
  }, [direction]);
  return heading;
}

/** Ramps speed 0→max→0 over a given period in ms. */
function useSpeedRamp(max = 60, stepMs = 60): number {
  const [speed, setSpeed] = useState(0);
  useEffect(() => {
    let s = 0, dir = 1;
    const id = setInterval(() => {
      s = Math.max(0, Math.min(max, s + dir * (max / 30)));
      if (s >= max) dir = -1;
      if (s <= 0)   dir =  1;
      setSpeed(parseFloat(s.toFixed(1)));
    }, stepMs);
    return () => clearInterval(id);
  }, [max, stepMs]);
  return speed;
}

/** Cycles an integer index 0..n-1 every intervalMs. */
function useCycleIndex(n: number, intervalMs = 1500): number {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setIdx(i => (i + 1) % n), intervalMs);
    return () => clearInterval(id);
  }, [n, intervalMs]);
  return idx;
}

/* ─────────────────────────────────────────────────────────────────────────
   Phase 1 — Core Flight System
   ──────────────────────────────────────────────────────────────────────── */
function Phase1Panel() {
  const bankL = useBankCycle("left");
  const bankR = useBankCycle("right");
  const speed = useSpeedRamp(60);

  return (
    <div className="flex flex-wrap gap-3">
      <PCard label="Idle (no GPS)" sub="heading=null, speed=0" state={{ heading: null, speed: 0, navigating: false }} tag="data-flying=false" />
      <PCard label="Idle (heading 0°)" sub="heading=0, no movement" state={{ heading: 0, speed: 0, navigating: false }} tag="data-landing=idle" />
      <PCard label="Walking" sub="1.4 m/s · data-speed=walking" state={{ heading: 45, speed: 1.4, navigating: true }} tag="data-speed=walking" />
      <PCard label="Running" sub="5 m/s · lean ~11°" state={{ heading: 90, speed: 5, navigating: true }} tag="data-speed=running" />
      <PCard label="Driving" sub="14 m/s · body elongation" state={{ heading: 180, speed: 14, navigating: true }} tag="data-speed=driving" />
      <PCard label="Airplane / Gliding" sub="55 m/s · wings spread flat" state={{ heading: 270, speed: 55, navigating: true }} tag="data-speed=airplane" />
      <PCard label="Heading-up" sub="mapBearing=heading → always faces screen-top" state={{ heading: 135, mapBearing: 135, speed: 5, navigating: true }} tag="mapBearing=heading" />
      <PCard label="Banking Left (live)" sub="heading delta → outside wing extends" state={{ heading: bankL, speed: 10, navigating: true }} tag="bankDeg<0" />
      <PCard label="Banking Right (live)" sub="heading delta → inside folds" state={{ heading: bankR, speed: 10, navigating: true }} tag="bankDeg>0" />
      <PCard label="Speed Ramp" sub={`${speed.toFixed(1)} m/s — flap rate changes`} state={{ heading: 0, speed, navigating: true }} tag="var(--flap-period)" />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Phase 2 — Iridescence + Eye Detail + Feather Structure
   ──────────────────────────────────────────────────────────────────────── */
function Phase2Panel() {
  return (
    <div className="flex flex-wrap gap-3">
      <PCard label="Eye catchlight" sub="Iris + corneal specular" state={{ heading: null, speed: 0, navigating: false }} mapZoom={17} tag="street zoom" />
      <PCard label="Breast sheen" sub="--lighting-factor driven" state={{ heading: 0, speed: 0, navigating: false }} mapZoom={15} tag="high zoom" />
      <PCard label="Neck chain S-wave" sub="S-curve iridescent stripe" state={{ heading: 0, speed: 2, navigating: true }} mapZoom={17} tag="street zoom" />
      <PCard label="Crown tip speculars" sub="Teal crown feather tips" state={{ heading: null, speed: 0, navigating: false }} mapZoom={17} tag="crown visible" />
      <PCard label="Covert band shimmer" sub="Wing covert iridescence" state={{ heading: 0, speed: 5, navigating: true }} mapZoom={17} tag="high-zoom" />
      <PCard label="Body feathers 4-11" sub="Visible at street zoom" state={{ heading: 0, speed: 0, navigating: false }} mapZoom={17} tag="data-zoom=street" />
      <PCard label="Scapular breathing" sub="Scapular feathers breathe on idle" state={{ heading: null, speed: 0, navigating: false }} mapZoom={15} tag="idle breathing" />
      <PCard label="Tail outer iridescence" sub="Outer tail feather prismatic" state={{ heading: 0, speed: 14, navigating: true }} mapZoom={15} tag="flying" />
      <PCard label="Heading 45°" sub="--lighting-factor = cos(heading-315°)" state={{ heading: 45, speed: 0, navigating: false }} mapZoom={15} tag="lighting" />
      <PCard label="Heading 315°" sub="Max lighting factor (facing source)" state={{ heading: 315, speed: 0, navigating: false }} mapZoom={15} tag="max light" />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Phase 3 — Beyond-Rive Compound Effects
   ──────────────────────────────────────────────────────────────────────── */
function Phase3Panel() {
  const speed = useSpeedRamp(60);
  return (
    <div className="flex flex-wrap gap-3">
      <PCard label="Vortex rings" sub="Tip vortices at driving speed" state={{ heading: 0, speed: 14, navigating: true }} mapZoom={15} tag="data-speed=driving" />
      <PCard label="Airplane vortex" sub="Broad wisp bars at airplane speed" state={{ heading: 0, speed: 55, navigating: true }} mapZoom={15} tag="data-speed=airplane" />
      <PCard label="Body elongation" sub="Fuselage stretches at speed" state={{ heading: 0, speed: 55, navigating: true }} mapZoom={17} tag="--body-elongation" />
      <PCard label="Speed-correlated lean" sub="Lean angle = fn(speed)" state={{ heading: 0, speed, navigating: true }} mapZoom={15} tag={`${speed.toFixed(0)} m/s`} />
      <PCard label="Wing-tip slot" sub="Primary tips separate at takeoff" state={{ heading: 0, speed: 8, navigating: true }} mapZoom={15} tag="P3.9 slot" />
      <PCard label="Idle weight-shift" sub="8.5 s oscillation — reads as alive" state={{ heading: null, speed: 0, navigating: false }} mapZoom={15} tag="P3 idle" />
      <PCard label="isHelping shimmer" sub="Gold shimmer en-route" state={{ heading: 0, speed: 5, navigating: true }} isHelping mapZoom={15} tag="--help-shimmer" />
      <PCard label="Night filter" sub="hue+22° sat×0.58 bright×0.65" state={{ heading: 0, speed: 0, navigating: false }} nightMode mapZoom={15} tag="data-night-mode" />
      <PCard label="Donate golden sparkle" sub="6-pointed sparkle burst" state={{ heading: 0, speed: 0, navigating: false, donated: true }} mapZoom={15} tag="--donate-cascade" />
      <PCard label="Blink-period visible" sub="Street zoom eyelid closes" state={{ heading: null, speed: 0, navigating: false }} mapZoom={17} tag="--blink-period" />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Phase 4 — Environmental + Physics Vars
   ──────────────────────────────────────────────────────────────────────── */
function Phase4Panel() {
  const bankL = useBankCycle("left");
  const bankR = useBankCycle("right");
  return (
    <div className="flex flex-wrap gap-3">
      <PCard label="Walk dust — left" sub="Dust kicks left on footfall" state={{ heading: 0, speed: 1.4, navigating: true }} mapZoom={17} tag="--turb-x" />
      <PCard label="Walk dust — right" sub="Dust kicks right on footfall" state={{ heading: 180, speed: 1.4, navigating: true }} mapZoom={17} tag="--turb-y" />
      <PCard label="Bank angle var" sub="--bank-angle drives wing + neck" state={{ heading: bankL, speed: 8, navigating: true }} mapZoom={15} tag="--bank-angle" />
      <PCard label="Bank angle right" sub="Outside wing extends fully" state={{ heading: bankR, speed: 8, navigating: true }} mapZoom={15} tag="--bank-angle" />
      <PCard label="Wing highlight burst" sub="P4 wing colour shift on bank" state={{ heading: bankR, speed: 14, navigating: true }} mapZoom={15} tag="P4 highlight" />
      <PCard label="Idle dust settled" sub="No dust at rest" state={{ heading: null, speed: 0, navigating: false }} mapZoom={17} tag="dust=off" />
      <PCard label="Micro-turbulence X" sub="--turb-x at driving speed" state={{ heading: 0, speed: 14, navigating: true }} mapZoom={17} tag="@property length" />
      <PCard label="Micro-turbulence Y" sub="--turb-y vertical component" state={{ heading: 90, speed: 14, navigating: true }} mapZoom={17} tag="@property length" />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Phase 5 — Advanced Feather Rendering
   ──────────────────────────────────────────────────────────────────────── */
function Phase5Panel() {
  return (
    <div className="flex flex-wrap gap-3">
      <PCard label="Feather slot — takeoff" sub="Primary tips spread on takeoff" state={{ heading: 0, speed: 8, navigating: true }} mapZoom={17} tag="P5 slot" />
      <PCard label="Feather slot — hover" sub="Tips spread during hover" state={{ heading: 0, speed: 3, navigating: true }} approaching mapZoom={17} tag="approaching" />
      <PCard label="Body feathers 1-3" sub="Base feather layer (low zoom)" state={{ heading: null, speed: 0, navigating: false }} mapZoom={12} tag="low zoom" />
      <PCard label="Body feathers 4-11" sub="Full detail at street zoom" state={{ heading: null, speed: 0, navigating: false }} mapZoom={17} tag="high+street" />
      <PCard label="--feather-base-opacity" sub="Opacity scales with speed" state={{ heading: 0, speed: 5, navigating: true }} mapZoom={15} tag="@property number" />
      <PCard label="--bfs-opacity" sub="Body feather secondary layer" state={{ heading: 0, speed: 14, navigating: true }} mapZoom={15} tag="@property number" />
      <PCard label="Vortex opacity" sub="--vortex-opacity at speed" state={{ heading: 0, speed: 55, navigating: true }} mapZoom={15} tag="--vortex-opacity" />
      <PCard label="Feather iridescence" sub="Rainbow on primary tips" state={{ heading: 0, speed: 5, navigating: true }} mapZoom={17} tag="iridescence" />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Phase 6 — Solar / Environmental / LOD
   ──────────────────────────────────────────────────────────────────────── */
function Phase6Panel() {
  const approachSt = useRef({ isApproaching: false });
  const [approaching, setApproaching] = useState(false);
  useEffect(() => {
    const id = setInterval(() => {
      approachSt.current.isApproaching = !approachSt.current.isApproaching;
      setApproaching(approachSt.current.isApproaching);
    }, 3000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex flex-wrap gap-3">
      <PCard label="P6.1 Off-screen pause" sub="data-off-screen=true → all anims pause" state={{ heading: 0, speed: 5, navigating: true }} mapZoom={15} tag="IntersectionObserver" />
      <PCard label="P6.2 Pupil — day" sub="Iris constricts in full sun" state={{ heading: 0, speed: 0, navigating: false }} skyTier="day" mapZoom={17} tag="skyTier=day" />
      <PCard label="P6.2 Pupil — night" sub="Iris dilates in darkness" state={{ heading: 0, speed: 0, navigating: false }} skyTier="night" mapZoom={17} tag="skyTier=night" />
      <PCard label="P6.3 Golden breast" sub="Amber breast filter at golden hour" state={{ heading: 0, speed: 0, navigating: false }} skyTier="golden" mapZoom={15} tag="skyTier=golden" />
      <PCard label="P6.4 Twilight desat" sub="Desaturated breathing at twilight" state={{ heading: 0, speed: 0, navigating: false }} skyTier="twilight" mapZoom={15} tag="skyTier=twilight" />
      <PCard label="P6.5 Micro-turbulence" sub="Feather tips tremble at driving speed" state={{ heading: 0, speed: 14, navigating: true }} mapZoom={15} tag="driving" />
      <PCard label="P6.6 Wing specular" sub="Downstroke pressure brightening" state={{ heading: 0, speed: 5, navigating: true }} mapZoom={15} tag="filter:brightness" />
      <PCard label="P6.7 Approach ruffle" sub="Feathers spread before landing" state={{ heading: 0, speed: 3, navigating: true }} approaching={approaching} mapZoom={15} tag={approaching ? "approaching=T" : "approaching=F"} />
      <PCard label="P6.8 Head bob" sub="Head bobs on each downstroke" state={{ heading: 0, speed: 8, navigating: true }} mapZoom={15} tag="var(--flap-period)" />
      <PCard label="P6.9 NavLod 0" sub="Full quality (0–10 min)" state={{ heading: 0, speed: 10, navigating: true }} navLodOverride={0} mapZoom={15} tag="LOD0" tagColor="rgba(0,212,100,0.9)" />
      <PCard label="P6.9 NavLod 1" sub="Feather overlays dimmed (10–30 min)" state={{ heading: 0, speed: 10, navigating: true }} navLodOverride={1} mapZoom={15} tag="LOD1" tagColor="rgba(255,200,0,0.9)" />
      <PCard label="P6.9 NavLod 2" sub="Skeletal silhouette (30+ min)" state={{ heading: 0, speed: 10, navigating: true }} navLodOverride={2} mapZoom={15} tag="LOD2" tagColor="rgba(255,80,80,0.9)" />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Phase 7 — Biomechanics
   ──────────────────────────────────────────────────────────────────────── */
function Phase7Panel() {
  const bankL = useBankCycle("left");
  const bankR = useBankCycle("right");
  return (
    <div className="flex flex-wrap gap-3">
      <PCard label="P7.1 Egg pendulum" sub="Egg swings opposite to bank" state={{ heading: bankL, speed: 8, navigating: true }} mapZoom={15} tag="inertia swing" />
      <PCard label="P7.1 Egg pendulum R" sub="Pendulum swings on right bank" state={{ heading: bankR, speed: 8, navigating: true }} mapZoom={15} tag="inertia swing" />
      <PCard label="P7.2 Head stabilize" sub="Head stays level on wingbeat" state={{ heading: 0, speed: 8, navigating: true }} mapZoom={17} tag="head-steady" />
      <PCard label="P7.3 Curiosity tilt" sub="Idle head tilt (watch ~5 s)" state={{ heading: null, speed: 0, navigating: false }} mapZoom={17} tag="idle scan" />
      <PCard label="P7.4 Wingbeat variability" sub="Stochastic feather timing" state={{ heading: 0, speed: 8, navigating: true }} mapZoom={15} tag="stochastic" />
      <PCard label="P7.5 Battery crossfade" sub="LOD3 entry washes out (not pop)" state={{ heading: 0, speed: 5, navigating: true }} batterySaver mapZoom={15} tag="LOD3 fade" />
      <PCard label="P7.6 Mid-zoom neck arc" sub="0.18× neck factor at mid zoom" state={{ heading: bankL, speed: 8, navigating: true }} mapZoom={12} tag="data-zoom=mid" />
      <PCard label="P7.7 Wing highlight" sub="Highlight eases on/off bank" state={{ heading: bankR, speed: 14, navigating: true }} mapZoom={15} tag="transition" />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Phase 8 — Vision-Doc Biomechanical (Wing / Feather / Shadow)
   ──────────────────────────────────────────────────────────────────────── */
function Phase8Panel() {
  const bankR = useBankCycle("right");
  return (
    <div className="flex flex-wrap gap-3">
      <PCard label="P8.1 Wing asymmetry" sub="Right wing +18ms delay vs left" state={{ heading: 0, speed: 8, navigating: true }} mapZoom={15} tag="+18ms offset" />
      <PCard label="P8.2 Feather lag" sub="Feathers lag behind body turn" state={{ heading: bankR, speed: 8, navigating: true }} mapZoom={17} tag="cascade lag" />
      <PCard label="P8.3 Shadow dynamics" sub="Shadow warps on banking" state={{ heading: bankR, speed: 10, navigating: true }} mapZoom={15} tag="shadow warp" />
      <PCard label="P8.4 Night eye reflect" sub="Eye reflects light sources at night" state={{ heading: 0, speed: 0, navigating: false }} skyTier="night" mapZoom={17} tag="night eyes" />
      <PCard label="P8.5 Tail spring" sub="Tail oscillates on cubic-bezier" state={{ heading: bankR, speed: 14, navigating: true }} mapZoom={15} tag="cubic-bezier" />
      <PCard label="P8.6 Wind tail-fan" sub="Tail fans slightly at airplane speed" state={{ heading: 0, speed: 55, navigating: true }} mapZoom={15} tag="airplane" />
      <PCard label="P8.7 Anticipatory look" sub="Glances toward upcoming turn" state={{ heading: 0, speed: 8, navigating: true }} upcomingTurnDirection="right" mapZoom={17} tag="turn=right" />
      <PCard label="P8.7 Anticipatory left" sub="Glances left before left turn" state={{ heading: 0, speed: 8, navigating: true }} upcomingTurnDirection="left" mapZoom={17} tag="turn=left" />
      <PCard label="P8.8 Wing salute" sub="Wing rises on accepted reaction" state={{ heading: 0, speed: 0, navigating: false, accepted: true }} mapZoom={15} tag="accepted" />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Phase 9 — Additional Biomechanical / Gap-Closure Round 1
   ──────────────────────────────────────────────────────────────────────── */
function Phase9Panel() {
  const bankL = useBankCycle("left");
  return (
    <div className="flex flex-wrap gap-3">
      <PCard label="Glide pitch composition" sub="glide + bank compose cleanly" state={{ heading: bankL, speed: 55, navigating: true }} mapZoom={15} tag="glide+bank" />
      <PCard label="Helping + bank" sub="Forward crane + bank don't clash" state={{ heading: bankL, speed: 8, navigating: true }} isHelping mapZoom={15} tag="crane+bank" />
      <PCard label="Night + flying" sub="Night filter + flight animations" state={{ heading: 0, speed: 8, navigating: true }} skyTier="night" mapZoom={15} tag="night+fly" />
      <PCard label="LOD2 + bank" sub="Skeletal silhouette still banks" state={{ heading: bankL, speed: 10, navigating: true }} navLodOverride={2} mapZoom={15} tag="LOD2+bank" />
      <PCard label="Night + helping" sub="Night en-route helper shimmer" state={{ heading: 0, speed: 5, navigating: true }} isHelping skyTier="night" mapZoom={15} tag="night+help" />
      <PCard label="Golden + flying" sub="Golden-hour breast + flight" state={{ heading: 0, speed: 8, navigating: true }} skyTier="golden" mapZoom={15} tag="golden+fly" />
      <PCard label="Twilight + approaching" sub="Twilight desat + approach ruffle" state={{ heading: 0, speed: 3, navigating: true }} skyTier="twilight" approaching mapZoom={15} tag="twilight+app" />
      <PCard label="BatterySaver + night" sub="Silhouette in night mode" state={{ heading: 0, speed: 5, navigating: true }} batterySaver skyTier="night" mapZoom={15} tag="LOD3+night" />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Phase 10 — Night-Mode Plumage Enhancement
   ──────────────────────────────────────────────────────────────────────── */
function Phase10Panel() {
  return (
    <div className="flex flex-wrap gap-3">
      <PCard label="P10.1 Pupil shimmer" sub="Star-reflection in wet cornea" state={{ heading: null, speed: 0, navigating: false }} skyTier="night" mapZoom={17} tag="P10.1" tagColor="rgba(140,170,255,0.9)" />
      <PCard label="P10.2 Moonlit wing rim" sub="Silvery-blue leading edge" state={{ heading: 0, speed: 5, navigating: true }} skyTier="night" mapZoom={15} tag="P10.2" tagColor="rgba(140,170,255,0.9)" />
      <PCard label="P10.3 Nocturnal breathing" sub="6.8s idle vs 3.8s daytime" state={{ heading: null, speed: 0, navigating: false }} skyTier="night" mapZoom={15} tag="6.8s" tagColor="rgba(140,170,255,0.9)" />
      <PCard label="P10.4 Dark plumage" sub="Body feathers deepen to ocean-teal" state={{ heading: null, speed: 0, navigating: false }} skyTier="night" mapZoom={15} tag="P10.4" tagColor="rgba(140,170,255,0.9)" />
      <PCard label="P10.5 Bio-glow flight" sub="Bioluminescent teal on primaries" state={{ heading: 0, speed: 8, navigating: true }} skyTier="night" mapZoom={15} tag="flying+night" tagColor="rgba(0,212,180,0.9)" />
      <PCard label="P10.6 Slow blink" sub="1.6× slower at night" state={{ heading: null, speed: 0, navigating: false }} skyTier="night" mapZoom={17} tag="×1.6 period" tagColor="rgba(140,170,255,0.9)" />
      <PCard label="P10.7 Shadow suppress" sub="No sharp shadow (diffuse moonlight)" state={{ heading: 0, speed: 5, navigating: true }} skyTier="night" mapZoom={15} tag="no shadow" tagColor="rgba(140,170,255,0.9)" />
      <PCard label="P10.8 Crown moon tips" sub="Silver-moonlit crown pulsing at 11s" state={{ heading: null, speed: 0, navigating: false }} skyTier="night" mapZoom={17} tag="11s pulse" tagColor="rgba(220,220,255,0.9)" />
      <PCard label="P10.9 Lunar egg pearl" sub="Egg glow shifts to moon-grey" state={{ heading: null, speed: 0, navigating: false }} skyTier="night" mapZoom={15} tag="P10.9" tagColor="rgba(140,170,255,0.9)" />
      <PCard label="P10.10 Low-zoom silhouette" sub="Contrast boost for crisp dark shape" state={{ heading: 0, speed: 5, navigating: true }} skyTier="night" mapZoom={10} tag="low zoom" tagColor="rgba(140,170,255,0.9)" />
      <PCard label="Day vs Night compare" sub="Side-by-side lighting reference" state={{ heading: 0, speed: 0, navigating: false }} skyTier="day" mapZoom={15} tag="day" tagColor="rgba(255,200,50,0.9)" />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Phase 11 — Gap-Closure Finalization
   ──────────────────────────────────────────────────────────────────────── */
function Phase11Panel() {
  const bankL = useBankCycle("left");
  const bankR = useBankCycle("right");
  return (
    <div className="flex flex-wrap gap-3">
      <PCard label="P11 Battery idle-settle" sub="Idle-settle guard — no LOD3 flicker" state={{ heading: null, speed: 0, navigating: false }} batterySaver mapZoom={15} tag="batterySaver idle" />
      <PCard label="P11 navLod opacity" sub="Feather fade: 2.5 s smooth transition" state={{ heading: 0, speed: 8, navigating: true }} navLodOverride={1} mapZoom={15} tag="LOD1 fade" tagColor="rgba(255,200,0,0.9)" />
      <PCard label="P11 Full-body crane" sub="Head+neck+body+tail lean helping" state={{ heading: 0, speed: 5, navigating: true }} isHelping mapZoom={15} tag="crane all" />
      <PCard label="P11 Crane + bank" sub="Forward crane composes with bank" state={{ heading: bankL, speed: 8, navigating: true }} isHelping mapZoom={15} tag="crane+bank" />
      <PCard label="P11 Wing-tip flex" sub="Wing tips flex at airplane speed" state={{ heading: 0, speed: 55, navigating: true }} mapZoom={15} tag="tip flex" />
      <PCard label="P11 Crown sway — quiet" sub="5.2 s slow drift (activityLevel=0)" state={{ heading: null, speed: 0, navigating: false }} activityLevel={0} mapZoom={17} tag="quiet" tagColor="rgba(100,200,120,0.9)" />
      <PCard label="P11 Crown sway — busy" sub="2.4 s fast sway (activityLevel=0.7)" state={{ heading: null, speed: 0, navigating: false }} activityLevel={0.7} mapZoom={17} tag="busy" tagColor="rgba(255,180,0,0.9)" />
      <PCard label="P11 Crown sway — peak" sub="1.1 s central tremble (level=1.0)" state={{ heading: null, speed: 0, navigating: false }} activityLevel={1.0} mapZoom={17} tag="peak" tagColor="rgba(255,80,80,0.9)" />
      <PCard label="P11 Mid-zoom shimmer" sub="Iridescence visible at zoom 12–14" state={{ heading: 0, speed: 5, navigating: true }} mapZoom={12} tag="data-zoom=mid" />
      <PCard label="P11 GPU will-change" sub="backface-visibility + translateZ(0)" state={{ heading: bankR, speed: 10, navigating: true }} mapZoom={15} tag="GPU layer" />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Phase 12 — 8-Direction Real-Time Gaze System
   ──────────────────────────────────────────────────────────────────────── */
function Phase12Panel() {
  const GAZES = [
    { dir: "forward",   upcomingTurn: null as null,       label: "Forward (saccade=0)", sub: "default / straight nav" },
    { dir: "left",      upcomingTurn: null as null,       label: "Gaze left",           sub: "data-gaze=left" },
    { dir: "right",     upcomingTurn: null as null,       label: "Gaze right",          sub: "data-gaze=right" },
    { dir: "up",        upcomingTurn: null as null,       label: "Gaze up",             sub: "data-gaze=up" },
    { dir: "down",      upcomingTurn: null as null,       label: "Gaze down",           sub: "data-gaze=down" },
    { dir: "upleft",    upcomingTurn: "left" as "left",   label: "Gaze upleft",         sub: "turn=left → anticipatory" },
    { dir: "upright",   upcomingTurn: "right" as "right", label: "Gaze upright",        sub: "turn=right → anticipatory" },
    { dir: "downleft",  upcomingTurn: null as null,       label: "Gaze downleft",       sub: "saccade phase 6" },
    { dir: "downright", upcomingTurn: null as null,       label: "Gaze downright",      sub: "saccade phase 7" },
  ];

  const idx = useCycleIndex(GAZES.length, 1600);

  return (
    <div>
      <div
        className="rounded-xl p-3 mb-4 text-xs"
        style={{ background: "rgba(0,212,255,0.06)", border: "1px solid rgba(0,212,255,0.18)" }}
      >
        <span style={{ color: "rgba(0,212,255,0.9)" }}>Auto-cycling</span>
        <span style={{ color: "rgba(255,255,255,0.5)" }}> — all 9 gaze directions cycle every 1.6 s. Each direction drives iris + head + neck + body chain via pure CSS.</span>
      </div>
      <div className="flex flex-wrap gap-3">
        {GAZES.map((g, i) => (
          <PCard
            key={g.dir}
            label={g.label}
            sub={i === idx ? "→ ACTIVE NOW" : g.sub}
            state={{ heading: 0, speed: 0, navigating: false }}
            upcomingTurnDirection={g.upcomingTurn}
            mapZoom={17}
            tag={`data-gaze=${g.dir}`}
            tagColor={i === idx ? "rgba(0,212,255,0.95)" : "rgba(0,212,255,0.45)"}
          />
        ))}
        <PCard label="Nav gaze — hard right turn" sub="bankDeg>10 triggers iris shift" state={{ heading: 0, speed: 8, navigating: true }} upcomingTurnDirection="right" mapZoom={15} tag="bank gaze" />
        <PCard label="Auto-saccade idle" sub="Saccade phases 0-7 cycle in idle" state={{ heading: null, speed: 0, navigating: false }} mapZoom={17} tag="idle drift" />
        <PCard label="Gaze + night mode" sub="Iris track still fires at night" state={{ heading: 0, speed: 0, navigating: false }} skyTier="night" mapZoom={17} tag="night gaze" />
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Phase 13 — Full Authentic Aerodynamics
   ──────────────────────────────────────────────────────────────────────── */
function Phase13Panel() {
  const bankL = useBankCycle("left");
  const bankR = useBankCycle("right");
  const speed = useSpeedRamp(55, 80);
  const [wair, setWair] = useState(false);
  const [soaring, setSoaring] = useState(false);
  const [mating, setMating] = useState(false);
  const idx = useCycleIndex(3, 5000);
  useEffect(() => {
    setWair(idx === 0);
    setSoaring(idx === 1);
    setMating(idx === 2);
  }, [idx]);

  return (
    <div>
      <div
        className="rounded-xl p-3 mb-4 text-xs"
        style={{ background: "rgba(80,200,120,0.06)", border: "1px solid rgba(80,200,120,0.2)" }}
      >
        <span style={{ color: "rgba(80,200,120,0.9)" }}>WAIR / Soaring / Mating</span>
        <span style={{ color: "rgba(255,255,255,0.5)" }}> are mutually exclusive — auto-cycling every 5 s. Currently active: </span>
        <span style={{ color: "rgba(80,200,120,0.9)", fontWeight: 600 }}>
          {idx === 0 ? "WAIR" : idx === 1 ? "Soaring" : "Mating Display"}
        </span>
      </div>
      <div className="flex flex-wrap gap-3">
        <PCard label="P13.1 Figure-8 stroke" sub="Large downstroke + lateral sway" state={{ heading: 0, speed: 14, navigating: true }} mapZoom={15} tag="driving" tagColor="rgba(80,200,120,0.9)" />
        <PCard label="P13.2 WAIR" sub="Body pitched 28° · wings churning" state={{ heading: 0, speed: 5, navigating: true }} mapZoom={15} tag={wair ? "WAIR=active" : "WAIR (cycling)"} tagColor={wair ? "rgba(80,200,120,0.9)" : "rgba(80,200,120,0.4)"} />
        <PCard label="P13.3 Dynamic soaring" sub="4.2s albatross dive-climb cycle" state={{ heading: 0, speed: 55, navigating: true }} mapZoom={15} tag={soaring ? "soaring=T" : "soaring (cycling)"} tagColor={soaring ? "rgba(80,200,120,0.9)" : "rgba(80,200,120,0.4)"} />
        <PCard label="P13.4 Mating display" sub="1.6s courtship pivot + wing fan" state={{ heading: 0, speed: 0, navigating: false }} mapZoom={15} tag={mating ? "mating=T" : "mating (cycling)"} tagColor={mating ? "rgba(255,150,200,0.9)" : "rgba(255,150,200,0.4)"} />
        <PCard label="P13.5 Hover wrist" sub="Figure-8 wrist — lift both strokes" state={{ heading: 0, speed: 3, navigating: true }} approaching mapZoom={15} tag="hover" tagColor="rgba(80,200,120,0.9)" />
        <PCard label="P13.6 Knee articulation" sub="Tibio-tarsus bend, alternating L/R" state={{ heading: 0, speed: 1.4, navigating: true }} mapZoom={15} tag="walking" tagColor="rgba(80,200,120,0.9)" />
        <PCard label="P13.6 Landing knee" sub="Bilateral impact flex on landing" state={{ heading: 0, speed: 0, navigating: false }} approaching mapZoom={15} tag="impact" tagColor="rgba(80,200,120,0.9)" />
        <PCard label="P13.7 Murmur wave" sub="Hue-rotate shimmer across both wings" state={{ heading: 0, speed: 14, navigating: true }} mapZoom={15} tag="driving speed" tagColor="rgba(80,200,120,0.9)" />
        <PCard label="P13.8 Body gaze chain" sub="Gaze rolls shoulders + deflects tail" state={{ heading: 0, speed: 8, navigating: true }} upcomingTurnDirection="left" mapZoom={15} tag="gaze chain" tagColor="rgba(80,200,120,0.9)" />
        <PCard label="P13.9 Feather slot" sub="Primary tips separate on takeoff" state={{ heading: 0, speed: 8, navigating: true }} mapZoom={17} tag="slot" tagColor="rgba(80,200,120,0.9)" />
        <PCard label="P13 Speed ramp" sub={`${speed.toFixed(0)} m/s — all aero modes`} state={{ heading: bankL, speed, navigating: true }} mapZoom={15} tag={`${speed.toFixed(0)} m/s`} tagColor="rgba(80,200,120,0.9)" />
        <PCard label="P13 Night aero" sub="All P13 effects in night mode" state={{ heading: bankR, speed: 14, navigating: true }} skyTier="night" mapZoom={15} tag="night+aero" tagColor="rgba(140,170,255,0.9)" />
        <PCard label="P13 + batterySaver" sub="LOD3 still allows core motion" state={{ heading: 0, speed: 8, navigating: true }} batterySaver mapZoom={15} tag="LOD3+aero" tagColor="rgba(255,80,80,0.9)" />
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Phase 14 — Living Companion
   ──────────────────────────────────────────────────────────────────────── */
function Phase14Panel() {
  // P14.1 Chirp — fires as a momentary toggle, re-fires every 2.4 s to demo
  const [chirp, setChirp] = useState(false);
  useEffect(() => {
    const id = setInterval(() => {
      setChirp(true);
      setTimeout(() => setChirp(false), 600);
    }, 2400);
    return () => clearInterval(id);
  }, []);

  // P14.2 Mission complete — cycles on/off every 3.5 s
  const [mission, setMission] = useState(false);
  const missionIdx = useCycleIndex(2, 3500);
  useEffect(() => { setMission(missionIdx === 0); }, [missionIdx]);

  // P14.3 Community milestone — fires once per 5 s cycle
  const [milestone, setMilestone] = useState(false);
  useEffect(() => {
    const id = setInterval(() => {
      setMilestone(true);
      setTimeout(() => setMilestone(false), 2200);
    }, 5000);
    return () => clearInterval(id);
  }, []);

  return (
    <div>
      <div
        className="rounded-xl p-3 mb-4 text-xs"
        style={{ background: "rgba(245,217,138,0.06)", border: "1px solid rgba(245,217,138,0.22)" }}
      >
        <span style={{ color: "rgba(245,217,138,0.9)" }}>Living Companion — Phase 14</span>
        <span style={{ color: "rgba(255,255,255,0.5)" }}>
          {" "}chirp auto-fires every 2.4 s · mission-complete cycles every 3.5 s ·
          milestone shimmer fires every 5 s · trust tiers are static previews.
        </span>
      </div>
      <div className="flex flex-wrap gap-3">
        {/* P14.1 Chirp */}
        <PCard
          label="P14.1 Chirp"
          sub={chirp ? "→ CHIRPING" : "beak open/close + arc rings"}
          state={{ heading: 0, speed: 0, navigating: false }}
          mapZoom={17}
          chirp={chirp}
          tag={chirp ? "data-chirp=true" : "data-chirp=false"}
          tagColor={chirp ? "rgba(0,212,255,0.95)" : "rgba(0,212,255,0.4)"}
        />
        {/* P14.2 Mission complete */}
        <PCard
          label="P14.2 Mission Complete"
          sub={mission ? "→ ACTIVE: tail fan + ripple" : "tail fans · egg ripple · warm glow"}
          state={{ heading: 0, speed: 0, navigating: false }}
          mapZoom={15}
          missionComplete={mission}
          tag={mission ? "missionComplete=T" : "cycling..."}
          tagColor={mission ? "rgba(245,217,138,0.95)" : "rgba(245,217,138,0.4)"}
        />
        {/* P14.3 Community milestone shimmer */}
        <PCard
          label="P14.3 Milestone Shimmer"
          sub={milestone ? "→ SHIMMER WAVE" : "hue wave tail→crown every 5 s"}
          state={{ heading: 0, speed: 0, navigating: false }}
          mapZoom={15}
          communityMilestone={milestone}
          tag={milestone ? "milestone=T" : "community milestone"}
          tagColor={milestone ? "rgba(100,255,180,0.95)" : "rgba(100,255,180,0.45)"}
        />
        {/* P14.4 Trust tiers */}
        <PCard
          label="P14.4 Trust: none"
          sub="No Adinkra motif (new helper)"
          state={{ heading: 0, speed: 0, navigating: false }}
          mapZoom={17}
          trustLevel={0.1}
          tag="tier=none"
          tagColor="rgba(255,255,255,0.45)"
        />
        <PCard
          label="P14.4 Trust: growing"
          sub="Wing covert dot-band (0.25–0.55)"
          state={{ heading: 0, speed: 0, navigating: false }}
          mapZoom={17}
          trustLevel={0.4}
          tag="tier=growing"
          tagColor="rgba(245,217,138,0.65)"
        />
        <PCard
          label="P14.4 Trust: trusted"
          sub="Covert + breast Kente band"
          state={{ heading: 0, speed: 0, navigating: false }}
          mapZoom={17}
          trustLevel={0.7}
          tag="tier=trusted"
          tagColor="rgba(245,217,138,0.85)"
        />
        <PCard
          label="P14.4 Trust: elder"
          sub="Crown Adinkra + full motif + pulse"
          state={{ heading: 0, speed: 0, navigating: false }}
          mapZoom={17}
          trustLevel={0.9}
          tag="tier=elder"
          tagColor="rgba(245,217,138,0.98)"
        />
        {/* P14.5 Weather */}
        <PCard
          label="P14.5 Weather: clear"
          sub="Default daytime appearance"
          state={{ heading: 0, speed: 0, navigating: false }}
          mapZoom={15}
          weather="clear"
          tag="weather=clear"
          tagColor="rgba(100,200,255,0.65)"
        />
        <PCard
          label="P14.5 Weather: rain"
          sub="Dark desaturated feathers + hunch"
          state={{ heading: 0, speed: 0, navigating: false }}
          mapZoom={15}
          weather="rain"
          tag="weather=rain"
          tagColor="rgba(120,160,200,0.85)"
        />
        <PCard
          label="P14.5 Weather: snow"
          sub="Fluffed feathers + bright tips"
          state={{ heading: 0, speed: 0, navigating: false }}
          mapZoom={15}
          weather="snow"
          tag="weather=snow"
          tagColor="rgba(200,230,255,0.9)"
        />
        {/* P14.6 Nictitating membrane */}
        <PCard
          label="P14.6 Nictitating membrane"
          sub="Horizontal sweep — street/high zoom"
          state={{ heading: 0, speed: 0, navigating: false }}
          mapZoom={17}
          tag="3rd eyelid"
          tagColor="rgba(180,230,240,0.85)"
        />
        <PCard
          label="P14.6 Nictitation + busy"
          sub="Fires 1.7× more often at peak activity"
          state={{ heading: 0, speed: 0, navigating: false }}
          mapZoom={17}
          activityLevel={0.85}
          tag="activity=peak"
          tagColor="rgba(180,230,240,0.95)"
        />
        {/* P14.7 Heading momentum spring */}
        <PCard
          label="P14.7 Momentum spring"
          sub="Container springs on heading change"
          state={{ heading: 45, speed: 8, navigating: true }}
          mapZoom={15}
          tag="spring bezier"
          tagColor="rgba(200,150,255,0.85)"
        />
        <PCard
          label="P14.7 Airplane — no spring"
          sub="Smooth ease-out above 50 m/s"
          state={{ heading: 90, speed: 72, navigating: true }}
          mapZoom={12}
          tag="speed=airplane"
          tagColor="rgba(200,150,255,0.65)"
        />
        {/* P14 + night mode */}
        <PCard
          label="P14 Night + mission"
          sub="Mission complete overlay in night mode"
          state={{ heading: 0, speed: 0, navigating: false }}
          skyTier="night"
          mapZoom={15}
          missionComplete={mission}
          tag="night + mission"
          tagColor="rgba(140,170,255,0.9)"
        />
        {/* P14 + batterySaver */}
        <PCard
          label="P14 Battery saver"
          sub="Chirp/mission suppressed; trust motif persists"
          state={{ heading: 0, speed: 0, navigating: false }}
          mapZoom={15}
          batterySaver
          chirp={chirp}
          missionComplete={mission}
          trustLevel={0.9}
          tag="LOD3+P14"
          tagColor="rgba(255,80,80,0.9)"
        />
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Phase 15 — Solar-Reactive Night Enhancement Suite
   ──────────────────────────────────────────────────────────────────────── */
function Phase15Panel() {
  const speed = useSpeedRamp(60);
  return (
    <div className="flex flex-wrap gap-3">
      {/* P15.1 Night silver trail */}
      <PCard
        label="Night silver trail"
        sub="P15.1: Teal trail turns icy silver-blue at night"
        state={{ heading: 45, speed: 5, navigating: true }}
        skyTier="night"
        mapZoom={14}
        tag="data-sky-tier=night + trail"
        tagColor="rgba(180,210,255,0.9)"
      />
      {/* P15.1 Golden amber trail */}
      <PCard
        label="Golden amber trail"
        sub="P15.1: Trail warms to amber at golden hour"
        state={{ heading: 90, speed: 5, navigating: true }}
        skyTier="golden"
        mapZoom={14}
        tag="data-sky-tier=golden + trail"
        tagColor="rgba(255,200,80,0.9)"
      />
      {/* P15.2 Golden feather cascade */}
      <PCard
        label="Golden feather cascade"
        sub="P15.2: tail/wings/body/crown at 8/11/14/17s periods"
        state={{ heading: 0, speed: 0, navigating: false }}
        skyTier="golden"
        mapZoom={15}
        tag="sankofa-golden-feather-wave"
        tagColor="rgba(255,190,60,0.9)"
      />
      {/* P15.3 Twilight chest glow */}
      <PCard
        label="Twilight heartbeat"
        sub="P15.3: Chest emits slow warm glow-pulse at twilight"
        state={{ heading: null, speed: 0, navigating: false }}
        skyTier="twilight"
        mapZoom={15}
        tag="sankofa-twilight-chest-glow"
        tagColor="rgba(100,120,200,0.9)"
      />
      {/* P15.4 Circadian breathing */}
      <PCard
        label="Night slow breathing"
        sub="P15.4: Chest period 6.8s at night (vs 4s baseline)"
        state={{ heading: null, speed: 0, navigating: false }}
        skyTier="night"
        mapZoom={15}
        tag="animation-duration 6.8s"
        tagColor="rgba(120,150,255,0.9)"
      />
      <PCard
        label="Golden quick breathing"
        sub="P15.4: Chest period 3.2s at golden hour"
        state={{ heading: null, speed: 0, navigating: false }}
        skyTier="golden"
        mapZoom={15}
        tag="animation-duration 3.2s"
        tagColor="rgba(255,200,60,0.9)"
      />
      {/* P15.5 Night thermal ring */}
      <PCard
        label="Night thermal ring"
        sub="P15.5: Warm amber glow ring when flying at night"
        state={{ heading: 0, speed: 8, navigating: true }}
        skyTier="night"
        mapZoom={14}
        tag="night+flying: thermal"
        tagColor="rgba(255,160,60,0.9)"
      />
      {/* P15.6 Night+helping bioluminescence */}
      <PCard
        label="Night bioluminescence"
        sub="P15.6: Wing edges glow gold-teal when helping at night"
        state={{ heading: 0, speed: 5, navigating: true }}
        skyTier="night"
        isHelping
        mapZoom={15}
        tag="night+helping: bio-glow"
        tagColor="rgba(80,200,180,0.9)"
      />
      {/* P15.7 Shadow tinting */}
      <PCard
        label="Night shadow (moonlit)"
        sub="P15.7: Shadow tinted cool blue at night"
        state={{ heading: 0, speed: 0, navigating: false }}
        skyTier="night"
        mapZoom={12}
        tag="data-sky-tier=night shadow"
        tagColor="rgba(80,110,200,0.9)"
      />
      <PCard
        label="Golden shadow (warm)"
        sub="P15.7: Shadow tinted amber at golden hour"
        state={{ heading: 0, speed: 0, navigating: false }}
        skyTier="golden"
        mapZoom={12}
        tag="data-sky-tier=golden shadow"
        tagColor="rgba(180,100,20,0.9)"
      />
      {/* P15.8 Crown phosphorescence */}
      <PCard
        label="Crown phosphorescence"
        sub="P15.8: Crown tips glow blue-white at night (high zoom)"
        state={{ heading: null, speed: 0, navigating: false }}
        skyTier="night"
        mapZoom={15}
        tag="sankofa-crown-phosphor"
        tagColor="rgba(200,220,255,0.9)"
        size={52}
      />
      {/* P15.9 Golden tail cascade */}
      <PCard
        label="Golden tail iridescence"
        sub="P15.9: Outer/far tail feathers shimmer at golden hour"
        state={{ heading: 0, speed: 10, navigating: true }}
        skyTier="golden"
        mapZoom={15}
        tag="sankofa-golden-tail-glimmer"
        tagColor="rgba(255,180,40,0.9)"
      />
      {/* P15.10 sky-tier ramp speed */}
      <PCard
        label="Speed + night"
        sub="P15.10 + speed ramp: stagger transitions at night"
        state={{ heading: 45, speed, navigating: true }}
        skyTier="night"
        mapZoom={14}
        tag="circadian at speed"
        tagColor="rgba(100,150,255,0.9)"
      />
    </div>
  );
}

/* Landing loop: fly for 2 s, then stop to cycle through hover phase (~1.4 s in). */
function useLandingLoop(flySpeed = 8) {
  const [nav, setNav] = useState(true);
  const [spd, setSpd] = useState(flySpeed);
  useEffect(() => {
    let alive = true;
    (async () => {
      while (alive) {
        setNav(true); setSpd(flySpeed);
        await new Promise<void>(r => setTimeout(r, 2000));
        if (!alive) break;
        setNav(false); setSpd(0);
        await new Promise<void>(r => setTimeout(r, 3800));
      }
    })();
    return () => { alive = false; };
  }, [flySpeed]);
  return { nav, spd };
}

/* Takeoff loop: idle for 1.5 s, then take off (data-landing="takeoff" fires briefly). */
function useTakeoffLoop(flySpeed = 8) {
  const [nav, setNav] = useState(false);
  const [spd, setSpd] = useState(0);
  useEffect(() => {
    let alive = true;
    (async () => {
      while (alive) {
        setNav(false); setSpd(0);
        await new Promise<void>(r => setTimeout(r, 1500));
        if (!alive) break;
        setNav(true); setSpd(flySpeed);
        await new Promise<void>(r => setTimeout(r, 3000));
      }
    })();
    return () => { alive = false; };
  }, [flySpeed]);
  return { nav, spd };
}

/* ─────────────────────────────────────────────────────────────────────────
   Phase 16 — Dynamic Aerial Movement Enhancements
   ──────────────────────────────────────────────────────────────────────── */
function Phase16Panel() {
  const speed = useSpeedRamp(80);
  // P16.1 + P16.4: hover wrist and ground ripple need real hover landing phase
  const hoverHigh   = useLandingLoop(8);
  const hoverStreet = useLandingLoop(6);
  // P16.8: dawn stretch needs real takeoff trigger at golden hour
  const takeoffGold = useTakeoffLoop(8);

  return (
    <div className="flex flex-wrap gap-3">
      {/* P16.1 Hover wrist articulation — triggered by landing sequence hover phase */}
      <PCard
        label="Hover wrist flex"
        sub="P16.1: Wing-joint flex when landing sequence reaches hover (~1.4 s after stop)"
        state={{ heading: null, speed: hoverHigh.spd, navigating: hoverHigh.nav }}
        mapZoom={15}
        tag="data-landing=hover wrist"
        tagColor="rgba(0,212,255,0.9)"
      />
      <PCard
        label="Hover wrist (street)"
        sub="P16.1: Street zoom — 0.19 s offset between left/right joints"
        state={{ heading: null, speed: hoverStreet.spd, navigating: hoverStreet.nav }}
        mapZoom={17}
        tag="data-zoom=street hover"
        tagColor="rgba(0,212,255,0.9)"
        size={52}
      />
      {/* P16.2 Soaring multi-wave — data-aero-mode="soar" fires when soaring=true or speed>30 */}
      <PCard
        label="Soaring tail+chest wave"
        sub="P16.2: 3.1 s tail+chest secondary wave during soar (data-aero-mode=soar)"
        state={{ heading: 0, speed: 35, navigating: true }}
        mapZoom={12}
        soaring
        tag="aero-mode=soar: multi-wave"
        tagColor="rgba(150,200,100,0.9)"
      />
      <PCard
        label="High-speed soar wave"
        sub="P16.2: speed > 30 m/s auto-triggers soar mode without soaring prop"
        state={{ heading: 0, speed: 45, navigating: true }}
        mapZoom={12}
        tag="speed=45 → aero-mode=soar"
        tagColor="rgba(130,190,100,0.9)"
      />
      {/* P16.3 Night light streaks — airplane speed + night sky tier */}
      <PCard
        label="Night light streaks"
        sub="P16.3: Airplane speed at night — silver photon trails on outer primaries"
        state={{ heading: 90, speed: 65, navigating: true }}
        skyTier="night"
        mapZoom={13}
        tag="night + speed=airplane: streaks"
        tagColor="rgba(200,220,255,0.9)"
      />
      {/* P16.4 Ground effect ripple — street zoom hover via landing sequence */}
      <PCard
        label="Ground effect ripple"
        sub="P16.4: Shadow expands during hover phase at street zoom"
        state={{ heading: null, speed: hoverStreet.spd, navigating: hoverStreet.nav }}
        mapZoom={17}
        tag="data-landing=hover data-zoom=street"
        tagColor="rgba(0,255,200,0.9)"
        size={52}
      />
      {/* P16.5 Aurora burst — celebrating=true at night */}
      <PCard
        label="Aurora burst (night)"
        sub="P16.5: Celebrating at night = blue-violet aurora instead of teal burst"
        state={{ heading: 0, speed: 0, navigating: false, celebrating: true }}
        skyTier="night"
        mapZoom={14}
        tag="night + celebrating: aurora"
        tagColor="rgba(140,100,255,0.9)"
      />
      {/* P16.6 Soaring altitude scale */}
      <PCard
        label="Soaring altitude scale"
        sub="P16.6: Body oscillates scale 0.95-1.06 across 4.2 s soaring cycle"
        state={{ heading: 0, speed: 35, navigating: true }}
        mapZoom={12}
        soaring
        tag="data-soaring=true: body scale"
        tagColor="rgba(100,220,150,0.9)"
      />
      {/* P16.7 Approach feather ruffle — data-approaching="true" */}
      <PCard
        label="Approach feather ruffle"
        sub="P16.7: 12 primaries cascade as air-brakes (3 iterations, 60 ms stagger)"
        state={{ heading: 0, speed: 3, navigating: true }}
        mapZoom={15}
        approaching
        tag="data-approaching=true: ruffle"
        tagColor="rgba(255,140,80,0.9)"
      />
      {/* P16.8 Dawn wing stretch — golden hour + takeoff landing phase (loops every ~4.5 s) */}
      <PCard
        label="Dawn wing-stretch"
        sub="P16.8: Golden-hour takeoff → wings flare warm (fires once at launch)"
        state={{ heading: 0, speed: takeoffGold.spd, navigating: takeoffGold.nav }}
        skyTier="golden"
        mapZoom={14}
        tag="golden + data-landing=takeoff"
        tagColor="rgba(255,200,50,0.9)"
      />
      {/* Compound: night + soaring + speed ramp */}
      <PCard
        label="Night soaring ramp"
        sub="P16.2+P16.3+P16.6: Night + soaring + speed ramp = full compound"
        state={{ heading: 45, speed, navigating: true }}
        skyTier="night"
        mapZoom={13}
        soaring
        tag="compound P16"
        tagColor="rgba(120,160,255,0.9)"
      />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Phase metadata (used for the tab bar)
   ──────────────────────────────────────────────────────────────────────── */
interface PhaseSpec {
  num: number;
  name: string;
  color: string;
  summary: string;
  attrs: string[];
  Panel: () => React.ReactElement;
}

const PHASES: PhaseSpec[] = [
  {
    num: 1,
    name: "Core Flight System",
    color: "rgba(0,212,255,0.9)",
    summary: "Speed tiers, flap rate, lean angle, banking (live heading delta), trail particles, takeoff/landing sequences. Foundational CSS vars: --flap-period, --lean-deg, --speed-factor.",
    attrs: ["data-flying", "data-speed", "data-landing", "data-gliding", "data-hard-bank"],
    Panel: Phase1Panel,
  },
  {
    num: 2,
    name: "Iridescence + Eye Detail",
    color: "rgba(100,200,255,0.9)",
    summary: "Per-feather iridescence, directional lighting (--lighting-factor from heading), eye catchlight, breast sheen, neck S-wave, crown speculars, scapular breathing, tail iridescence.",
    attrs: ["data-zoom", "heading prop → --lighting-factor", "--help-shimmer"],
    Panel: Phase2Panel,
  },
  {
    num: 3,
    name: "Beyond-Rive Compound Effects",
    color: "rgba(150,100,255,0.9)",
    summary: "Vortex rings, body elongation, isHelping gold shimmer, night-mode filter, donate golden sparkle, idle weight-shift, blink eyelid, wing-tip slot on takeoff.",
    attrs: ["data-helping", "data-night-mode", "data-donated", "--vortex-opacity", "--body-elongation"],
    Panel: Phase3Panel,
  },
  {
    num: 4,
    name: "Environmental Physics Vars",
    color: "rgba(255,150,50,0.9)",
    summary: "Walk-dust puffs (--turb-x/--turb-y), --bank-angle CSS var, P4 wing highlight on bank. @property declarations for length-type vars used in environmental effects.",
    attrs: ["--turb-x", "--turb-y", "--bank-angle", "data-speed=walking"],
    Panel: Phase4Panel,
  },
  {
    num: 5,
    name: "Advanced Feather Rendering",
    color: "rgba(100,220,150,0.9)",
    summary: "Feather-slot on takeoff/hover, body feather layers 1–11 visibility by zoom, --feather-base-opacity, --bfs-opacity per-layer, vortex opacity at speed.",
    attrs: ["--feather-base-opacity", "--bfs-opacity", "--vortex-opacity", "data-zoom"],
    Panel: Phase5Panel,
  },
  {
    num: 6,
    name: "Solar / Environmental / LOD",
    color: "rgba(255,200,50,0.9)",
    summary: "P6.1–P6.9: off-screen pause, pupil dilation by sky tier, golden breast, twilight desat, micro-turbulence, downstroke specular, approach ruffle, head bob, navLod 0/1/2.",
    attrs: ["data-sky-tier", "data-approaching", "data-nav-lod", "data-off-screen"],
    Panel: Phase6Panel,
  },
  {
    num: 7,
    name: "Biomechanics",
    color: "rgba(200,150,255,0.9)",
    summary: "P7.1–P7.7: egg pendulum inertia, head stabilization, curiosity tilt, stochastic wingbeat, battery crossfade, mid-zoom neck arc (0.18×), wing-highlight transition.",
    attrs: ["data-zoom=mid", "approaching", "batterySaver"],
    Panel: Phase7Panel,
  },
  {
    num: 8,
    name: "Vision-Doc Biomechanical",
    color: "rgba(255,120,120,0.9)",
    summary: "P8.1–P8.8: wing asymmetry +18ms, feather lag cascade, shadow warp on bank, night eye reflectiveness, tail spring cubic-bezier, wind tail-fan, anticipatory look, wing salute.",
    attrs: ["upcomingTurnDirection", "data-accepted", "data-night-mode"],
    Panel: Phase8Panel,
  },
  {
    num: 9,
    name: "Composition / Interaction Tests",
    color: "rgba(180,180,180,0.9)",
    summary: "Verifies all phase effects compose cleanly: glide+bank, crane+bank, night+flying, LOD2+bank, golden+fly, twilight+approach, batterySaver+night, helping+night.",
    attrs: ["compound selectors", "multi-attr composition"],
    Panel: Phase9Panel,
  },
  {
    num: 10,
    name: "Night-Mode Plumage",
    color: "rgba(120,150,255,0.9)",
    summary: "P10.1–P10.10: pupil shimmer, moonlit wing rim, nocturnal breathing, dark plumage deepening, bio-glow flight, slow blink ×1.6, shadow suppress, crown moon tips, lunar egg pearl, low-zoom silhouette.",
    attrs: ["data-night-mode=true", "data-sky-tier=night"],
    Panel: Phase10Panel,
  },
  {
    num: 11,
    name: "Gap-Closure Finalization",
    color: "rgba(80,220,180,0.9)",
    summary: "Battery-saver idle-settle guard, navLod opacity transitions, full-body helping crane (head+neck+body+tail), wing-tip flex, crown sway 3-tier, GPU promotion, mid-zoom shimmer.",
    attrs: ["navLodOverride", "isHelping", "activityLevel", "data-zoom=mid"],
    Panel: Phase11Panel,
  },
  {
    num: 12,
    name: "8-Direction Gaze System",
    color: "rgba(0,255,200,0.9)",
    summary: "computeGazeVector() drives data-gaze (9 directions: forward/left/right/up/down/upleft/upright/downleft/downright). Iris + head + neck + body chain. Auto-saccade + nav anticipation.",
    attrs: ["data-gaze", "upcomingTurnDirection", "data-upcoming-turn"],
    Panel: Phase12Panel,
  },
  {
    num: 13,
    name: "Full Authentic Aerodynamics",
    color: "rgba(80,200,120,0.9)",
    summary: "P13.1–P13.12: figure-8 wing stroke, WAIR, dynamic soaring, mating display, hover wrist, knee articulation, murmuration wave, full body gaze chain, feather slot, speed ramp all-aero.",
    attrs: ["data-wair", "data-soaring", "data-mating", "data-aero-mode"],
    Panel: Phase13Panel,
  },
  {
    num: 14,
    name: "Living Companion",
    color: "rgba(245,217,138,0.9)",
    summary: "P14.1–P14.7: chirp beak animation + arc rings, mission-complete tail fan + ripple, community milestone hue wave, trust-tier Adinkra/Kente plumage motifs, weather states (rain/snow), nictitating membrane, heading momentum spring.",
    attrs: ["data-chirp", "data-mission-complete", "data-community-milestone", "data-trust-tier", "data-weather"],
    Panel: Phase14Panel,
  },
  {
    num: 15,
    name: "Solar-Reactive Night Suite",
    color: "rgba(120,150,255,0.9)",
    summary: "P15.1–P15.10: night silver trail, golden feather cascade (tail/wings/body/crown at different periods), twilight chest heartbeat, circadian breathing rhythm, night navigation thermal ring, night+helping bioluminescence, sky-tier shadow tinting, crown phosphorescence, golden tail iridescence, per-element transition stagger. Solar wiring auto via useSolarTier() NOAA math.",
    attrs: ["data-sky-tier", "data-night-mode", ":has() trail selector", "circadian --animation-duration"],
    Panel: Phase15Panel,
  },
  {
    num: 16,
    name: "Dynamic Aerial Enhancements",
    color: "rgba(80,220,180,0.9)",
    summary: "P16.1–P16.8: hover wrist articulation (0.38s figure-8 at high/street zoom), enhanced murmuration multi-wave (3.1s second frequency), night speed light streaks (airplane+night outer primaries), ground-effect hover ripple (street zoom shadow), aurora burst (night+celebrating blue-violet), soaring altitude scale (0.95–1.06 over 4.2s), approach feather ruffle cascade (12 feathers staggered), dawn wing-stretch (golden+takeoff).",
    attrs: ["data-landing=hover", "data-aero-mode=murmuration", "data-soaring", "data-approaching", "P16 compound"],
    Panel: Phase16Panel,
  },
];

/* ─────────────────────────────────────────────────────────────────────────
   Main export — PhaseAuditSuite
   ──────────────────────────────────────────────────────────────────────── */
export function PhaseAuditSuite() {
  const [activePhase, setActivePhase] = useState(1);
  const [runAll, setRunAll] = useState(false);
  const runAllRef = useRef(false);

  // Keyboard ← → navigation
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft")  setActivePhase(p => Math.max(1,  p - 1));
      if (e.key === "ArrowRight") setActivePhase(p => Math.min(16, p + 1));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // "Run All" cycles through phases 1→14 with a 6 s hold per phase
  useEffect(() => {
    runAllRef.current = runAll;
    if (!runAll) return;
    setActivePhase(1);
    let phase = 1;
    const id = setInterval(() => {
      if (!runAllRef.current) { clearInterval(id); return; }
      phase = phase >= 16 ? 1 : phase + 1;
      setActivePhase(phase);
    }, 6000);
    return () => clearInterval(id);
  }, [runAll]);

  const spec = PHASES.find(p => p.num === activePhase)!;
  const { Panel } = spec;

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ border: "1px solid rgba(255,255,255,0.09)", background: "rgba(255,255,255,0.015)" }}
    >
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ background: "rgba(0,0,0,0.35)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}
      >
        <div>
          <h2 className="text-base font-bold text-white">SankofaBird · Phase Audit Suite</h2>
          <p className="text-[10px] mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>
            Per-phase animation verification — every state, data-* attribute, and CSS var, live. Use ← → keys or click tabs.
          </p>
        </div>
        <button
          onClick={() => setRunAll(r => !r)}
          className="text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors"
          style={{
            background: runAll ? "rgba(0,212,255,0.2)" : "rgba(255,255,255,0.07)",
            color:      runAll ? "rgba(0,212,255,0.95)" : "rgba(255,255,255,0.6)",
            border:     runAll ? "1px solid rgba(0,212,255,0.35)" : "1px solid rgba(255,255,255,0.1)",
          }}
        >
          {runAll ? "⏹ Stop" : "▶ Run All (6 s/phase)"}
        </button>
      </div>

      {/* ── Tab strip ──────────────────────────────────────────────────── */}
      <div
        className="flex gap-1 px-3 py-2 overflow-x-auto"
        style={{ background: "rgba(0,0,0,0.22)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        {PHASES.map(p => {
          const active = p.num === activePhase;
          return (
            <button
              key={p.num}
              onClick={() => { setRunAll(false); setActivePhase(p.num); }}
              className="flex-shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all"
              style={{
                background: active ? `${p.color.replace("0.9", "0.18")}` : "rgba(255,255,255,0.04)",
                color:      active ? p.color : "rgba(255,255,255,0.4)",
                border:     active ? `1px solid ${p.color.replace("0.9", "0.3")}` : "1px solid transparent",
                transform:  active ? "scale(1.05)" : "scale(1)",
              }}
            >
              P{p.num}
            </button>
          );
        })}
      </div>

      {/* ── Active phase info ───────────────────────────────────────────── */}
      <div className="px-4 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="flex items-center gap-2 mb-1">
          <span
            className="px-2 py-0.5 rounded-full text-xs font-bold"
            style={{ background: `${spec.color.replace("0.9","0.15")}`, color: spec.color }}
          >
            Phase {spec.num}
          </span>
          <h3 className="text-sm font-bold text-white">{spec.name}</h3>
          {runAll && (
            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(0,212,255,0.12)", color: "rgba(0,212,255,0.8)" }}>
              AUTO ↻
            </span>
          )}
        </div>
        <p className="text-xs" style={{ color: "rgba(255,255,255,0.45)", maxWidth: 700 }}>
          {spec.summary}
        </p>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {spec.attrs.map(a => (
            <code
              key={a}
              className="text-[9px] px-1.5 py-0.5 rounded"
              style={{ background: `${spec.color.replace("0.9","0.1")}`, color: spec.color.replace("0.9","0.7") }}
            >
              {a}
            </code>
          ))}
        </div>
      </div>

      {/* ── Bird cards ─────────────────────────────────────────────────── */}
      <div className="px-4 py-4">
        <Panel />
      </div>

      {/* ── Phase nav footer ────────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ background: "rgba(0,0,0,0.18)", borderTop: "1px solid rgba(255,255,255,0.06)" }}
      >
        <button
          onClick={() => { setRunAll(false); setActivePhase(p => Math.max(1, p - 1)); }}
          disabled={activePhase === 1}
          className="text-xs px-3 py-1.5 rounded-lg font-semibold disabled:opacity-30"
          style={{ background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.65)", border: "1px solid rgba(255,255,255,0.1)" }}
        >
          ← Phase {activePhase - 1 > 0 ? activePhase - 1 : "—"}
        </button>
        <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.3)" }}>
          {activePhase} / 16 · ← → keys navigate · all animations are live CSS
        </span>
        <button
          onClick={() => { setRunAll(false); setActivePhase(p => Math.min(16, p + 1)); }}
          disabled={activePhase === 16}
          className="text-xs px-3 py-1.5 rounded-lg font-semibold disabled:opacity-30"
          style={{ background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.65)", border: "1px solid rgba(255,255,255,0.1)" }}
        >
          Phase {activePhase + 1 <= 16 ? activePhase + 1 : "—"} →
        </button>
      </div>
    </div>
  );
}
