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
  nightMode,
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
  nightMode?: boolean;
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
          nightMode={nightMode}
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
          <em>nearbyUser</em>: wing salute cycles every 5 s. <em>Upcoming Turn</em>: head glances + body lean + outside-wing pre-extension before turn fires.
        </p>
        <div className="flex flex-wrap gap-3 mb-8">
          <NearbyUserDemo />
          <UpcomingTurnDemo />
          {/* Upcoming-turn body+wing anticipation — gap-close: left vs right side-by-side */}
          <BirdCard
            label="Upcoming Left — body lean"
            subLabel="body leans left + right wing pre-extends"
            state={{ heading: 0, mapBearing: 0, speed: 10, navigating: true }}
            upcomingTurnDirection="left"
            mapZoom={15}
            badge="GAP CLOSED"
          />
          <BirdCard
            label="Upcoming Right — body lean"
            subLabel="body leans right + left wing pre-extends"
            state={{ heading: 0, mapBearing: 0, speed: 10, navigating: true }}
            upcomingTurnDirection="right"
            mapZoom={15}
            badge="GAP CLOSED"
          />
        </div>

        {/* ── Gap-close: Speed-correlated crown sway ────────────────────── */}
        <SectionLabel>Speed-correlated crown sway (gap-close: was fixed-speed)</SectionLabel>
        <p className="text-xs mb-3" style={{ color: "rgba(255,255,255,0.35)" }}>
          Crown sway period now scales with GPS speed: gentle at walking, rapid at driving, streamline-flat at airplane.
        </p>
        <div className="flex flex-wrap gap-3 mb-8">
          {([
            { label: "Walking — slow sway", subLabel: "3.5s gentle droop", speed: 1.4, zoom: 17 },
            { label: "Running — medium sway", subLabel: "2.0s", speed: 5, zoom: 17 },
            { label: "Driving — rapid sway", subLabel: "1.1s wind effect", speed: 14, zoom: 17 },
            { label: "Airplane — streamline", subLabel: "feathers press flat against skull", speed: 55, zoom: 17 },
          ]).map(({ label, subLabel, speed, zoom }) => (
            <BirdCard
              key={label}
              label={label}
              subLabel={subLabel}
              state={{ heading: 0, mapBearing: 0, speed, navigating: true }}
              mapZoom={zoom}
              badge="GAP CLOSED"
            />
          ))}
        </div>

        {/* ── Gap-close: Gliding thermal lift on body ───────────────────── */}
        <SectionLabel>Gliding thermal lift — body oscillation at airplane speed (gap-close)</SectionLabel>
        <p className="text-xs mb-3" style={{ color: "rgba(255,255,255,0.35)" }}>
          At airplane speed the body now shows a lazy 4s thermal-ride swell (vertical + pitch oscillation) — "soaring on an updraft."
          Compare to normal flying speed where the body lean is static.
        </p>
        <div className="flex flex-wrap gap-3 mb-8">
          <BirdCard
            label="Normal flight (8 m/s)"
            subLabel="static forward lean"
            state={{ heading: 0, mapBearing: 0, speed: 8, navigating: true }}
            badge="baseline"
          />
          <BirdCard
            label="Gliding (55 m/s)"
            subLabel="4s thermal swell + pitch ±0.8°"
            state={{ heading: 0, mapBearing: 0, speed: 55, navigating: true }}
            mapZoom={15}
            badge="GAP CLOSED"
          />
        </div>

        {/* ── Gap-close: Eye iris micro-saccades on notification ─────────── */}
        <SectionLabel>Eye iris micro-saccades on notification (gap-close)</SectionLabel>
        <p className="text-xs mb-3" style={{ color: "rgba(255,255,255,0.35)" }}>
          On notification: iris now snaps up (alert), darts right (scan), darts left (re-scan) — 3× matching the head-tilt count.
          Requires mapZoom ≥ 15 so the iris is visible.
        </p>
        <div className="flex flex-wrap gap-3 mb-8">
          <BirdCard
            label="Notification (zoom 17)"
            subLabel="iris saccades + head tilt + wing flick"
            state={{ heading: 0, mapBearing: 0, speed: 0, navigating: false, newNotification: true }}
            mapZoom={17}
            badge="GAP CLOSED"
          />
          <BirdCard
            label="Baseline — no notif"
            subLabel="idle iris (no saccade)"
            state={{ heading: 0, mapBearing: 0, speed: 0, navigating: false, newNotification: false }}
            mapZoom={17}
            badge="control"
          />
        </div>

        {/* ── Gap-close: Per-feather micro-oscillations ─────────────────── */}
        <SectionLabel>Per-feather ambient micro-oscillations (gap-close, street zoom + idle)</SectionLabel>
        <p className="text-xs mb-3" style={{ color: "rgba(255,255,255,0.35)" }}>
          At street zoom while idle: each primary feather now has an independent slow opacity oscillation
          (akin to micro-air-currents). Each feather has a unique period (4.2–6.6s) and delay so they're all
          slightly out of phase — a "living wing" effect only visible at max zoom when the bird is standing still.
        </p>
        <div className="flex flex-wrap gap-3 mb-8">
          <BirdCard
            label="Idle — street zoom"
            subLabel="watch feather tips breathe independently"
            state={{ heading: 0, mapBearing: 0, speed: 0, navigating: false }}
            mapZoom={18}
            badge="GAP CLOSED"
          />
          <BirdCard
            label="Idle — mid zoom (no effect)"
            subLabel="micro-oscillations invisible at zoom 12"
            state={{ heading: 0, mapBearing: 0, speed: 0, navigating: false }}
            mapZoom={12}
            badge="control"
          />
          <BirdCard
            label="Battery saver (suppressed)"
            subLabel="LOD3: micro-oscillations off"
            state={{ heading: 0, mapBearing: 0, speed: 0, navigating: false }}
            mapZoom={18}
            batterySaver={true}
            badge="LOD3"
          />
        </div>

        {/* ── Gap-close: Pre-bank feather compression ───────────────────── */}
        <SectionLabel>Pre-bank leading-edge feather compression (gap-close)</SectionLabel>
        <p className="text-xs mb-3" style={{ color: "rgba(255,255,255,0.35)" }}>
          When an upcoming turn is signalled, the OUTSIDE wing's feathers briefly compress (slot together under aerodynamic load)
          before extending. Turning left → right-wing primaries compress; turning right → left-wing primaries compress.
        </p>
        <div className="flex flex-wrap gap-3 mb-8">
          <BirdCard
            label="Pre-bank: upcoming left"
            subLabel="right feathers compress then fan"
            state={{ heading: 0, mapBearing: 0, speed: 10, navigating: true }}
            upcomingTurnDirection="left"
            mapZoom={17}
            badge="GAP CLOSED"
          />
          <BirdCard
            label="Pre-bank: upcoming right"
            subLabel="left feathers compress then fan"
            state={{ heading: 0, mapBearing: 0, speed: 10, navigating: true }}
            upcomingTurnDirection="right"
            mapZoom={17}
            badge="GAP CLOSED"
          />
        </div>

        {/* ── Gap-close: Shadow state coloring ─────────────────────────── */}
        <SectionLabel>Shadow state coloring — gold when helping, teal when celebrating (gap-close)</SectionLabel>
        <p className="text-xs mb-3" style={{ color: "rgba(255,255,255,0.35)" }}>
          Shadow was already teal on celebrating. Now adds: warm amber-gold pulse when isHelping=true.
          Subtle radial warmth as if the bird is casting warm light downward.
        </p>
        <div className="flex flex-wrap gap-3 mb-8">
          <BirdCard
            label="Baseline shadow"
            subLabel="neutral grey ellipse"
            state={{ heading: 0, mapBearing: 0, speed: 0, navigating: false }}
            mapZoom={12}
            badge="baseline"
          />
          <BirdCard
            label="Helping — gold shadow"
            subLabel="amber pulse on ground"
            state={{ heading: 0, mapBearing: 0, speed: 0, navigating: false }}
            mapZoom={12}
            isHelping={true}
            badge="GAP CLOSED"
          />
          <BirdCard
            label="Celebrating — teal shadow"
            subLabel="existing (already done)"
            state={{ heading: 0, mapBearing: 0, speed: 0, navigating: false, celebrating: true }}
            mapZoom={12}
            badge="existing"
          />
        </div>

        {/* ── Gap-close: Helping at low zoom ────────────────────────────── */}
        <SectionLabel>Helping state at low-zoom (gap-close: was invisible at zoom &lt; 10)</SectionLabel>
        <p className="text-xs mb-3" style={{ color: "rgba(255,255,255,0.35)" }}>
          At low zoom, wing highlights are hidden so the gold shimmer was invisible.
          Now: a warm amber drop-shadow halo pulses on the body so the helping state reads at city/country scale.
        </p>
        <div className="flex flex-wrap gap-3 mb-8">
          <BirdCard
            label="Helping — low zoom"
            subLabel="amber body halo (zoom 8)"
            state={{ heading: 0, mapBearing: 0, speed: 0, navigating: false }}
            mapZoom={8}
            isHelping={true}
            badge="GAP CLOSED"
          />
          <BirdCard
            label="Not helping — low zoom"
            subLabel="baseline at zoom 8"
            state={{ heading: 0, mapBearing: 0, speed: 0, navigating: false }}
            mapZoom={8}
            isHelping={false}
            badge="control"
          />
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

        {/* ── Phase 10/12: Night Mode + Gaze System ────────────────────── */}
        <SectionLabel>Phase 10 — Night-mode plumage (nightMode prop wired from useTimeOfDay)</SectionLabel>
        <div className="flex gap-4 flex-wrap mb-8">
          <BirdCard
            label="Day — Idle"
            subLabel="nightMode=false (default)"
            state={{ heading: 0, mapBearing: 0, speed: 0, navigating: false }}
            mapZoom={17}
            badge="DAY"
          />
          <BirdCard
            label="Night — Idle"
            subLabel="nightMode=true: dark plumage"
            state={{ heading: 0, mapBearing: 0, speed: 0, navigating: false }}
            mapZoom={17}
            nightMode={true}
            badge="NIGHT"
          />
          <BirdCard
            label="Night — Flying"
            subLabel="bio-glow + moonlit wing rim"
            state={{ heading: 0, mapBearing: 0, speed: 8, navigating: true }}
            mapZoom={17}
            nightMode={true}
            badge="NIGHT"
          />
          <BirdCard
            label="Night — Helping"
            subLabel="nocturnal gold + night plumage"
            state={{ heading: 0, mapBearing: 0, speed: 8, navigating: true }}
            mapZoom={17}
            nightMode={true}
            isHelping={true}
            badge="NIGHT"
          />
          <BirdCard
            label="Night — Battery saver"
            subLabel="silhouette + dark mode"
            state={{ heading: 0, mapBearing: 0, speed: 0, navigating: false }}
            mapZoom={14}
            nightMode={true}
            batterySaver={true}
            badge="NIGHT"
          />
        </div>

        <SectionLabel>Phase 12 — Real-time 2-axis gaze (neck flex + head pitch + look-dir)</SectionLabel>
        <GazeDirectionDemo />
        <NeckLateralBendDemo />

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
            <li><strong>Upcoming-turn body+wing anticipation (GAP CLOSED)</strong>: body leans 2° into the upcoming turn; outside wing pre-extends 8% beyond normal arc; outside-wing primaries compress before extending — anticipatory physics, not just head glance</li>
            <li><strong>Speed-correlated crown sway (GAP CLOSED)</strong>: sway period scales with speed — 3.5s at walking → 2.0s running → 1.1s driving → streamline-flat at airplane (feathers press against skull)</li>
            <li><strong>Gliding thermal lift on body (GAP CLOSED)</strong>: at airplane speed, body shows a lazy 4s thermal-ride oscillation (vertical + pitch) — "soaring on an updraft" — not just static forward lean</li>
            <li><strong>Eye iris micro-saccades on notification (GAP CLOSED)</strong>: iris snaps up (alert), darts right, darts left — 3× iterations matching the head-tilt count; requires zoom ≥15 for iris to be visible</li>
            <li><strong>Per-feather ambient micro-oscillations (GAP CLOSED)</strong>: at street zoom while idle, each primary feather has an independent slow opacity oscillation (4.2–6.6s each, unique delays) — simulates micro-air-currents on a living wing; battery saver suppresses it</li>
            <li><strong>Pre-bank leading-edge feather compression (GAP CLOSED)</strong>: when upcoming-turn is signalled, outside-wing primaries slot/compress (scaleX 0.88) before fanning back out — aerodynamic load simulation before the bank</li>
            <li><strong>Shadow state coloring (GAP CLOSED)</strong>: shadow is now amber-gold when isHelping=true (warm radial light cast downward), teal-pulse when celebrating; baseline stays neutral grey; battery saver hides shadow</li>
            <li><strong>Helping at low zoom (GAP CLOSED)</strong>: at zoom &lt;10 where wing highlights are hidden, a warm amber drop-shadow halo now pulses on the body so the helping state remains visible at city/country scale</li>
            <li><strong>nightMode (Phase 10, NOW WIRED)</strong>: driven by <code>useTimeOfDay(lat, lng)</code> — real solar elevation at user's GPS position. 10 CSS effects: pupil shimmer, moonlit wing rim, nocturnal breathing (3.2s), dark plumage desaturate, bio-luminescent flight trail, slow blink, shadow suppress, crown moon-tips silver, lunar egg pearl, low-zoom silhouette shift. All gated <code>data-night-mode="true"</code> with battery-saver + reduced-motion guards.</li>
            <li><strong>Phase 12 — Real-time 2-axis gaze (neck flex + head pitch + look-dir)</strong>: <code>computeGazePitchSvgUnits</code> gives vertical head offset in SVG units (approaching/landing=−1.0→−1.8, helping=+0.4, takeoff=+1.0); <code>computeLookDir</code> maps yaw+pitch into 9 named directions. Neck extracted from head group so it bends laterally at the body-end anchor (18,16) independent of head pitch. <code>data-look-dir</code> targets pupil shift, crown posture, iris saccade pause, and body inside-turn scaleX compression via CSS.</li>
          </ul>
        </div>

      </div>
    </div>
  );
}

/* ── Phase 12: Gaze Direction Demo ─────────────────────────────────────────
   Cycles through all 9 look-dir states with explicit props so each state
   triggers the full gaze pipeline (neck flex + head pitch + pupil shift). */
const GAZE_STATES: Array<{
  label: string;
  approaching?: boolean;
  landingPhase?: string;
  isHelping?: boolean;
  upcomingTurnDirection?: "left" | "right" | null;
  speed: number;
  navigating: boolean;
  heading: number;
  lookDirLabel: string;
}> = [
  { label: "Forward", speed: 5, navigating: true, heading: 0, lookDirLabel: "forward" },
  { label: "Left glance", speed: 5, navigating: true, heading: 0, upcomingTurnDirection: "left", lookDirLabel: "left" },
  { label: "Right glance", speed: 5, navigating: true, heading: 0, upcomingTurnDirection: "right", lookDirLabel: "right" },
  { label: "Look up (takeoff)", speed: 5, navigating: true, heading: 0, lookDirLabel: "up" },
  { label: "Look down (approach)", speed: 5, navigating: true, heading: 0, approaching: true, lookDirLabel: "down" },
  { label: "Left-down (left turn + approach)", speed: 5, navigating: true, heading: 0, upcomingTurnDirection: "left", approaching: true, lookDirLabel: "left-down" },
  { label: "Right-down (right turn + approach)", speed: 5, navigating: true, heading: 0, upcomingTurnDirection: "right", approaching: true, lookDirLabel: "right-down" },
  { label: "Left-up (left turn + helping)", speed: 5, navigating: true, heading: 0, upcomingTurnDirection: "left", isHelping: true, lookDirLabel: "left-up" },
  { label: "Right-up (right + helping)", speed: 5, navigating: true, heading: 0, upcomingTurnDirection: "right", isHelping: true, lookDirLabel: "right-up" },
  { label: "Up (helping at idle)", speed: 0, navigating: false, heading: 0, isHelping: true, lookDirLabel: "up" },
];

function GazeDirectionDemo() {
  const [idx, setIdx] = useState(0);
  const [auto, setAuto] = useState(true);

  useEffect(() => {
    if (!auto) return;
    const t = setInterval(() => setIdx(i => (i + 1) % GAZE_STATES.length), 1800);
    return () => clearInterval(t);
  }, [auto]);

  const gs = GAZE_STATES[idx];
  return (
    <div className="mb-6">
      <div className="flex gap-3 flex-wrap mb-4">
        {GAZE_STATES.map((g, i) => (
          <button
            key={i}
            onClick={() => { setIdx(i); setAuto(false); }}
            className="text-xs px-3 py-1 rounded-lg"
            style={{
              background: i === idx ? "rgba(0,200,200,0.18)" : "rgba(255,255,255,0.05)",
              border: `1px solid ${i === idx ? "rgba(0,200,200,0.5)" : "rgba(255,255,255,0.1)"}`,
              color: i === idx ? "hsl(190,100%,65%)" : "rgba(255,255,255,0.5)",
              cursor: "pointer",
            }}
          >
            {g.lookDirLabel}
          </button>
        ))}
        <button
          onClick={() => setAuto(a => !a)}
          className="text-xs px-3 py-1 rounded-lg ml-2"
          style={{
            background: auto ? "rgba(0,200,200,0.08)" : "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.12)",
            color: "rgba(255,255,255,0.5)",
            cursor: "pointer",
          }}
        >
          {auto ? "⏸ pause" : "▶ auto"}
        </button>
      </div>
      <div className="flex gap-6 items-start flex-wrap">
        <div
          className="flex flex-col items-center gap-3 rounded-xl p-5"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", minWidth: 180 }}
        >
          <div style={{ width: 96, height: 96, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <SankofaBird
              heading={gs.heading}
              mapBearing={0}
              speed={gs.speed}
              navigating={gs.navigating}
              size={64}
              approaching={gs.approaching}
              isHelping={gs.isHelping}
              upcomingTurnDirection={gs.upcomingTurnDirection ?? null}
              mapZoom={17}
            />
          </div>
          <p className="text-sm font-semibold text-white text-center leading-snug">{gs.label}</p>
          <p className="text-xs text-center" style={{ color: "rgba(255,255,255,0.45)" }}>
            look-dir: <span style={{ color: "hsl(190,100%,65%)" }}>{gs.lookDirLabel}</span>
          </p>
        </div>
        <div className="flex-1 min-w-48">
          <p className="text-xs mb-2" style={{ color: "rgba(255,255,255,0.35)" }}>What to look for:</p>
          <ul className="text-xs space-y-1.5" style={{ color: "rgba(255,255,255,0.5)" }}>
            <li>• <strong style={{ color: "white" }}>Neck</strong> — lateral flex toward turn direction (body-end anchored)</li>
            <li>• <strong style={{ color: "white" }}>Head pitch</strong> — vertical offset: down on approach/landing, up on helping/alert</li>
            <li>• <strong style={{ color: "white" }}>Crown feathers</strong> — fan up on "up", droop on "down"</li>
            <li>• <strong style={{ color: "white" }}>Pupil shift</strong> — follows look direction (zoom ≥17 to see)</li>
            <li>• <strong style={{ color: "white" }}>Iris saccades</strong> — pause when left/right gaze is active</li>
            <li>• <strong style={{ color: "white" }}>Body scaleX</strong> — slight inside-of-turn compression on upcoming-turn</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

/* ── Phase 12: Neck Lateral Bend Demo ──────────────────────────────────────
   Shows the neck bending independently from the head at sustained bank angles.
   All 3 upcoming-turn states side by side: left, none, right. */
function NeckLateralBendDemo() {
  return (
    <div className="flex gap-4 flex-wrap mb-8">
      {(["left", "none", "right"] as const).map(dir => (
        <div
          key={dir}
          className="flex flex-col items-center gap-3 rounded-xl p-4"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", minWidth: 130 }}
        >
          <div style={{ width: 80, height: 80, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <SankofaBird
              heading={0}
              mapBearing={0}
              speed={8}
              navigating={true}
              size={52}
              upcomingTurnDirection={dir === "none" ? null : dir}
              mapZoom={17}
            />
          </div>
          <p className="text-sm font-semibold text-white">
            {dir === "none" ? "Straight" : dir === "left" ? "← Turn left" : "→ Turn right"}
          </p>
          <p className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>
            neck: {dir === "none" ? "neutral" : dir === "left" ? "−8°" : "+8°"}
          </p>
        </div>
      ))}
      {/* Head pitch comparison — approaching vs cruise vs helping */}
      {(
        [
          { label: "Cruise", approaching: false, isHelping: false, speed: 8, navigating: true, pitchNote: "0 SVG u" },
          { label: "Approaching", approaching: true,  isHelping: false, speed: 8, navigating: true, pitchNote: "−1.0" },
          { label: "Helping", approaching: false, isHelping: true, speed: 8, navigating: true, pitchNote: "+0.4" },
        ] as const
      ).map(s => (
        <div
          key={s.label}
          className="flex flex-col items-center gap-3 rounded-xl p-4"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", minWidth: 130 }}
        >
          <div style={{ width: 80, height: 80, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <SankofaBird
              heading={0}
              mapBearing={0}
              speed={s.speed}
              navigating={s.navigating}
              size={52}
              approaching={s.approaching}
              isHelping={s.isHelping}
              mapZoom={17}
            />
          </div>
          <p className="text-sm font-semibold text-white">{s.label}</p>
          <p className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>pitch: {s.pitchNote}</p>
        </div>
      ))}
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
