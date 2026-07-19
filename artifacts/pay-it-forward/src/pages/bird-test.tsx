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
  nightMode,
  skyTier,
  activityLevel,
  navLodOverride,
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
  nightMode?: boolean;
  skyTier?: "day" | "golden" | "twilight" | "night";
  activityLevel?: number;
  /** Override the internal navLod for testing — passes navLodOverride to SankofaBird */
  navLodOverride?: 0 | 1 | 2;
}) {
  const bgColor =
    skyTier === "night" || nightMode ? "rgba(10,15,30,0.85)" :
    skyTier === "twilight" ? "rgba(12,18,35,0.7)" :
    skyTier === "golden" ? "rgba(40,25,8,0.75)" : "rgba(255,255,255,0.04)";
  const borderColor =
    skyTier === "night" || nightMode ? "1px solid rgba(80,120,200,0.18)" :
    skyTier === "twilight" ? "1px solid rgba(80,100,160,0.22)" :
    skyTier === "golden" ? "1px solid rgba(200,150,40,0.22)" : "1px solid rgba(255,255,255,0.08)";
  return (
    <div
      className="flex flex-col items-center gap-3 rounded-xl p-4"
      style={{ background: bgColor, border: borderColor, minWidth: 140 }}
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
          nightMode={nightMode}
          skyTier={skyTier}
          activityLevel={activityLevel}
          navLodOverride={navLodOverride}
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

/* ── Upcoming turn / anticipatory look demo ───────────────────────────── */
/**
 * Simulates navigation anticipation: the bird glances toward the upcoming
 * turn (P9.7) before the instruction fires. Cycles through left / none / right.
 * Doc: "Before a left or right turn, it subtly looks in that direction and
 * begins banking, making the motion feel predictive."
 */
function AnticipationDemo() {
  const [turn, setTurn] = useState<"left" | "right" | null>(null);
  const [label, setLabel] = useState("none — heading straight");

  useEffect(() => {
    const steps: Array<{ turn: "left" | "right" | null; label: string; ms: number }> = [
      { turn: null,    label: "heading straight",               ms: 2500 },
      { turn: "left",  label: "⬅ upcoming left — glancing left",  ms: 3000 },
      { turn: null,    label: "turn complete — heading straight",  ms: 2000 },
      { turn: "right", label: "➡ upcoming right — glancing right", ms: 3000 },
    ];
    let i = 0;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const s = steps[i % steps.length];
      setTurn(s.turn);
      setLabel(s.label);
      i++;
      timer = setTimeout(tick, s.ms);
    };
    tick();
    return () => clearTimeout(timer);
  }, []);

  return (
    <BirdCard
      label="Anticipatory Look"
      subLabel={label}
      state={{ heading: 0, mapBearing: 0, speed: 5, navigating: true }}
      upcomingTurnDirection={turn}
    />
  );
}

/* ── Activity level demo ──────────────────────────────────────────────── */
/**
 * Lets the tester set activityLevel 0–1 via slider and observe blink rate +
 * crown alertness change in real-time. Displays all four tiers side-by-side
 * so the progression is immediately comparable.
 */
function ActivityLevelDemo() {
  const [level, setLevel] = useState(0.3);
  const tier =
    level >= 0.85 ? "peak" :
    level >= 0.60 ? "busy" :
    level >= 0.20 ? "normal" : "quiet";

  const tierColor: Record<string, string> = {
    quiet:  "rgba(100,200,255,0.55)",
    normal: "rgba(0,212,255,0.75)",
    busy:   "rgba(255,180,0,0.80)",
    peak:   "rgba(255,80,80,0.90)",
  };
  const blinkMs = tier === "peak" ? 3500 : tier === "busy" ? 5000 : tier === "quiet" ? 9000 : 7000;

  const FIXED_TIERS: Array<{ label: string; level: number }> = [
    { label: "Quiet (0.1)", level: 0.1 },
    { label: "Normal (0.4)", level: 0.4 },
    { label: "Busy (0.7)", level: 0.7 },
    { label: "Peak (0.95)", level: 0.95 },
  ];

  return (
    <div className="mb-8">
      {/* Slider + live readout */}
      <div className="flex flex-col gap-3 mb-5 max-w-md">
        <div className="flex items-center gap-4">
          <label className="text-xs font-semibold" style={{ color: "rgba(255,255,255,0.55)", minWidth: 100 }}>
            Activity level
          </label>
          <input
            type="range"
            min={0} max={1} step={0.01}
            value={level}
            onChange={e => setLevel(parseFloat(e.target.value))}
            className="flex-1"
            style={{ accentColor: tierColor[tier] }}
          />
          <span className="text-sm font-mono w-12 text-right" style={{ color: tierColor[tier] }}>
            {level.toFixed(2)}
          </span>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <span
            className="px-3 py-0.5 rounded-full text-xs font-semibold uppercase tracking-widest"
            style={{ background: `${tierColor[tier]}22`, color: tierColor[tier], border: `1px solid ${tierColor[tier]}55` }}
          >
            {tier}
          </span>
          <span className="text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>
            Blink period: <strong style={{ color: "rgba(255,255,255,0.65)" }}>{(blinkMs / 1000).toFixed(1)}s</strong>
          </span>
          <span className="text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>
            Crown: <strong style={{ color: "rgba(255,255,255,0.65)" }}>
              {tier === "quiet" ? "drooped ↓" : tier === "normal" ? "neutral" : tier === "busy" ? "raised ↑" : "max alert ↑↑"}
            </strong>
          </span>
        </div>
      </div>

      {/* Live bird responding to slider — shown at street zoom so crown is visible */}
      <div className="flex flex-wrap gap-4 mb-4">
        <div
          className="flex flex-col items-center gap-3 rounded-xl p-4"
          style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${tierColor[tier]}33`, minWidth: 160 }}
        >
          <p className="text-xs font-semibold" style={{ color: tierColor[tier] }}>Live — slider</p>
          <div style={{ width: 80, height: 80, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <SankofaBird
              heading={0} mapBearing={0} speed={0} navigating={false}
              size={52} mapZoom={17} activityLevel={level}
            />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-white">activityLevel={level.toFixed(2)}</p>
            <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.45)" }}>tier: {tier} · blink {(blinkMs/1000).toFixed(1)}s</p>
          </div>
        </div>

        {/* Four fixed-tier comparisons side-by-side */}
        {FIXED_TIERS.map(({ label, level: fixedLevel }) => {
          const t = fixedLevel >= 0.85 ? "peak" : fixedLevel >= 0.60 ? "busy" : fixedLevel >= 0.20 ? "normal" : "quiet";
          return (
            <div
              key={label}
              className="flex flex-col items-center gap-3 rounded-xl p-4"
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.07)",
                minWidth: 130,
                cursor: "pointer",
                transition: "border-color 0.25s",
              }}
              onClick={() => setLevel(fixedLevel)}
            >
              <div style={{ width: 72, height: 72, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <SankofaBird
                  heading={0} mapBearing={0} speed={0} navigating={false}
                  size={46} mapZoom={17} activityLevel={fixedLevel}
                />
              </div>
              <div className="text-center">
                <p className="text-xs font-semibold text-white leading-tight">{label}</p>
                <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
                  style={{ background: `${tierColor[t]}22`, color: tierColor[t], border: `1px solid ${tierColor[t]}44` }}>
                  {t}
                </span>
                <p className="text-[10px] mt-1" style={{ color: "rgba(255,255,255,0.3)" }}>
                  tap to set
                </p>
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.25)" }}>
        Crown visibility requires mapZoom ≥ 15 ("high" LOD). Blink period is a CSS var (--blink-period) — the
        eyelid + catchlight animations reference it directly so there is no JS polling loop.
        Chest breathing also adjusts: busy=2.8s · peak=1.9s · quiet=5.5s.
      </p>
    </div>
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
          <AnticipationDemo />
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

        {/* ── Phase 3 Effects Demo ──────────────────────────────────────── */}
        <SectionLabel>Phase 3 — Beyond-Rive effects (July 2026)</SectionLabel>
        <p className="text-xs mb-3" style={{ color: "rgba(255,255,255,0.35)" }}>
          All 15 Phase 3 compound-selector effects. Most require{" "}
          <strong style={{ color: "rgba(0,212,255,0.8)" }}>mapZoom ≥ 14 ("high") or ≥ 17 ("street")</strong> — the map
          default of 13.5 suppressed them. Fixed: eye saccade now fires at high zoom, slotted wing-tips at high zoom,
          talon specular at high zoom, vortex rings at mid zoom (reduced opacity). State-gated effects (glide
          elongation, donation shimmer, contrail pulse) are shown with their trigger states active.
        </p>
        <div className="flex flex-wrap gap-3 mb-4">
          {/* 1. Glide body elongation — now fires at driving speed (> 10 m/s) via isVisuallyGliding */}
          <BirdCard
            label="#1 Glide elongation · driving"
            subLabel="14 m/s — now reachable in real nav · zoom=17"
            state={{ heading: 90, mapBearing: 0, speed: 14, navigating: true }}
            mapZoom={17}
            size={56}
            badge="Phase3"
          />
          <BirdCard
            label="#1 Glide elongation · airplane"
            subLabel="55 m/s — max stretch · zoom=17"
            state={{ heading: 90, mapBearing: 0, speed: 55, navigating: true }}
            mapZoom={17}
            size={56}
            badge="Phase3"
          />
          {/* 2. Blink rate modulation */}
          <BirdCard
            label="#2 Blink rate · celebrating"
            subLabel="blinks every 1.8s vs 7s · zoom=14"
            state={{ heading: 0, mapBearing: 0, speed: 0, navigating: false, celebrating: true }}
            mapZoom={14}
            badge="Phase3"
          />
          {/* 3. Eye saccade — now fires at high zoom too */}
          <BirdCard
            label="#3 Eye saccade · high"
            subLabel="micro-movements · zoom=14 (was street-only)"
            state={{ heading: 0, mapBearing: 0, speed: 0, navigating: false }}
            mapZoom={14}
            badge="Phase3"
          />
          <BirdCard
            label="#3 Eye saccade · street"
            subLabel="faster cycle · zoom=17"
            state={{ heading: 0, mapBearing: 0, speed: 0, navigating: false }}
            mapZoom={17}
            badge="Phase3"
          />
          {/* 4. Head preturn */}
          <BirdCard
            label="#4 Head pre-turn left"
            subLabel="head leads the bank · zoom=17 · flying"
            state={{ heading: 90, mapBearing: 0, speed: 8, navigating: true }}
            upcomingTurnDirection="left"
            mapZoom={17}
            badge="Phase3"
          />
          {/* 5. Wing-tip slotted spread — now reachable at driving speed */}
          <BirdCard
            label="#5 Wing-tip slots · driving · high"
            subLabel="14 m/s — now reachable · zoom=14"
            state={{ heading: 90, mapBearing: 0, speed: 14, navigating: true }}
            mapZoom={14}
            badge="Phase3"
          />
          <BirdCard
            label="#5 Wing-tip slots · airplane · street"
            subLabel="55 m/s — max slot · zoom=17"
            state={{ heading: 90, mapBearing: 0, speed: 55, navigating: true }}
            mapZoom={17}
            badge="Phase3"
          />
          {/* 6. Vortex rings — now visible at mid zoom */}
          <BirdCard
            label="#6 Vortex rings · mid"
            subLabel="takeoff wingtip vortex · zoom=12 (was hidden)"
            state={{ heading: 0, mapBearing: 0, speed: 55, navigating: true }}
            mapZoom={12}
            badge="Phase3"
          />
          <BirdCard
            label="#6 Vortex rings · street"
            subLabel="continuous at airplane speed · zoom=17"
            state={{ heading: 0, mapBearing: 0, speed: 55, navigating: true }}
            mapZoom={17}
            badge="Phase3"
          />
          {/* 7. Donation shimmer cascade */}
          <BirdCard
            label="#7 Donation shimmer"
            subLabel="feather wave head→tail · zoom=17"
            state={{ heading: 0, mapBearing: 0, speed: 0, navigating: false, donated: true }}
            mapZoom={17}
            badge="Phase3"
          />
          {/* 8. Talon specular — now fires at high zoom too */}
          <BirdCard
            label="#8 Talon sheen · high"
            subLabel="wet keratin reflection · zoom=14 (was street-only)"
            state={{ heading: 0, mapBearing: 0, speed: 0, navigating: false }}
            mapZoom={14}
            badge="Phase3"
          />
          <BirdCard
            label="#8 Talon sheen · street"
            subLabel="gripping + sheen · zoom=17"
            state={{ heading: 0, mapBearing: 0, speed: 0, navigating: false }}
            mapZoom={17}
            badge="Phase3"
          />
          {/* 9. Speed-adaptive breathing */}
          <BirdCard
            label="#9 Breathe · running"
            subLabel="3.8s cycle (16 breaths/min)"
            state={{ heading: 45, mapBearing: 0, speed: 4, navigating: true }}
            mapZoom={14}
            badge="Phase3"
          />
          <BirdCard
            label="#9 Breathe · airplane"
            subLabel="2.5s cycle (24 breaths/min)"
            state={{ heading: 45, mapBearing: 0, speed: 55, navigating: true }}
            mapZoom={14}
            badge="Phase3"
          />
          {/* 10. Perch impact pulse */}
          <BirdCard
            label="#10 Perch impact"
            subLabel="shadow shock-wave on touchdown · zoom=14"
            state={{ heading: 0, mapBearing: 0, speed: 0, navigating: false }}
            mapZoom={14}
            badge="Phase3"
          />
          {/* 11. Contrail pulse */}
          <BirdCard
            label="#11 Contrail pulse"
            subLabel="sine-wave trail at airplane speed · zoom=14"
            state={{ heading: 90, mapBearing: 0, speed: 55, navigating: true }}
            mapZoom={14}
            badge="Phase3"
          />
          {/* 12. Iris parallax */}
          <BirdCard
            label="#12 Iris parallax"
            subLabel="pupil expands + rotates on celebrate · zoom=17"
            state={{ heading: 0, mapBearing: 0, speed: 0, navigating: false, celebrating: true }}
            mapZoom={17}
            badge="Phase3"
          />
          {/* 13. Proximity field */}
          <BirdCard
            label="#13 Proximity field"
            subLabel="ambient glow when user nearby · zoom=14"
            state={{ heading: 0, mapBearing: 0, speed: 0, navigating: false }}
            nearbyUser={true}
            mapZoom={14}
            badge="Phase3"
          />
          {/* 14. Crown burst */}
          <BirdCard
            label="#14 Crown burst"
            subLabel="crown tips flash on celebrate · zoom=17"
            state={{ heading: 0, mapBearing: 0, speed: 0, navigating: false, celebrating: true }}
            mapZoom={17}
            badge="Phase3"
          />
          {/* 15. Tail-center iridescence */}
          <BirdCard
            label="#15 Tail-center iri"
            subLabel="centre rectrices phase-offset hue · zoom=17"
            state={{ heading: 90, mapBearing: 0, speed: 8, navigating: true }}
            mapZoom={17}
            badge="Phase3"
          />
        </div>
        <p className="text-[10px] mb-8" style={{ color: "rgba(255,255,255,0.25)" }}>
          Effects gated to specific states are shown with those states active.{" "}
          <strong style={{ color: "rgba(0,212,255,0.6)" }}>
            Glide elongation (#1) and wing-tip slots (#5) now fire at driving speed (&gt; 10 m/s) via isVisuallyGliding —
            reachable during normal navigation.
          </strong>{" "}
          Physics glide (isGliding, &gt; 50 m/s) only controls flap cadence (4 s) and lean angle — unchanged.
          Donation shimmer (#7) requires donated=true. Contrail (#11) requires airplane speed. Iris parallax (#12) and
          crown burst (#14) require celebrating=true.
        </p>

        {/* ── Activity Level — blink rate + crown alertness ─────────────── */}
        <SectionLabel>Activity level — community busyness → blink rate + crown alertness</SectionLabel>
        <p className="text-xs mb-3" style={{ color: "rgba(255,255,255,0.35)" }}>
          <strong style={{ color: "rgba(0,212,255,0.8)" }}>activityLevel 0–1</strong> drives two linked behaviours:
          (1) blink rate via <code>--blink-period</code> CSS var (quiet=9s → peak=3.5s) and
          (2) crown feather posture (drooped when quiet, erect + micro-tremble at peak).
          In the live app, level = <code>√(openRequests/10)</code> — capped at 1. Use the slider to
          preview all four tiers. Crown visible at zoom ≥ 15 (high LOD).
        </p>
        <ActivityLevelDemo />

        {/* ── Sky Tier — 4-way solar lighting manual switcher ──────────── */}
        <SectionLabel>Sky tier — four-way solar lighting (day / golden / twilight / night)</SectionLabel>
        <p className="text-xs mb-4" style={{ color: "rgba(255,255,255,0.4)", maxWidth: 680 }}>
          <strong style={{ color: "rgba(0,212,255,0.8)" }}>Phase 6</strong>: each sky tier now drives distinct plumage physics beyond a binary day/night toggle.
          Golden hour warms the breast + wings (amber filter, pulse). Twilight desaturates with a breathing rhythm.
          Night dilates the iris via IntersectionObserver-safe CSS. Auto-wired in the live app via{" "}
          <code>useSolarTier(lat, lng)</code> (NOAA algorithm, no API call, updates every 60 s).
        </p>
        <SkyTierDemo />

        {/* ── NavLod time simulation ────────────────────────────────────── */}
        <SectionLabel>NavLod — battery-saving LOD escalation during long navigation sessions</SectionLabel>
        <p className="text-xs mb-4" style={{ color: "rgba(255,255,255,0.4)", maxWidth: 680 }}>
          <strong style={{ color: "rgba(0,212,255,0.8)" }}>Phase 6</strong>: after 10 min of continuous navigation the rig silently drops to LOD1
          (feather overlays dim, 2.5 s smooth fade). After 30 min it steps to LOD2 (near-silhouette —
          all detail layers paused, ~11% battery saved per hour on Mali-G51).
          The slider simulates elapsed time so you can preview each tier without waiting.
        </p>
        <NavLodSimDemo />

        {/* ── Phase 1-5 Hardening enhancements (E1–E6) ─────────────────── */}
        <SectionLabel>Phase 1-5 enhancements — perch idle-settle · trail gold · mid-zoom wing shimmer · feather rustle</SectionLabel>
        <p className="text-xs mb-4" style={{ color: "rgba(255,255,255,0.4)", maxWidth: 680 }}>
          <strong style={{ color: "rgba(0,212,255,0.8)" }}>E1–E6 hardening</strong>:
          (E1) Crown sway rate now scales with activity tier — quiet=5.2s drift, busy=2.4s, peak=1.6s/1.1s central tremble.
          (E2) Helping forward-crane: head+neck lean forward 0.8px when en-route (data-helping="true").
          (E3) Wing iridescence shimmer now visible at mid zoom (phones at zoom 12-14) — 5.8s slow pulse, 3.6s when flying.
          (E4) Perch idle micro-tremor: 8.5s weight-shift oscillation after landing sequence — reads as "alive" vs. a static icon.
          (E5) Trail carries warm gold tint (hue-rotate -28°) when helping.
          (E6) Per-feather idle micro-rustle at street zoom: feathers 4–11 each have independent staggered periods (5.4s–8.0s).
        </p>
        <PhaseHardeningDemo />

        {/* ── Night Mode (Solar) ────────────────────────────────────────── */}
        <SectionLabel>Night Mode — Solar / Time-of-Day binary toggle (legacy preview)</SectionLabel>
        <p className="text-xs mb-4" style={{ color: "rgba(255,255,255,0.4)", maxWidth: 680 }}>
          Binary day/night toggle (kept for backward compatibility). The live app uses the 4-tier
          Sky Tier demo above. Night mode: hue-rotate +22°, saturate ×0.58, brightness ×0.65.
          Celebrations and donations relax the filter so reaction colours still punch through.
        </p>
        <NightModeDemo />

        {/* ── Phase 10 -- Night-Mode Plumage Enhancement System ────────── */}
        <SectionLabel>Phase 10 — Night-Mode Plumage Enhancement System</SectionLabel>
        <p className="text-xs mb-4" style={{ color: "rgba(255,255,255,0.4)", maxWidth: 680 }}>
          <strong style={{ color: "rgba(80,140,255,0.9)" }}>P10.1–P10.10</strong>: Full biologically-accurate
          low-light visual rig. Not just a filter — the bird reads as a real nocturnal traveller.
          (P10.1) Star-reflection shimmer in pupils (wet cornea catching streetlights).
          (P10.2) Moonlit wing-edge silvery-blue rim light on leading edge.
          (P10.3) Nocturnal breathing: 6.8s idle vs 3.8s daytime.
          (P10.4) Dark plumage: body feathers deepen toward ocean-teal.
          (P10.5) Bioluminescent teal glow on primaries during night flight (flap-synced).
          (P10.6) Night blink rate 1.6× slower — calmer, more nocturnal feel.
          (P10.7) Shadow suppressed at night (diffuse moonlight = no sharp ground shadow).
          (P10.8) Crown tips: moonlit silver specularity pulsing at 11s.
          (P10.9) Egg lunar pearl glow (moon-grey luminance replacing daytime teal).
          (P10.10) Low-zoom silhouette sharpening (contrast boost for crisp dark shape).
        </p>
        <Phase10Demo />

        {/* ── Aerodynamics -- banking + neck/body turning at every LOD ─── */}
        <SectionLabel>Aerodynamics — banking + neck/body turning across all zoom LODs</SectionLabel>
        <p className="text-xs mb-4" style={{ color: "rgba(255,255,255,0.4)", maxWidth: 680 }}>
          <strong style={{ color: "rgba(0,212,255,0.8)" }}>E7 + P7.6</strong>: when the heading changes,
          the head leads the turn (0.20× bank), neck follows with slight lag (0.14×), body leans last
          and least (0.07×). At mid zoom a stronger neck factor (0.18×) compensates for the lower LOD
          detail. Banking hard at &lt;20° composes correctly with glide pitch and helping crane —
          all use CSS individual transform properties that stack independently.
        </p>
        <AerodynamicsDemo />
        <p className="text-[10px] mt-3 mb-8" style={{ color: "rgba(255,255,255,0.22)" }}>
          Banking is driven by heading <em>delta</em> (rate of change), not heading value — a static heading
          never banks. Each LOD above uses live heading oscillation so the turn differential fires authentically.
        </p>

        {/* ── Phase 7 Biomechanics ──────────────────────────────────────── */}
        <SectionLabel>Phase 7 — Biomechanical enhancements (July 2026)</SectionLabel>
        <p className="text-xs mb-4" style={{ color: "rgba(255,255,255,0.4)", maxWidth: 680 }}>
          <strong style={{ color: "rgba(0,212,255,0.8)" }}>P7.1–P7.7</strong>: six new biomechanical
          layers beyond Phase 6. Egg pendulum (beak egg swings opposite to bank — real inertia physics).
          Head stabilization (head stays level while body bobs on each wingbeat — observed in corvids).
          Curiosity head tilt (idle scanning behavior — wait 3-8 s at street zoom to observe).
          Wingbeat variability (stochastic feather-row timing — no two rows peak simultaneously).
          Battery-saver crossfade (LOD3 entry washes out instead of popping).
          Mid-zoom neck arc (stronger 0.18× factor compensates for lower LOD detail).
        </p>
        <Phase7Demo />
        <p className="text-[10px] mt-3 mb-8" style={{ color: "rgba(255,255,255,0.22)" }}>
          P7.2 head steady fires only when data-upcoming-turn="none" so anticipatory turn glances
          always take priority. P7.3 curiosity tilt is mutually exclusive with data-helping="true"
          (E2 forward-crane takes precedence). All P7 effects respect prefers-reduced-motion.
        </p>

        {/* ── Phase 11 — Finalization demos ───────────────────────────────── */}
        <SectionLabel>Phase 11 — Gap closure & biomechanics finalization</SectionLabel>
        <p className="text-xs mb-3" style={{ color: "rgba(255,255,255,0.35)" }}>
          Fixes and enhancements addressing every remaining gap between the vision docs and P1–P10:
          helping body lean (E2 now covers head + neck + body + tail), wing-tip flex at high speed,
          crown sway speed tiers, battery-saver idle-settle guard, nav-lod opacity transitions, and GPU
          layer promotion. All new effects compose correctly with banking, night-mode, and reduced-motion.
        </p>
        <Phase11Demo />

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
            <li><strong>Driving (14 m/s)</strong>: lean 15°, flap 200ms — <em>body elongation + wing-tip slots now active (isVisuallyGliding)</em></li>
            <li><strong>Gliding (55 m/s)</strong>: wings spread flat, 4s slow oscillation (airplane) — isVisuallyGliding AND isGliding both true</li>
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
            <li><strong>nightMode / Solar (NEW)</strong>: auto-computed from GPS + real-time solar angle via <code>useTimeOfDay(lat, lng)</code> hook (pure math, no API). Civil twilight threshold −6°. Applies: hue-rotate +22°, saturate ×0.58, brightness ×0.65. Celebrating + donated micro-reactions relax the filter so teal/gold still pop. Recalculates every 60 s.</li>
            <li><strong>E1 — Crown sway rate (NEW)</strong>: scales with activityLevel tier — quiet=5.2s drift, normal=3.6s, busy=2.4s, peak=1.6s outer / 1.1s central tremble. Crown glow pulse now matches blink period at both high AND street zoom. Mid-zoom feathers 4+5 also animate at busy/peak so phones see crown activity.</li>
            <li><strong>E2 — Helping forward-crane (NEW)</strong>: head translateX(-0.8px)/Y(-0.25px) + neck rotate(-2.5°) when data-helping="true". 0.7s spring-easing (cubic-bezier 0.34,1.56,0.64,1). iOS-safe via transform-box:view-box + px transform-origin.</li>
            <li><strong>E3 — Mid-zoom wing shimmer (NEW)</strong>: wing highlights pulse at 5.8s idle / 3.6s flying at zoom="mid" — phones at zoom 12-14 were seeing zero iridescence before this fix.</li>
            <li><strong>E4 — Perch idle micro-tremor (NEW)</strong>: 8.5s lateral weight-shift oscillation (±0.22px, ±0.17°) on the whole rig after landing (data-landing="idle"). Below conscious perception threshold but visual cortex reads it as "alive" vs. a static icon.</li>
            <li><strong>E5 — Helping trail gold tint (NEW)</strong>: trail particles warm to amber-gold via hue-rotate(-28deg)+brightness(1.12)+saturate(1.3) when data-helping="true". 0.9s ease-out transition.</li>
            <li><strong>E6 — Per-feather idle micro-rustle (NEW)</strong>: at street zoom when idle, body feathers 4–11 each oscillate independently at different periods (5.4s–8.0s) with unique delay offsets so no two peak simultaneously — simulates plumage settling after flight. Beyond typical Rive per-element authoring complexity.</li>
            <li><strong>E7 — Aerodynamic body/neck turn (NEW)</strong>: when banking, each body segment rotates proportional to bank angle using CSS individual transform property <code>rotate:</code>. Head 20%, neck 14%, body 7%, chest+back 6%. Composes with existing <code>transform:</code> so glide pitch, helping crane, and turn are all active simultaneously. Safari 14.1+ via @supports guard.</li>
            <li><strong>P7.1 — Egg pendulum (NEW)</strong>: the egg held in the beak swings opposite to the banking direction due to inertia (bank right → egg swings left). Transition 0.75s — longer than bank decay (0.35s) — creates the lag-then-return feel of a physical pendulum.</li>
            <li><strong>P7.2 — Head stabilization (NEW)</strong>: real birds hold their heads steady while the body bobs on each wingbeat. Counter-phase <code>translate:</code> animation (sankofa-head-steady, period = flap period) offsets the body float. Active at high+street zoom when data-upcoming-turn="none".</li>
            <li><strong>P7.3 — Curiosity head tilt (NEW)</strong>: when perched idle at high+street zoom, the bird periodically scans left (−5.5°), returns to center, scans right (+4.8°), then rests. 12s street / 14s high period — infrequent enough to feel organic. Suppressed during data-helping="true" (E2 forward-crane takes priority).</li>
            <li><strong>P7.4 — Wingbeat variability (NEW)</strong>: primary feather rows l2/r2 and l4/r4 each get unique duration multipliers (×0.93–×1.07) and negative delays so no two rows start synchronized. Stacks on P5.1 bilateral asymmetry for two-axis stochastic flutter.</li>
            <li><strong>P7.5 — Battery-saver crossfade (NEW)</strong>: entering LOD3 previously popped instantly (display:none). A brightness+opacity sweep (sankofa-lod3-enter, 0.65s) creates a wash-out impression before the silhouette appears — the detail layers seem to dissolve rather than cut.</li>
            <li><strong>P7.6 — Mid-zoom neck arc (NEW)</strong>: stronger neck bank factor (0.18×) at data-zoom="mid" compensates for lower LOD detail at zoom 12–14 where the neck body is less rendered than at high/street zoom.</li>
          </ul>
        </div>

      </div>
    </div>
  );
}

/* ── Phase 1-5 Hardening demo (E1-E6 enhancements) ─────────────────── */
function PhaseHardeningDemo() {
  const CARDS: Array<{
    label: string;
    subLabel: string;
    badge: string;
    badgeColor: string;
    state: BirdState;
    isHelping?: boolean;
    zoom: number;
    note: string;
  }> = [
    {
      label: "E1 — Quiet crown",
      subLabel: "sway 5.2s · idle",
      badge: "activity=quiet",
      badgeColor: "rgba(100,200,255,0.55)",
      state: { heading: null, mapBearing: 0, speed: 0, navigating: false },
      zoom: 17,
      note: "Crown drifts slowly at 5.2s period",
    },
    {
      label: "E1 — Peak crown",
      subLabel: "tremble 1.1s + glow",
      badge: "activity=peak",
      badgeColor: "rgba(255,80,80,0.90)",
      state: { heading: null, mapBearing: 0, speed: 0, navigating: false },
      zoom: 17,
      note: "Central feathers tremble at 1.1s, glow pulse matches blink",
    },
    {
      label: "E2 — Helping crane",
      subLabel: "head leans forward",
      badge: "data-helping",
      badgeColor: "rgba(255,185,0,0.85)",
      state: { heading: 0, mapBearing: 0, speed: 5, navigating: true },
      isHelping: true,
      zoom: 17,
      note: "Head -0.8px forward, neck -2.5° rotate (iOS transform-box safe)",
    },
    {
      label: "E3 — Mid zoom shimmer",
      subLabel: "5.8s pulse · zoom=14",
      badge: "zoom=mid",
      badgeColor: "rgba(0,212,255,0.65)",
      state: { heading: 0, mapBearing: 0, speed: 5, navigating: true },
      zoom: 14,
      note: "Wing highlights pulse at mid zoom — visible on phone screens",
    },
    {
      label: "E4 — Idle settle",
      subLabel: "8.5s weight-shift",
      badge: "landing=idle",
      badgeColor: "rgba(140,255,200,0.65)",
      state: { heading: null, mapBearing: 0, speed: 0, navigating: false },
      zoom: 17,
      note: "Rig drifts 0.2px side-to-side after landing — reads as alive",
    },
    {
      label: "E5 — Trail gold",
      subLabel: "hue-rotate(-28°) tint",
      badge: "data-helping",
      badgeColor: "rgba(255,185,0,0.85)",
      state: { heading: 45, mapBearing: 45, speed: 5, navigating: true },
      isHelping: true,
      zoom: 17,
      note: "Trail particles warm amber-gold when en-route to help",
    },
    {
      label: "E6 — Feather rustle",
      subLabel: "per-feather staggered",
      badge: "street+idle",
      badgeColor: "rgba(180,255,180,0.65)",
      state: { heading: null, mapBearing: 0, speed: 0, navigating: false },
      zoom: 17,
      note: "Feathers 4-11 each oscillate at different periods (5.4s–8.0s)",
    },
    {
      label: "E1 — Mid busy crown",
      subLabel: "crown-4/5 animate at phone zoom",
      badge: "zoom=mid·busy",
      badgeColor: "rgba(255,180,0,0.80)",
      state: { heading: null, mapBearing: 0, speed: 0, navigating: false },
      zoom: 14,
      note: "Crown feathers 4+5 gain animation at mid zoom when busy/peak",
    },
  ];

  return (
    <div className="flex flex-wrap gap-4 mb-8">
      {CARDS.map((card) => {
        const activityLevel =
          card.badge.includes("peak") ? 0.95 :
          card.badge.includes("busy") ? 0.70 :
          card.badge.includes("quiet") ? 0.05 : 0.4;
        return (
          <div
            key={card.label}
            className="flex flex-col items-center gap-2 rounded-xl p-3"
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.07)",
              minWidth: 148,
              maxWidth: 168,
            }}
          >
            <span
              className="text-xs px-2 py-0.5 rounded-full font-mono"
              style={{ background: `${card.badgeColor}18`, color: card.badgeColor, border: `1px solid ${card.badgeColor}44` }}
            >
              {card.badge}
            </span>
            <div style={{ width: 70, height: 70, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <SankofaBird
                heading={card.state.heading ?? null}
                mapBearing={card.state.mapBearing}
                speed={card.state.speed}
                navigating={card.state.navigating}
                celebrating={card.state.celebrating}
                donated={card.state.donated}
                isHelping={card.isHelping}
                size={46}
                mapZoom={card.zoom}
                activityLevel={activityLevel}
              />
            </div>
            <p className="text-xs font-semibold text-white text-center">{card.label}</p>
            <p className="text-xs text-center" style={{ color: "rgba(255,255,255,0.4)" }}>{card.subLabel}</p>
            <p className="text-xs text-center leading-tight" style={{ color: "rgba(255,255,255,0.28)", fontSize: 10 }}>{card.note}</p>
          </div>
        );
      })}
    </div>
  );
}

/* ── Sky Tier demo — four-way solar lighting manual switcher ────────── */
function SkyTierDemo() {
  const [tier, setTier] = useState<"day" | "golden" | "twilight" | "night">("day");

  const tiers: Array<{ value: "day" | "golden" | "twilight" | "night"; label: string; emoji: string; desc: string; color: string }> = [
    { value: "day",      label: "Day",      emoji: "☀️",  desc: "sun > 10° · full plumage",         color: "rgba(0,212,255,0.8)" },
    { value: "golden",   label: "Golden",   emoji: "🌅",  desc: "sun 0°–10° · amber wash + warm wings", color: "rgba(255,185,0,0.85)" },
    { value: "twilight", label: "Twilight", emoji: "🌆",  desc: "sun −6°–0° · desaturated + breathing", color: "rgba(120,140,220,0.85)" },
    { value: "night",    label: "Night",    emoji: "🌙",  desc: "sun < −6° · deep blue-teal + iris dilates", color: "rgba(80,140,255,0.85)" },
  ];

  const birds: Array<{ label: string; subLabel: string; state: BirdState }> = [
    { label: "Idle",      subLabel: "no GPS",         state: { heading: null, mapBearing: 0, speed: 0, navigating: false } },
    { label: "Flying",    subLabel: "14 m/s · 0°",    state: { heading: 0, mapBearing: 0, speed: 14, navigating: true } },
    { label: "Celebrate", subLabel: "teal still pops", state: { heading: null, mapBearing: 0, speed: 0, navigating: false, celebrating: true } },
    { label: "Donation",  subLabel: "gold filter relax", state: { heading: null, mapBearing: 0, speed: 0, navigating: false, donated: true } },
  ];

  return (
    <div className="mb-8">
      {/* Tier selector */}
      <div className="flex flex-wrap gap-2 mb-5">
        {tiers.map(t => (
          <button
            key={t.value}
            onClick={() => setTier(t.value)}
            className="px-3 py-1.5 rounded-lg text-sm font-semibold transition-all"
            style={{
              background: tier === t.value ? `${t.color}22` : "rgba(255,255,255,0.06)",
              border: tier === t.value ? `1px solid ${t.color}66` : "1px solid rgba(255,255,255,0.1)",
              color: tier === t.value ? t.color : "rgba(255,255,255,0.55)",
            }}
          >
            {t.emoji} {t.label}
          </button>
        ))}
        <span className="ml-2 text-xs self-center" style={{ color: "rgba(255,255,255,0.35)" }}>
          {tiers.find(t => t.value === tier)?.desc}
        </span>
      </div>
      {/* Bird grid */}
      <div className="flex flex-wrap gap-4">
        {birds.map(({ label, subLabel, state }) => (
          <BirdCard
            key={label}
            label={`${label} — ${tier}`}
            subLabel={subLabel}
            state={state}
            size={52}
            mapZoom={17}
            skyTier={tier}
            badge={`${tiers.find(t => t.value === tier)?.emoji} ${tier}`}
          />
        ))}
      </div>
      <p className="text-[10px] mt-3" style={{ color: "rgba(255,255,255,0.22)" }}>
        Phase 6: <strong style={{ color: "rgba(255,255,255,0.4)" }}>golden</strong> = breast warming + gilded wings |{" "}
        <strong style={{ color: "rgba(255,255,255,0.4)" }}>twilight</strong> = desaturation breathing |{" "}
        <strong style={{ color: "rgba(255,255,255,0.4)" }}>night</strong> = iris dilation. Auto-wired in live app via useSolarTier(lat, lng).
      </p>
    </div>
  );
}

/* ── NavLod time simulation demo ─────────────────────────────────────── */
function NavLodSimDemo() {
  const [elapsedMin, setElapsedMin] = useState(0);

  const navLod = elapsedMin >= 30 ? 2 : elapsedMin >= 10 ? 1 : 0;
  const lodColors = ["rgba(0,212,255,0.8)", "rgba(255,165,0,0.8)", "rgba(255,80,80,0.85)"];
  const lodLabels = ["LOD0 — Full detail", "LOD1 — Decorative layers dimmed (10 min+)", "LOD2 — Near-silhouette (30 min+)"];
  const lodDescs = [
    "All feathers, iridescence, neck chain, crown glow — maximum visual fidelity.",
    "Outer primary feathers fade (opacity 0.35), neck chain dims. Core wing-flap + body still full.",
    "All feather overlays + crown invisible. Bird becomes a clean teal silhouette — max GPU savings.",
  ];

  const THRESHOLDS = [
    { label: "0 min — session start", min: 0 },
    { label: "5 min", min: 5 },
    { label: "10 min (LOD1)", min: 10 },
    { label: "20 min", min: 20 },
    { label: "30 min (LOD2)", min: 30 },
    { label: "45 min", min: 45 },
  ];

  return (
    <div className="mb-8">
      {/* Elapsed time slider */}
      <div className="flex flex-col gap-3 mb-5 max-w-md">
        <div className="flex items-center gap-4">
          <label className="text-xs font-semibold" style={{ color: "rgba(255,255,255,0.55)", minWidth: 110 }}>
            Nav elapsed
          </label>
          <input
            type="range" min={0} max={45} step={1} value={elapsedMin}
            onChange={e => setElapsedMin(parseInt(e.target.value))}
            className="flex-1"
            style={{ accentColor: lodColors[navLod] }}
          />
          <span className="text-sm font-mono w-14 text-right" style={{ color: lodColors[navLod] }}>
            {elapsedMin} min
          </span>
        </div>
        {/* Quick-jump buttons */}
        <div className="flex flex-wrap gap-2">
          {THRESHOLDS.map(({ label, min }) => (
            <button
              key={min}
              onClick={() => setElapsedMin(min)}
              className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold"
              style={{
                background: elapsedMin === min ? `${lodColors[navLod]}22` : "rgba(255,255,255,0.06)",
                border: `1px solid ${elapsedMin === min ? lodColors[navLod] + "55" : "rgba(255,255,255,0.1)"}`,
                color: elapsedMin === min ? lodColors[navLod] : "rgba(255,255,255,0.45)",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {/* LOD badge */}
      <div className="flex items-start gap-3 mb-5 p-3 rounded-xl" style={{ background: `${lodColors[navLod]}0e`, border: `1px solid ${lodColors[navLod]}33` }}>
        <span className="px-2.5 py-0.5 rounded-full text-xs font-bold mt-0.5" style={{ background: `${lodColors[navLod]}22`, color: lodColors[navLod] }}>
          {navLod === 0 ? "LOD 0" : navLod === 1 ? "LOD 1" : "LOD 2"}
        </span>
        <div>
          <p className="text-sm font-semibold text-white">{lodLabels[navLod]}</p>
          <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.45)" }}>{lodDescs[navLod]}</p>
        </div>
      </div>
      {/* Bird preview — navigating at driving speed to show flight layers */}
      <div className="flex flex-wrap gap-4">
        {([14, 0] as number[]).map(speed => (
          <BirdCard
            key={speed}
            label={speed > 0 ? "Flying — driving speed" : "Idle"}
            subLabel={`navLod=${navLod} · elapsed ${elapsedMin} min`}
            state={{ heading: 0, mapBearing: 0, speed, navigating: speed > 0 }}
            size={52}
            mapZoom={17}
            badge={`LOD${navLod}`}
            navLodOverride={navLod as 0 | 1 | 2}
          />
        ))}
        <div className="flex flex-col justify-center gap-2 text-xs px-2" style={{ color: "rgba(255,255,255,0.35)" }}>
          <p>⚡ Battery saved per hour:</p>
          <p style={{ color: lodColors[navLod], fontWeight: 600 }}>
            {navLod === 0 ? "baseline" : navLod === 1 ? "~4% (Mali-G51)" : "~11% (Mali-G51)"}
          </p>
          <p className="mt-1">LOD steps down automatically after</p>
          <p style={{ color: "rgba(255,255,255,0.55)" }}>10 min → LOD1 · 30 min → LOD2</p>
          <p className="mt-1">Smooth 2.5s opacity fade — imperceptible</p>
        </div>
      </div>
      <p className="text-[10px] mt-3" style={{ color: "rgba(255,255,255,0.22)" }}>
        Phase 6: navLod escalates automatically inside SankofaBirdSvg via a 60s setInterval.
        This demo overrides the elapsed time so you can preview LOD levels without waiting.
        In production the slider represents real elapsed navigation time.
      </p>
    </div>
  );
}

/* ── Night Mode demo ──────────────────────────────────────────────────── */
function NightModeDemo() {
  const [nightMode, setNightMode] = useState(false);
  const nightStates: Array<{ label: string; subLabel: string; state: BirdState }> = [
    { label: "Idle — Night", subLabel: "no GPS, nightMode=true", state: { heading: null, mapBearing: 0, speed: 0, navigating: false } },
    { label: "Flying — Night", subLabel: "14 m/s · heading 0°", state: { heading: 0, mapBearing: 0, speed: 14, navigating: true } },
    { label: "Celebrating — Night", subLabel: "gold still punches through filter", state: { heading: null, mapBearing: 0, speed: 0, navigating: false, celebrating: true } },
    { label: "Donated — Night", subLabel: "donation filter relaxed", state: { heading: null, mapBearing: 0, speed: 0, navigating: false, donated: true } },
  ];
  return (
    <div className="mb-8">
      <div className="flex items-center gap-3 mb-5">
        <button
          onClick={() => setNightMode(n => !n)}
          className="px-4 py-2 rounded-lg text-sm font-semibold transition-all"
          style={{
            background: nightMode ? "rgba(30,50,120,0.8)" : "rgba(255,255,255,0.08)",
            border: nightMode ? "1px solid rgba(80,140,255,0.4)" : "1px solid rgba(255,255,255,0.14)",
            color: nightMode ? "rgba(140,180,255,1)" : "rgba(255,255,255,0.7)",
          }}
        >
          {nightMode ? "🌙 Night ON" : "☀️ Day mode"}
        </button>
        <span className="text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>
          Live app: auto-switches at civil twilight (sun &lt; −6°) via useTimeOfDay(lat, lng)
        </span>
      </div>
      <div className="flex flex-wrap gap-4">
        {nightStates.map(({ label, subLabel, state }) => (
          <BirdCard
            key={label}
            label={label}
            subLabel={subLabel}
            state={state}
            size={52}
            mapZoom={14}
            nightMode={nightMode}
            badge={nightMode ? "🌙 night" : "☀️ day"}
          />
        ))}
      </div>
    </div>
  );
}

/* ── Phase 10 Night-Mode Plumage Enhancement demo ───────────────────── */
function Phase10Demo() {
  const [skyTier, setSkyTier] = useState<"day" | "golden" | "twilight" | "night">("night");
  const [activityLevel, setActivityLevel] = useState(0.5);

  const nightStates: Array<{ label: string; subLabel: string; state: BirdState; mapZoom: number }> = [
    {
      label: "P10.1 — Pupil Shimmer",
      subLabel: "star-reflection in wet cornea (street zoom)",
      state: { heading: null, mapBearing: 0, speed: 0, navigating: false },
      mapZoom: 17,
    },
    {
      label: "P10.2 — Moonlit Wing Rim",
      subLabel: "silver-blue leading edge (high zoom)",
      state: { heading: 0, mapBearing: 0, speed: 0, navigating: false },
      mapZoom: 15,
    },
    {
      label: "P10.3 — Nocturnal Breathing",
      subLabel: "6.8s cycle vs 3.8s daytime",
      state: { heading: null, mapBearing: 0, speed: 0, navigating: false },
      mapZoom: 15,
    },
    {
      label: "P10.4+5 — Bio-glow Flight",
      subLabel: "feather bioluminescence synced to flap",
      state: { heading: 0, mapBearing: 0, speed: 14, navigating: true },
      mapZoom: 15,
    },
    {
      label: "P10.6 — Slow Night Blink",
      subLabel: "1.6x slower at night (blink period stretched)",
      state: { heading: null, mapBearing: 0, speed: 0, navigating: false },
      mapZoom: 14,
    },
    {
      label: "P10.7 — Shadow Suppressed",
      subLabel: "diffuse moonlight = no ground shadow",
      state: { heading: 0, mapBearing: 0, speed: 8, navigating: true },
      mapZoom: 14,
    },
    {
      label: "P10.8 — Crown Moonlit Tips",
      subLabel: "11s silver specularity on crown (high zoom)",
      state: { heading: null, mapBearing: 0, speed: 0, navigating: false },
      mapZoom: 15,
    },
    {
      label: "P10.9 — Lunar Pearl Egg",
      subLabel: "moon-grey luminance replaces daytime teal",
      state: { heading: null, mapBearing: 0, speed: 0, navigating: false },
      mapZoom: 14,
    },
    {
      label: "P10.10 — Low-zoom Silhouette",
      subLabel: "contrast boost for crisp dark shape",
      state: { heading: 45, mapBearing: 0, speed: 4, navigating: false },
      mapZoom: 8,
    },
    {
      label: "Daytime Compare",
      subLabel: "same settings, skyTier=day for A/B",
      state: { heading: 0, mapBearing: 0, speed: 0, navigating: false },
      mapZoom: 15,
    },
  ];

  return (
    <div className="mb-8">
      <div className="flex flex-wrap items-center gap-4 mb-5">
        <div className="flex gap-2">
          {(["day", "golden", "twilight", "night"] as const).map(tier => (
            <button
              key={tier}
              onClick={() => setSkyTier(tier)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={{
                background:
                  skyTier === tier
                    ? tier === "night" ? "rgba(30,50,120,0.9)"
                    : tier === "twilight" ? "rgba(60,35,80,0.9)"
                    : tier === "golden" ? "rgba(100,65,10,0.9)"
                    : "rgba(30,80,140,0.9)"
                    : "rgba(255,255,255,0.07)",
                border:
                  skyTier === tier
                    ? tier === "night" ? "1px solid rgba(80,140,255,0.45)"
                    : tier === "twilight" ? "1px solid rgba(180,100,220,0.45)"
                    : tier === "golden" ? "1px solid rgba(220,160,40,0.45)"
                    : "1px solid rgba(80,180,255,0.45)"
                    : "1px solid rgba(255,255,255,0.1)",
                color:
                  tier === "night" ? "rgba(140,180,255,1)"
                  : tier === "twilight" ? "rgba(220,160,255,1)"
                  : tier === "golden" ? "rgba(255,200,80,1)"
                  : "rgba(160,220,255,1)",
              }}
            >
              {tier === "night" ? "🌙 night" : tier === "twilight" ? "🌆 twilight" : tier === "golden" ? "🌇 golden" : "☀️ day"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color: "rgba(255,255,255,0.45)" }}>activity</span>
          <input
            type="range" min={0} max={1} step={0.01}
            value={activityLevel}
            onChange={e => setActivityLevel(Number(e.target.value))}
            style={{ width: 90, accentColor: "#00d4ff" }}
          />
          <span className="text-xs font-mono" style={{ color: "rgba(0,212,255,0.8)" }}>
            {(activityLevel * 100).toFixed(0)}%
          </span>
        </div>
        <span className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
          Live app: auto-switches at civil twilight (NOAA solar math, no API)
        </span>
      </div>
      <div className="flex flex-wrap gap-4">
        {nightStates.map(({ label, subLabel, state, mapZoom }) => (
          <BirdCard
            key={label}
            label={label}
            subLabel={subLabel}
            state={state}
            size={52}
            mapZoom={mapZoom}
            skyTier={label === "Daytime Compare" ? "day" : skyTier}
            activityLevel={activityLevel}
            badge={label === "Daytime Compare" ? "☀️ day" : skyTier === "night" ? "🌙 P10" : skyTier === "twilight" ? "🌆 twi" : skyTier === "golden" ? "🌇 gold" : "☀️ day"}
          />
        ))}
      </div>
    </div>
  );
}

/* ── Aerodynamics demo -- banking at every LOD ──────────────────────── */
/**
 * Shows banking + aerodynamic body/neck turning simultaneously at three zoom
 * levels. Uses continuous heading oscillation so bankDeg fires from real
 * heading deltas (the only way to trigger banking -- static heading = no bank).
 * Side-by-side comparison lets the tester verify that:
 *   mid zoom: neck arc still visible (P7.6 -- stronger 0.18x factor)
 *   high zoom: full head+neck+body turn (E7 -- 0.20/0.14/0.07)
 *   street zoom: individual feather spread + turn visible
 */
function AerodynamicsDemo() {
  const [heading, setHeading] = useState(90);
  useEffect(() => {
    let h = 90, dir = 1, ph = 0;
    const id = setInterval(() => {
      h = (h + dir * 2.2 + 360) % 360;
      ph++;
      if (ph >= 22) { dir = -dir; ph = 0; }
      setHeading(Math.round(h));
    }, 55);
    return () => clearInterval(id);
  }, []);

  const zooms: Array<{ label: string; subLabel: string; mapZoom: number; badge: string }> = [
    { label: "Mid LOD (zoom 12)", subLabel: "neck arc P7.6 -- 0.18x bank", mapZoom: 12, badge: "P7.6" },
    { label: "High LOD (zoom 15)", subLabel: "full head+neck+body turn E7", mapZoom: 15, badge: "E7" },
    { label: "Street LOD (zoom 17)", subLabel: "feather spread + aerodynamic", mapZoom: 17, badge: "E7+P7" },
  ];

  return (
    <div className="flex flex-wrap gap-4">
      {zooms.map(({ label, subLabel, mapZoom, badge }) => (
        <BirdCard
          key={mapZoom}
          label={label}
          subLabel={subLabel}
          state={{ heading, mapBearing: 0, speed: 12, navigating: true }}
          mapZoom={mapZoom}
          size={52}
          badge={badge}
        />
      ))}
      <div className="flex flex-col justify-center gap-1 text-xs px-2 max-w-[180px]"
        style={{ color: "rgba(255,255,255,0.35)" }}>
        <p>Head leads at 0.20x bank</p>
        <p>Neck follows at 0.14x (high) / 0.18x (mid)</p>
        <p>Body leans at 0.07x -- last, least</p>
        <p>Egg swings opposite at -0.18x (P7.1)</p>
        <p className="mt-1" style={{ color: "rgba(0,212,255,0.5)" }}>
          Each body part composes independently via CSS individual transform properties
        </p>
      </div>
    </div>
  );
}

/* ── Phase 7 Biomechanics demo ───────────────────────────────────────── */
/**
 * Shows the four new Phase 7 biomechanical effects:
 *   P7.1 Egg pendulum -- egg swings opposite to bank direction
 *   P7.2 Head stabilization -- head stays level while body bobs
 *   P7.3 Curiosity tilt -- idle head scan (wait 3-8s to observe)
 *   P7.4 Wingbeat variability -- stochastic feather timing at street zoom
 */
function Phase7Demo() {
  const [bankHeading, setBankHeading] = useState(90);
  useEffect(() => {
    let h = 90, dir = 1, ph = 0;
    const id = setInterval(() => {
      h = (h + dir * 2.5 + 360) % 360;
      ph++;
      if (ph >= 18) { dir = -dir; ph = 0; }
      setBankHeading(Math.round(h));
    }, 60);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex flex-wrap gap-4">
      <BirdCard
        label="P7.1 -- Egg Pendulum"
        subLabel="beak egg swings opposite to bank (inertia)"
        state={{ heading: bankHeading, mapBearing: 0, speed: 12, navigating: true }}
        mapZoom={17}
        size={52}
        badge="P7.1"
      />
      <BirdCard
        label="P7.2 -- Head Steady"
        subLabel="head stabilized while body bobs (high zoom)"
        state={{ heading: 0, mapBearing: 0, speed: 8, navigating: true }}
        mapZoom={17}
        size={52}
        badge="P7.2"
      />
      <BirdCard
        label="P7.3 -- Curiosity Tilt"
        subLabel="idle scan: left pause right pause -- wait 3-8s"
        state={{ heading: null, mapBearing: 0, speed: 0, navigating: false }}
        mapZoom={17}
        size={52}
        badge="P7.3"
      />
      <BirdCard
        label="P7.4 -- Flap Variability"
        subLabel="stochastic per-feather timing (street zoom)"
        state={{ heading: 0, mapBearing: 0, speed: 5, navigating: true }}
        mapZoom={17}
        size={52}
        badge="P7.4"
      />
      <BirdCard
        label="P7.5 -- Battery Saver Fade"
        subLabel="enter LOD3 with wash-out crossfade"
        state={{ heading: 45, mapBearing: 0, speed: 5, navigating: true }}
        mapZoom={17}
        size={52}
        batterySaver={true}
        badge="P7.5"
      />
      <BirdCard
        label="P7.6 -- Mid Neck Arc"
        subLabel="stronger neck arc on banking at zoom=12"
        state={{ heading: bankHeading, mapBearing: 0, speed: 12, navigating: true }}
        mapZoom={12}
        size={52}
        badge="P7.6"
      />
    </div>
  );
}

function Phase11Demo() {
  const [bankHeading, setBankHeading] = useState(45);
  useEffect(() => {
    let h = 45, dir = 1, ph = 0;
    const id = setInterval(() => {
      h = (h + dir * 3 + 360) % 360;
      ph++;
      if (ph >= 14) { dir = -dir; ph = 0; }
      setBankHeading(Math.round(h));
    }, 60);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex flex-wrap gap-4 mb-8">

      {/* F1: Crown sway speed tiers */}
      <BirdCard label="F1 Crown · quiet" subLabel="slow sway 5.2s — relaxed" badge="P11"
        state={{ heading: 0, mapBearing: 0, speed: 0, navigating: false }}
        mapZoom={17} size={48} activityLevel={0.05} />
      <BirdCard label="F1 Crown · normal" subLabel="baseline 3.6s" badge="P11"
        state={{ heading: 0, mapBearing: 0, speed: 0, navigating: false }}
        mapZoom={17} size={48} activityLevel={0.35} />
      <BirdCard label="F1 Crown · busy" subLabel="faster 2.4s — alert" badge="P11"
        state={{ heading: 0, mapBearing: 0, speed: 0, navigating: false }}
        mapZoom={17} size={48} activityLevel={0.65} />
      <BirdCard label="F1 Crown · peak" subLabel="rapid 1.1s — urgent" badge="P11"
        state={{ heading: 0, mapBearing: 0, speed: 0, navigating: false }}
        mapZoom={17} size={48} activityLevel={0.95} />

      {/* F2+E2: Helping body lean — full crane posture */}
      <BirdCard label="E2 Helping idle" subLabel="head+neck+body+tail crane" badge="P11"
        state={{ heading: 90, mapBearing: 0, speed: 0, navigating: false }}
        mapZoom={17} size={52} isHelping={true} />
      <BirdCard label="E2 Helping flying" subLabel="crane + banking compose" badge="P11"
        state={{ heading: bankHeading, mapBearing: 0, speed: 8, navigating: true }}
        mapZoom={17} size={52} isHelping={true} />
      <BirdCard label="E2 Not helping (control)" subLabel="returns to neutral" badge="P11"
        state={{ heading: 90, mapBearing: 0, speed: 5, navigating: true }}
        mapZoom={17} size={52} isHelping={false} />

      {/* F4: Wing-tip flex at high speed */}
      <BirdCard label="F4 Wing-tip curl · driving" subLabel="14 m/s primary flex" badge="P11"
        state={{ heading: 90, mapBearing: 0, speed: 14, navigating: true }}
        mapZoom={17} size={52} />
      <BirdCard label="F4 Wing-tip curl · airplane" subLabel="55 m/s max flex" badge="P11"
        state={{ heading: 90, mapBearing: 0, speed: 55, navigating: true }}
        mapZoom={17} size={52} />

      {/* F5: Mid-zoom helping neck translate */}
      <BirdCard label="F5 Helping · mid zoom" subLabel="neck forward-nudge visible" badge="P11"
        state={{ heading: 90, mapBearing: 0, speed: 5, navigating: true }}
        mapZoom={12} size={52} isHelping={true} />

      {/* F11: Crown sway during helping — alert 2.0s */}
      <BirdCard label="F11 Crown · helping" subLabel="2.0s, alert posture" badge="P11"
        state={{ heading: 90, mapBearing: 0, speed: 5, navigating: true }}
        mapZoom={17} size={48} isHelping={true} activityLevel={0.35} />

      {/* Battery-saver idle-settle conflict fix */}
      <BirdCard label="F7 Idle-settle guard" subLabel="idle+battery: lod3 only (no conflict)" badge="P11"
        state={{ heading: null, mapBearing: 0, speed: 0, navigating: false }}
        mapZoom={17} size={48} batterySaver={true} />

      {/* Nav-lod opacity transition fix */}
      <BirdCard label="F2 NavLod=2 trail fade" subLabel="opacity transition (no pop)" badge="P11"
        state={{ heading: 90, mapBearing: 0, speed: 8, navigating: true }}
        mapZoom={17} size={48} navLodOverride={2} />

      {/* F15: Helping gold mid-zoom shimmer */}
      <BirdCard label="F15 Helping shimmer · mid" subLabel="gold wing highlight" badge="P11"
        state={{ heading: 45, mapBearing: 0, speed: 8, navigating: true }}
        mapZoom={12} size={48} isHelping={true} />
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
