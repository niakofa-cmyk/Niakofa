/**
 * /bird-test  — Visual regression harness for SankofaBird flight movement.
 *
 * Shows the bird in every flight state and micro-reaction simultaneously so
 * bugs in any state are visible without needing real GPS or a live server.
 * The animated columns cycle continuously through their state using
 * JavaScript setInterval/setTimeout so the animations are live, not frozen.
 *
 * Route is intentionally public (no auth) — works in dev with no database.
 *
 * Key fixes vs original:
 *  - Banking Left/Right use live BankingLeftDemo/BankingRightDemo so bankDeg
 *    actually fires (bankDeg is driven by heading *changes*, not static values)
 *  - LandingDemo properly clears all 4 scheduled timeouts on unmount
 *  - BankSweepDemo uses small per-tick increments for continuous visible banking
 *  - Unused `tick` state removed
 */
import { useEffect, useRef, useState } from "react";
import { SankofaBird } from "@/components/SankofaBird";

/* ── Demo state shape ─────────────────────────────────────────────────── */
interface BirdState {
  heading: number | null;
  mapBearing: number;
  speed: number;
  navigating: boolean;
  celebrating?: boolean;
  newNotification?: boolean;
  accepted?: boolean;
  donated?: boolean;
}

/* ── Static flight states (no banking — banking needs live heading changes) */
const STATIC_STATES: Array<{ label: string; subLabel: string; state: BirdState }> = [
  {
    label: "Idle",
    subLabel: "standing still, no GPS",
    state: { heading: null, mapBearing: 0, speed: 0, navigating: false },
  },
  {
    label: "Idle — North",
    subLabel: "heading 0°, speed=0",
    state: { heading: 0, mapBearing: 0, speed: 0, navigating: false },
  },
  {
    label: "Walking",
    subLabel: "1.4 m/s · heading 45°",
    state: { heading: 45, mapBearing: 0, speed: 1.4, navigating: true },
  },
  {
    label: "Running",
    subLabel: "5 m/s · heading 90°",
    state: { heading: 90, mapBearing: 0, speed: 5, navigating: true },
  },
  {
    label: "Driving",
    subLabel: "14 m/s · heading 180°",
    state: { heading: 180, mapBearing: 0, speed: 14, navigating: true },
  },
  {
    label: "Gliding",
    subLabel: "55 m/s (airplane) · 270°",
    state: { heading: 270, mapBearing: 0, speed: 55, navigating: true },
  },
  {
    label: "Heading-up",
    subLabel: "mapBearing = heading → always points up",
    state: { heading: 135, mapBearing: 135, speed: 5, navigating: true },
  },
];

/* ── Single bird card ──────────────────────────────────────────────────── */
function BirdCard({
  label,
  subLabel,
  state,
  size = 48,
  nearbyUser,
  upcomingTurnDirection,
  approaching,
  isHelping,
  batterySaver,
  mapZoom,
  badge,
}: {
  label: string;
  subLabel: string;
  state: BirdState;
  size?: number;
  nearbyUser?: boolean;
  upcomingTurnDirection?: "left" | "right" | null;
  approaching?: boolean;
  isHelping?: boolean;
  batterySaver?: boolean;
  mapZoom?: number;
  badge?: string;
}) {
  return (
    <div
      className="flex flex-col items-center gap-3 rounded-xl p-4"
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
        minWidth: 140,
      }}
    >
      <div style={{ width: size + 32, height: size + 32, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <SankofaBird
          heading={state.heading}
          mapBearing={state.mapBearing}
          speed={state.speed}
          navigating={state.navigating}
          size={size}
          celebrating={state.celebrating}
          newNotification={state.newNotification}
          accepted={state.accepted}
          donated={state.donated}
          nearbyUser={nearbyUser}
          approaching={approaching}
          upcomingTurnDirection={upcomingTurnDirection}
          isHelping={isHelping}
          batterySaver={batterySaver}
          mapZoom={mapZoom}
        />
      </div>
      <div className="text-center">
        <p className="text-sm font-semibold text-white leading-tight">{label}</p>
        <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.45)" }}>{subLabel}</p>
        {badge && (
          <span
            className="inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
            style={{ background: "rgba(0,212,255,0.15)", color: "rgba(0,212,255,0.9)", border: "1px solid rgba(0,212,255,0.25)" }}
          >
            {badge}
          </span>
        )}
      </div>
    </div>
  );
}

/* ── Takeoff cycle demo ────────────────────────────────────────────────── */
/**
 * Isolated takeoff-sequence demo: idle (2 s) → navigate=true → takeoff animation
 * (1.2 s crouches/spreads/power flaps) → cruising (3 s) → repeat.
 * Distinct from LandingDemo which starts mid-flight — this one focuses on
 * the idle→flying transition described in the vision doc:
 * "Tap Navigate → looks forward → crouches → spreads wings → two strong flaps → glides".
 */
function TakeoffDemo() {
  const [navigating, setNavigating] = useState(false);
  const [speed, setSpeed] = useState(0);
  const [label, setLabel] = useState("Idle — waiting");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    function schedule(fn: () => void, ms: number) {
      const t = setTimeout(fn, ms);
      timers.current.push(t);
      return t;
    }
    function cycle() {
      timers.current.forEach(clearTimeout);
      timers.current = [];
      // Phase 1: idle for 2 s
      setNavigating(false); setSpeed(0); setLabel("Idle — waiting");
      schedule(() => {
        // Phase 2: trigger takeoff (1.2 s takeoff keyframe, then flying)
        setNavigating(true); setSpeed(8); setLabel("Takeoff! ↑");
        schedule(() => setLabel("Cruising (8 m/s)"), 1200);
        // Phase 3: cruise for 3 s then restart
        schedule(cycle, 4200);
      }, 2000);
    }
    cycle();
    return () => { timers.current.forEach(clearTimeout); };
  }, []);

  return (
    <BirdCard
      label="Takeoff Sequence"
      subLabel={label}
      state={{ heading: 0, mapBearing: 0, speed, navigating }}
    />
  );
}

/* ── Landing cycle demo ────────────────────────────────────────────────── */
/** Cycles: flying → stop navigating → full landing sequence → restart.
 *  All timers tracked in a ref array so cleanup clears every one on unmount. */
function LandingDemo() {
  const [navigating, setNavigating] = useState(true);
  const [speed, setSpeed] = useState(8);
  const [label, setLabel] = useState("Flying (8 m/s)");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    function schedule(fn: () => void, ms: number) {
      const t = setTimeout(fn, ms);
      timers.current.push(t);
      return t;
    }
    function cycle() {
      // Clear any lingering timers from the previous cycle
      timers.current.forEach(clearTimeout);
      timers.current = [];
      setNavigating(true); setSpeed(8); setLabel("Flying (8 m/s)");
      schedule(() => {
        setNavigating(false); setSpeed(0); setLabel("Slowflap ↓");
        schedule(() => setLabel("Hovering ↓"),  1000);
        schedule(() => setLabel("Perching ↓"),  2400);
        schedule(() => setLabel("Idle"),         3400);
        schedule(cycle,                          4800);
      }, 3000);
    }
    cycle();
    return () => { timers.current.forEach(clearTimeout); };
  }, []);

  return (
    <BirdCard
      label="Landing Sequence"
      subLabel={label}
      state={{ heading: 0, mapBearing: 0, speed, navigating }}
    />
  );
}

/* ── Heading sweep demo ────────────────────────────────────────────────── */
/** Smoothly rotates heading 360° to verify rotation is continuous, no snap. */
function HeadingSweepDemo() {
  const [heading, setHeading] = useState(0);
  useEffect(() => {
    let deg = 0;
    const id = setInterval(() => {
      deg = (deg + 1) % 360;
      setHeading(deg);
    }, 20); // ~50 fps
    return () => clearInterval(id);
  }, []);

  return (
    <BirdCard
      label="360° Heading Sweep"
      subLabel={`heading: ${heading}°`}
      state={{ heading, mapBearing: 0, speed: 5, navigating: true }}
    />
  );
}

/* ── Speed ramp demo ───────────────────────────────────────────────────── */
/** Ramps speed 0 → 60 → 0 m/s to verify flap rate and lean continuously. */
function SpeedRampDemo() {
  const [speed, setSpeed] = useState(0);
  useEffect(() => {
    let s = 0;
    let dir = 1;
    const id = setInterval(() => {
      s = Math.max(0, Math.min(60, s + dir * 0.5));
      if (s >= 60) dir = -1;
      if (s <= 0) dir = 1;
      setSpeed(s);
    }, 50);
    return () => clearInterval(id);
  }, []);

  return (
    <BirdCard
      label="Speed Ramp"
      subLabel={`${speed.toFixed(1)} m/s`}
      state={{ heading: 0, mapBearing: 0, speed, navigating: true }}
    />
  );
}

/* ── Bank sweep demo ───────────────────────────────────────────────────── */
/**
 * Continuously oscillates heading left and right to produce sustained visible
 * banking. Uses small per-tick increments (2°/50ms = 40°/s turn rate) so the
 * 700ms bank decay is constantly renewed — unlike a single jump which decays
 * before the next change fires.
 */
function BankSweepDemo() {
  const [heading, setHeading] = useState(90);
  const [label, setLabel] = useState("straight");
  useEffect(() => {
    let h = 90;
    let dir = 1;
    let phase = 0; // 0=left turn, 1=right turn
    const id = setInterval(() => {
      h = (h + dir * 2 + 360) % 360;
      phase += 1;
      if (phase >= 25) { dir = -dir; phase = 0; } // switch direction every 25 ticks = 50°
      setHeading(Math.round(h));
      setLabel(dir > 0 ? "banking right →" : "← banking left");
    }, 50);
    return () => clearInterval(id);
  }, []);

  return (
    <BirdCard
      label="Bank Sweep"
      subLabel={`hdg: ${heading}° ${label}`}
      state={{ heading, mapBearing: 0, speed: 10, navigating: true }}
    />
  );
}

/* ── Banking Left (live) ───────────────────────────────────────────────── */
/**
 * Alternates between straight and a left turn so bankDeg fires from the
 * heading *delta*. Static heading cards never trigger banking — this demo
 * simulates the real scenario where the heading prop changes over time.
 */
function BankingLeftDemo() {
  const [heading, setHeading] = useState(90);
  const [label, setLabel] = useState("straight");

  useEffect(() => {
    // Sequence: straight 1.4s → left turn (−30°) 1.2s → straight 1.4s → ...
    type Step = { h: number; lbl: string; hold: number };
    const steps: Step[] = [
      { h: 90,  lbl: "straight",       hold: 1400 },
      { h: 60,  lbl: "−30° (banking)", hold: 1200 },
    ];
    let i = 0;
    let t: ReturnType<typeof setTimeout>;
    function step() {
      const s = steps[i % steps.length];
      setHeading(s.h);
      setLabel(s.lbl);
      i++;
      t = setTimeout(step, s.hold);
    }
    step();
    return () => clearTimeout(t);
  }, []);

  return (
    <BirdCard
      label="Banking Left"
      subLabel={`hdg: ${heading}° — ${label}`}
      state={{ heading, mapBearing: 0, speed: 10, navigating: true }}
    />
  );
}

/* ── Banking Right (live) ──────────────────────────────────────────────── */
function BankingRightDemo() {
  const [heading, setHeading] = useState(90);
  const [label, setLabel] = useState("straight");

  useEffect(() => {
    type Step = { h: number; lbl: string; hold: number };
    const steps: Step[] = [
      { h: 90,  lbl: "straight",       hold: 1400 },
      { h: 120, lbl: "+30° (banking)", hold: 1200 },
    ];
    let i = 0;
    let t: ReturnType<typeof setTimeout>;
    function step() {
      const s = steps[i % steps.length];
      setHeading(s.h);
      setLabel(s.lbl);
      i++;
      t = setTimeout(step, s.hold);
    }
    step();
    return () => clearTimeout(t);
  }, []);

  return (
    <BirdCard
      label="Banking Right"
      subLabel={`hdg: ${heading}° — ${label}`}
      state={{ heading, mapBearing: 0, speed: 10, navigating: true }}
    />
  );
}

/* ── Nearby User demo ──────────────────────────────────────────────────── */
/**
 * Cycles nearbyUser on/off every 5 s so the wing-salute animation is visible
 * in the harness. The salute is 1.4 s × 2 = 2.8 s, so a 5 s window shows
 * it start, hold, and return cleanly.
 */
function NearbyUserDemo() {
  const [nearbyUser, setNearbyUser] = useState(false);
  const [label, setLabel] = useState("idle — no nearby user");

  useEffect(() => {
    const id = setInterval(() => {
      setNearbyUser(prev => {
        const next = !prev;
        setLabel(next ? "🟢 nearby user — wing salute" : "idle — no nearby user");
        return next;
      });
    }, 5000);
    return () => clearInterval(id);
  }, []);

  return (
    <BirdCard
      label="Nearby User"
      subLabel={label}
      state={{ heading: 0, mapBearing: 0, speed: 0, navigating: false }}
      nearbyUser={nearbyUser}
    />
  );
}

/* ── Upcoming Turn demo ─────────────────────────────────────────────────── */
/**
 * Cycles upcomingTurnDirection null → left → right → null while navigating,
 * so the bird's anticipatory head-glance (and the reactive-bank fallback for
 * the data-flying="true" data-upcoming-turn CSS rules) is verifiable.
 */
function UpcomingTurnDemo() {
  const turns: Array<"left" | "right" | null> = [null, "left", "right"];
  const [idx, setIdx] = useState(0);
  const [speed] = useState(10);

  useEffect(() => {
    const id = setInterval(() => setIdx(i => (i + 1) % turns.length), 2500);
    return () => clearInterval(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const dir = turns[idx];
  return (
    <BirdCard
      label="Upcoming Turn"
      subLabel={dir === null ? "straight ahead" : `glancing ${dir}`}
      state={{ heading: 0, mapBearing: 0, speed, navigating: true }}
      upcomingTurnDirection={dir}
    />
  );
}

/* ── Approaching demo ─────────────────────────────────────────────────── */
/**
 * Simulates the bird within 50 m of its destination — deceleration breathing,
 * slower wing flap (×1.45 period), descent bob, egg glow, trail opacity drop.
 * Doc: "approaching destination → gradually slows → begins descending."
 * Cycles: navigating+far (3 s) → approaching (4 s) → repeat.
 */
function ApproachingDemo() {
  const [approaching, setApproaching] = useState(false);
  const [label, setLabel] = useState("navigating — en route");

  useEffect(() => {
    // Use closure-scoped vars so both timers are always reachable for cleanup.
    // The previous implementation returned the inner nearTimer from the
    // farTimer callback, but it was never accessible to the cleanup function,
    // causing a timer leak on unmount during the approaching phase.
    let farTimer: ReturnType<typeof setTimeout>;
    let nearTimer: ReturnType<typeof setTimeout>;

    const sequence = () => {
      // Far phase — normal flight
      setApproaching(false);
      setLabel("navigating — en route (normal speed)");
      farTimer = setTimeout(() => {
        // Approaching phase — within 50 m
        setApproaching(true);
        setLabel("🟢 approaching — within 50 m, decelerating");
        nearTimer = setTimeout(() => sequence(), 4000);
      }, 3000);
    };

    sequence();
    return () => {
      clearTimeout(farTimer);
      clearTimeout(nearTimer);
    };
  }, []);

  return (
    <BirdCard
      label="Approaching"
      subLabel={label}
      state={{ heading: 0, mapBearing: 0, speed: 3, navigating: true }}
      approaching={approaching}
    />
  );
}

/* ── Main page ─────────────────────────────────────────────────────────── */
export default function BirdTestPage() {
  // Micro-reactions: one at a time, cycling every 3.2s with 2.5s active window
  const [reactionActive, setReactionActive] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const keys = ["celebrating", "newNotification", "accepted", "donated"];
    let i = 0;
    let offTimer: ReturnType<typeof setTimeout>;
    const id = setInterval(() => {
      const key = keys[i % keys.length];
      setReactionActive(prev => {
        const next: Record<string, boolean> = {};
        keys.forEach(k => { next[k] = false; });
        next[key] = true;
        return next;
      });
      clearTimeout(offTimer);
      offTimer = setTimeout(() => setReactionActive({}), 2500);
      i++;
    }, 3200);
    return () => { clearInterval(id); clearTimeout(offTimer); };
  }, []);

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "#0a1015",
        padding: "24px 16px 56px",
        overflowY: "auto",
      }}
    >
      <div style={{ maxWidth: 960, margin: "0 auto" }}>

        {/* ── Header ───────────────────────────────────────────────────── */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">SankofaBird · Flight Test</h1>
          <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.45)" }}>
            Live visual verification of every flight state, animation, and micro-reaction.
            All animations are real CSS — no mocks. Banking cards use live heading changes.
          </p>
        </div>

        {/* ── Static flight states ──────────────────────────────────────── */}
        <SectionLabel>Static flight states</SectionLabel>
        <div className="flex flex-wrap gap-3 mb-8">
          {STATIC_STATES.map(s => (
            <BirdCard key={s.label} label={s.label} subLabel={s.subLabel} state={s.state} />
          ))}
        </div>

        {/* ── Banking (live heading changes) ────────────────────────────── */}
        <SectionLabel>Banking — live heading changes (static heading = no bank)</SectionLabel>
        <p className="text-xs mb-3" style={{ color: "rgba(255,255,255,0.35)" }}>
          bankDeg is driven by the <em>delta</em> between heading updates, not the heading value itself.
          Each demo cycles straight → turn so the real banking animation fires.
        </p>
        <div className="flex flex-wrap gap-3 mb-8">
          <BankingLeftDemo />
          <BankingRightDemo />
          <BankSweepDemo />
        </div>

        {/* ── Micro-reactions ───────────────────────────────────────────── */}
        <SectionLabel>Micro-reactions (auto-cycling every 3.2 s)</SectionLabel>
        <div className="flex flex-wrap gap-3 mb-8">
          {(["celebrating", "newNotification", "accepted", "donated"] as const).map(key => {
            const labels: Record<string, { label: string; subLabel: string }> = {
              celebrating:     { label: "Celebrating",     subLabel: "request completed → teal burst" },
              newNotification: { label: "New Notification", subLabel: "nearby request → look up + wing flick" },
              accepted:        { label: "Accepted",        subLabel: "helper claimed → hop + stretch" },
              donated:         { label: "Donated",         subLabel: "pledge paid → golden sparkle" },
            };
            const isActive = !!reactionActive[key];
            return (
              <BirdCard
                key={key}
                label={labels[key].label}
                subLabel={isActive ? "🟢 ACTIVE" : labels[key].subLabel}
                state={{
                  heading: 0, mapBearing: 0, speed: 0, navigating: false,
                  celebrating:     key === "celebrating"     ? isActive : undefined,
                  newNotification: key === "newNotification" ? isActive : undefined,
                  accepted:        key === "accepted"        ? isActive : undefined,
                  donated:         key === "donated"         ? isActive : undefined,
                }}
              />
            );
          })}
        </div>

        {/* ── Dynamic demos ────────────────────────────────────────────── */}
        <SectionLabel>Dynamic demos (live state changes)</SectionLabel>
        <div className="flex flex-wrap gap-3 mb-8">
          <TakeoffDemo />
          <LandingDemo />
          <HeadingSweepDemo />
          <SpeedRampDemo />
          <ApproachingDemo />
        </div>

        {/* ── Anticipatory & Social ─────────────────────────────────────── */}
        <SectionLabel>Anticipatory & Social behaviors</SectionLabel>
        <p className="text-xs mb-3" style={{ color: "rgba(255,255,255,0.35)" }}>
          <em>nearbyUser</em>: wing salute cycles every 5 s. <em>Upcoming Turn</em>: head glances before turn fires.
        </p>
        <div className="flex flex-wrap gap-3 mb-8">
          <NearbyUserDemo />
          <UpcomingTurnDemo />
        </div>

        {/* ── Level-of-Detail (zoom) demo ───────────────────────────────── */}
        <SectionLabel>Level-of-Detail — zoom-driven rendering tiers</SectionLabel>
        <p className="text-xs mb-3" style={{ color: "rgba(255,255,255,0.35)" }}>
          Doc: "At street level: individual feathers, breathing, eye reflections. Zoomed out: simplified silhouette, fewer details."
          At zoom &lt;10 (low): feather tips, highlights, legs, shadow, catchlight, and eyelid are hidden.
          At zoom 10–14 (mid): full detail minus high-zoom extras.
          At zoom ≥15 (high): extra iridescent shimmer + faster breathing + hue-shift on wing bodies.
        </p>
        <div className="flex flex-wrap gap-4 mb-8">
          {([
            { label: "Zoom 8 — Low LOD", subLabel: "simplified silhouette only", mapZoom: 8 },
            { label: "Zoom 12 — Mid LOD", subLabel: "normal detail (map default)", mapZoom: 12 },
            { label: "Zoom 17 — High LOD", subLabel: "full cinematic (street level)", mapZoom: 17 },
          ] as const).map(({ label, subLabel, mapZoom }) => (
            <div
              key={mapZoom}
              className="flex flex-col items-center gap-3 rounded-xl p-4"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                minWidth: 160,
              }}
            >
              <div style={{ width: 80, height: 80, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <SankofaBird
                  heading={45}
                  mapBearing={0}
                  speed={5}
                  navigating={true}
                  size={48}
                  mapZoom={mapZoom}
                />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-white leading-tight">{label}</p>
                <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.45)" }}>{subLabel}</p>
                <p className="text-[10px] mt-1 font-mono" style={{ color: "rgba(0,212,255,0.6)" }}>
                  mapZoom={mapZoom}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* ── isHelping — gold shimmer state (design doc gap) ──────────── */}
        <SectionLabel>isHelping — Gold shimmer (en-route helper state)</SectionLabel>
        <p className="text-xs mb-3" style={{ color: "rgba(255,255,255,0.35)" }}>
          Design doc: "Helping someone → warm golden sparkles mixed with teal." Distinct from celebrating (teal burst on
          completion) and donated (egg pledge glow). isHelping fires when the user has accepted a request and is actively
          en route. Body gets a warm-gold ambient halo; wing iridescence shifts from teal toward amber; trail gains a
          gold tint; egg carries a steady golden inner light ("carrying the future").
        </p>
        <div className="flex flex-wrap gap-4 mb-8">
          <BirdCard
            label="Not helping"
            subLabel="navigating, teal iridescence"
            state={{ heading: 45, mapBearing: 0, speed: 8, navigating: true }}
            mapZoom={15}
            isHelping={false}
            badge="baseline"
          />
          <BirdCard
            label="isHelping=true"
            subLabel="gold shimmer, warm trail"
            state={{ heading: 45, mapBearing: 0, speed: 8, navigating: true }}
            mapZoom={15}
            isHelping={true}
            badge="NEW"
          />
          <BirdCard
            label="Helping — idle"
            subLabel="stationary but en route"
            state={{ heading: 90, mapBearing: 0, speed: 0, navigating: false }}
            mapZoom={15}
            isHelping={true}
            badge="NEW"
          />
          <BirdCard
            label="Helping + notification"
            subLabel="gold shimmer + alert"
            state={{ heading: 0, mapBearing: 0, speed: 5, navigating: true, newNotification: true }}
            mapZoom={15}
            isHelping={true}
            badge="NEW"
          />
        </div>

        {/* ── CrownFeathers — Sankofa bird's tuft (design doc gap) ──────── */}
        <SectionLabel>CrownFeathers — teal tuft on head (design doc: Head → CrownFeathers)</SectionLabel>
        <p className="text-xs mb-3" style={{ color: "rgba(255,255,255,0.35)" }}>
          Three narrow curved paths fan at the top of the head — the Sankofa bird's most recognisable crest feature.
          Hidden at low zoom (too small), subdued at mid zoom, fully visible and animated at high zoom. Sways gently with
          wind; droops slightly during idle breathing; spikes upward on notification; fans out on celebration.
          Tinted gold when isHelping=true.
        </p>
        <div className="flex flex-wrap gap-4 mb-8">
          {([
            { label: "Low zoom — hidden", subLabel: "mapZoom=8 (LOD2)", mapZoom: 8 },
            { label: "Mid zoom — subdued", subLabel: "mapZoom=12 (LOD1)", mapZoom: 12 },
            { label: "High zoom — visible", subLabel: "mapZoom=17 (LOD0) — sway", mapZoom: 17 },
            { label: "High zoom — celebrating", subLabel: "crown feathers fan out", mapZoom: 17, celebrating: true },
          ]).map(({ label, subLabel, mapZoom, celebrating }) => (
            <div
              key={label}
              className="flex flex-col items-center gap-3 rounded-xl p-4"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", minWidth: 140 }}
            >
              <div style={{ width: 80, height: 80, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <SankofaBird
                  heading={0}
                  mapBearing={0}
                  speed={0}
                  navigating={false}
                  size={48}
                  mapZoom={mapZoom}
                  celebrating={celebrating ?? false}
                />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-white leading-tight">{label}</p>
                <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.45)" }}>{subLabel}</p>
                <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: "rgba(0,212,255,0.15)", color: "rgba(0,212,255,0.9)", border: "1px solid rgba(0,212,255,0.25)" }}>NEW</span>
              </div>
            </div>
          ))}
        </div>

        {/* ── Stretch animation — idle periodic wing extension (design doc gap) */}
        <SectionLabel>Stretch — periodic idle wing extension (design doc animation state)</SectionLabel>
        <p className="text-xs mb-3" style={{ color: "rgba(255,255,255,0.35)" }}>
          Design doc animation state: "Stretch — the bird periodically extends both wings to their full span then folds
          back." Fires only when idle (speed=0, not navigating). The 14s period means it happens infrequently — organic,
          not mechanical. Left wing leads by 80ms, right follows with micro-asymmetry matching real bird behaviour.
          Wings sweep to full span (±48°) then return to resting fold. This demo keeps the bird idle so you can wait and
          watch the stretch fire at ~10s in.
        </p>
        <div className="flex flex-wrap gap-4 mb-8">
          <BirdCard
            label="Idle — watch for stretch"
            subLabel="periodic at ~10s · zoom=17"
            state={{ heading: 0, mapBearing: 0, speed: 0, navigating: false }}
            mapZoom={17}
            badge="NEW"
          />
          <BirdCard
            label="Idle — phase offset"
            subLabel="started at different time"
            state={{ heading: 180, mapBearing: 0, speed: 0, navigating: false }}
            mapZoom={17}
            badge="NEW"
          />
          <BirdCard
            label="Flying (no stretch)"
            subLabel="stretch only fires when idle"
            state={{ heading: 45, mapBearing: 0, speed: 8, navigating: true }}
            mapZoom={17}
            badge="control"
          />
        </div>

        {/* ── batterySaver — LOD3 minimal silhouette (design doc gap) ────── */}
        <SectionLabel>batterySaver — LOD3 minimal silhouette (design doc: "LOD3")</SectionLabel>
        <p className="text-xs mb-3" style={{ color: "rgba(255,255,255,0.35)" }}>
          Design doc: "LOD3 — Minimal silhouette." When batterySaver=true nearly all GPU-intensive effects are disabled:
          feather detail, iridescence, orbit particles, glow layers, eye animations, shadow, and trail are all hidden.
          The bird still flaps and floats so it reads as alive, but at minimal GPU cost. Use when device reports low
          battery or user enables data-saving / accessibility mode.
        </p>
        <div className="flex flex-wrap gap-4 mb-8">
          <BirdCard
            label="Full detail (baseline)"
            subLabel="LOD0 — all effects"
            state={{ heading: 45, mapBearing: 0, speed: 5, navigating: true }}
            mapZoom={17}
            batterySaver={false}
            badge="LOD0"
          />
          <BirdCard
            label="Battery saver — flying"
            subLabel="LOD3 — teal silhouette only"
            state={{ heading: 45, mapBearing: 0, speed: 5, navigating: true }}
            mapZoom={17}
            batterySaver={true}
            badge="NEW"
          />
          <BirdCard
            label="Battery saver — idle"
            subLabel="LOD3 — flap only, no glow"
            state={{ heading: null, mapBearing: 0, speed: 0, navigating: false }}
            mapZoom={17}
            batterySaver={true}
            badge="NEW"
          />
        </div>

        {/* ── Size comparison ───────────────────────────────────────────── */}
        <SectionLabel>Size comparison (map marker = 34px default, test = 48px)</SectionLabel>
        <div className="flex gap-6 items-end mb-8 flex-wrap">
          {[24, 34, 48, 64].map(sz => (
            <div key={sz} className="flex flex-col items-center gap-2">
              <SankofaBird
                heading={45}
                mapBearing={0}
                speed={5}
                navigating={true}
                size={sz}
              />
              <span className="text-xs" style={{ color: "rgba(255,255,255,0.45)" }}>{sz}px</span>
            </div>
          ))}
        </div>

        {/* ── Legend ────────────────────────────────────────────────────── */}
        <div
          className="rounded-xl p-4 text-xs"
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.06)",
            color: "rgba(255,255,255,0.4)",
          }}
        >
          <p className="font-semibold text-white mb-2">How to interpret</p>
          <ul className="space-y-1 list-disc list-inside">
            <li><strong>Idle</strong>: gentle 2px float, symmetric ±15° wing flap at 1.4s period</li>
            <li><strong>Walking (1.4 m/s)</strong>: flying mode, lean ≈ 7°, flap ~640ms</li>
            <li><strong>Running (5 m/s)</strong>: lean ≈ 11°, flap ~455ms</li>
            <li><strong>Driving (14 m/s)</strong>: lean 15°, flap 200ms</li>
            <li><strong>Gliding (55 m/s)</strong>: wings spread flat, 4s slow oscillation (airplane)</li>
            <li><strong>Heading-up</strong>: mapBearing = heading → bird always faces screen top</li>
            <li><strong>Banking</strong>: driven by heading delta (not value) — outside wing extends, inside folds, tail bends; decays 700ms after last heading change</li>
            <li><strong>Celebrating</strong>: teal burst (8 directional particles via --deg CSS var) + egg glow</li>
            <li><strong>Donated</strong>: golden sparkle (6-pointed, 6 particles) — egg turns gold</li>
            <li><strong>Trail particles</strong>: speed-tiered — walking: 3 soft teal dots; running: 3 elongated ovals; driving: 4 slim wind-streaks; airplane: 2 wide wisp bars with blur — trail fires while moving OR during slowflap/dive/takeoff landing phases</li>
            <li><strong>Takeoff sequence</strong>: idle (2 s pause) → navigate=true → crouch/spread/power-flap (1.2 s) → cruise</li>
            <li><strong>Landing sequence</strong>: flying → slowflap (800ms) → hover (1600ms) → perch (2600ms) → idle</li>
            <li><strong>Nearby User</strong>: wing salute fires when another helper is within 200 m; debounced 3 s so salute completes before clearing</li>
            <li><strong>Upcoming Turn</strong>: head glances left/right anticipating next maneuver before the turn instruction fires</li>
            <li><strong>Iridescence</strong>: wing highlights shift hue based on real-world heading (--heading-deg × 0.25 in keyframe) — Blue→Turquoise→Emerald→Silver→Blue like a hummingbird; chest also hue-shifts at zoom ≥15</li>
            <li><strong>Approaching (≤ 50 m to destination)</strong>: flap rate slows ×1.45, trail fades over 0.6 s (CSS transition), gentle 2.5px descent-bob on the whole rig, egg pulses expectantly; hysteresis band clears at &gt;60 m to prevent GPS jitter from toggling the animation</li>
            <li><strong>On-duty egg glow</strong>: faint teal drop-shadow on egg when flying (data-flying="true") — symbolises "carrying the future forward"</li>
            <li><strong>Map integration</strong>: heading = fusedHeading (GPS + magnetometer blend), speed from myLocation, navigating = helperModeActive ∥ speed &gt; 0.3 m/s</li>
            <li><strong>isHelping (NEW)</strong>: warm-gold body halo + amber-shift wing iridescence + gold trail tint + egg gold glow — fires when request accepted and user is en route; distinct from celebrating (teal burst) and donated (egg pledge)</li>
            <li><strong>CrownFeathers (NEW)</strong>: teal tuft on head — design doc's most iconic visual feature; hidden at zoom &lt;10, subdued mid, fully animated at zoom ≥15; spikes on notification, fans on celebrate, tilts gold on isHelping</li>
            <li><strong>Stretch (NEW)</strong>: idle-only periodic wing extension at ~14s interval; wings sweep to ±48° full span then return; 80ms left-right asymmetry for organic feel; fires only when data-landing="idle" + data-flying="false"</li>
            <li><strong>batterySaver (NEW)</strong>: LOD3 minimal silhouette — disables feather detail, iridescence, orbit particles, glow, eye animations, shadow, trail; wings still flap so bird looks alive; use on low-battery / data-saving devices</li>
          </ul>
        </div>

      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="text-xs uppercase font-semibold mb-3"
      style={{ color: "rgba(255,255,255,0.35)", letterSpacing: "0.1em" }}
    >
      {children}
    </h2>
  );
}
