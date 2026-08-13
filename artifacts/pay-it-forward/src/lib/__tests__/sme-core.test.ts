/**
 * sme-core.test.ts
 *
 * Unit tests for the Sankofa Motion Engine (SME) core systems:
 *   - SankofaRig   (Layer 1: bone hierarchy + constraints)
 *   - MotionSolver (Layer 3: kinematic chain physics)
 *   - SensorEngine / buildFlightState (Layer 4: props → FlightState)
 *
 * Run with:
 *   pnpm --filter @workspace/pay-it-forward run test
 *
 * Test runner: node --import tsx/esm --test (NOT jest)
 */

import { describe, it, _before, beforeEach } from "node:test";
import { expect } from "expect";

import { SankofaRig, BirdPart }      from "../../components/SankofaBird/Core/SankofaRig";
import { MotionSolver }               from "../../components/SankofaBird/Core/MotionSolver";
import { buildFlightState }           from "../../components/SankofaBird/Core/SensorEngine";

// ═══════════════════════════════════════════════════════════════════════════
// SankofaRig tests
// ═══════════════════════════════════════════════════════════════════════════

describe("SankofaRig", () => {
  let rig: SankofaRig;

  beforeEach(() => {
    rig = new SankofaRig();
  });

  it("constructs with all expected BirdPart nodes", () => {
    const expectedParts = [
      BirdPart.body, BirdPart.chest, BirdPart.neckLower, BirdPart.neckUpper,
      BirdPart.head, BirdPart.beak, BirdPart.egg,
      BirdPart.leftWingUpper, BirdPart.leftWingLower,
      BirdPart.rightWingUpper, BirdPart.rightWingLower,
      BirdPart.tail, BirdPart.legLeft, BirdPart.legRight,
    ];
    for (const part of expectedParts) {
      expect(() => rig.get(part)).not.toThrow();
    }
  });

  it("initialises all nodes with localDeg=0 and worldDeg=0", () => {
    for (const node of rig.nodes.values()) {
      expect(node.localDeg).toBe(0);
      expect(node.worldDeg).toBe(0);
    }
  });

  it("setRotation stores the value on the node", () => {
    rig.setRotation(BirdPart.head, 30);
    expect(rig.get(BirdPart.head).localDeg).toBe(30);
  });

  it("setRotation clamps to joint maxDeg", () => {
    const head = rig.get(BirdPart.head);
    rig.setRotation(BirdPart.head, head.maxDeg + 100);
    expect(rig.get(BirdPart.head).localDeg).toBe(head.maxDeg);
  });

  it("setRotation clamps to joint minDeg", () => {
    const head = rig.get(BirdPart.head);
    rig.setRotation(BirdPart.head, head.minDeg - 100);
    expect(rig.get(BirdPart.head).localDeg).toBe(head.minDeg);
  });

  it("setRotation on unknown part is a no-op (does not throw)", () => {
    // get() throws — but setRotation should silently guard
    expect(() => rig.setRotation("bogus" as BirdPart, 10)).not.toThrow();
  });

  it("get() throws for an unknown part", () => {
    expect(() => rig.get("bogus" as BirdPart)).toThrow(/SankofaRig: unknown part/);
  });

  it("resolveAll propagates parent worldDeg to children", () => {
    // Set chest (parent of neckLower) to 5 deg
    rig.setRotation(BirdPart.chest, 5);
    // Set neckLower (child of chest) to 10 deg
    rig.setRotation(BirdPart.neckLower, 10);
    rig.resolveAll();
    // chest worldDeg = body.worldDeg(0) + chest.localDeg(5) = 5
    expect(rig.get(BirdPart.chest).worldDeg).toBe(5);
    // neckLower worldDeg = chest.worldDeg(5) + neckLower.localDeg(10) = 15
    expect(rig.get(BirdPart.neckLower).worldDeg).toBe(15);
  });

  it("resolveAll propagates through full spine to head", () => {
    rig.setRotation(BirdPart.chest,    4);
    rig.setRotation(BirdPart.neckLower, 6);
    rig.setRotation(BirdPart.neckUpper, 8);
    rig.setRotation(BirdPart.head,     10);
    rig.resolveAll();
    // world = 0 + 4 + 6 + 8 + 10 = 28
    expect(rig.get(BirdPart.head).worldDeg).toBeCloseTo(28, 5);
  });

  it("body (root) worldDeg equals its own localDeg", () => {
    rig.setRotation(BirdPart.body, 15);
    rig.resolveAll();
    expect(rig.get(BirdPart.body).worldDeg).toBe(15);
  });

  it("reset() zeroes all rotations", () => {
    rig.setRotation(BirdPart.head, 30);
    rig.setRotation(BirdPart.tail, -15);
    rig.resolveAll();
    rig.reset();
    for (const node of rig.nodes.values()) {
      expect(node.localDeg).toBe(0);
      expect(node.worldDeg).toBe(0);
    }
  });

  it("wing constraints: leftWingUpper allows ±80°", () => {
    rig.setRotation(BirdPart.leftWingUpper,  80);
    expect(rig.get(BirdPart.leftWingUpper).localDeg).toBe(80);
    rig.setRotation(BirdPart.leftWingUpper, -80);
    expect(rig.get(BirdPart.leftWingUpper).localDeg).toBe(-80);
    rig.setRotation(BirdPart.leftWingUpper,  90); // over limit
    expect(rig.get(BirdPart.leftWingUpper).localDeg).toBe(80);
  });

  it("tail constraints: tail allows ±29°", () => {
    rig.setRotation(BirdPart.tail, 29);
    expect(rig.get(BirdPart.tail).localDeg).toBe(29);
    rig.setRotation(BirdPart.tail, 50); // over limit
    expect(rig.get(BirdPart.tail).localDeg).toBe(29);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// MotionSolver tests
// ═══════════════════════════════════════════════════════════════════════════

/** Minimal FlightState for use in solver tests.
 *  Includes all fields from FlightState (SME v2/v3: windStrength + windHeading). */
function makeFS(overrides: Partial<{
  headingRadians: number;
  velocity: number;
  turnRate: number;
  hoverAmount: number;
  landing: boolean;
  idle: boolean;
  windX: number;
  windY: number;
  windStrength: number;
  windHeading: number;
  notificationPulse: number;
  batterySaver: boolean;
}> = {}) {
  return {
    headingRadians:    overrides.headingRadians   ?? 0,
    velocity:          overrides.velocity          ?? 0,
    turnRate:          overrides.turnRate          ?? 0,
    hoverAmount:       overrides.hoverAmount       ?? 0,
    landing:           overrides.landing           ?? false,
    idle:              overrides.idle              ?? false,
    windX:             overrides.windX             ?? 0,
    windY:             overrides.windY             ?? 0,
    windStrength:      overrides.windStrength      ?? 0,
    windHeading:       overrides.windHeading       ?? 0,
    notificationPulse: overrides.notificationPulse ?? 0,
    batterySaver:      overrides.batterySaver      ?? false,
  };
}

describe("MotionSolver", () => {
  let rig: SankofaRig;
  let solver: MotionSolver;

  beforeEach(() => {
    rig    = new SankofaRig();
    solver = new MotionSolver(rig);
  });

  it("step() returns a complete SolverOutput with all required fields", () => {
    const out = solver.step(makeFS(), 1 / 60);
    const requiredFields = [
      "headDeg", "neckUpperDeg", "neckLowerDeg", "bodyRollDeg",
      "tailDeg", "leftWingUpperDeg", "leftWingLowerDeg",
      "rightWingUpperDeg", "rightWingLowerDeg",
      "eyeX", "eyeY", "flapPhase", "flapAmplitude",
      "notificationPulse", "smoothedHeadingDeltaRad",
      "windStrength",  // SME v2/v3 addition
    ];
    for (const field of requiredFields) {
      expect(out).toHaveProperty(field);
      expect(typeof (out as Record<string, unknown>)[field]).toBe("number");
    }
  });

  it("all output values are finite (no NaN, no Infinity)", () => {
    const out = solver.step(makeFS({ velocity: 0.8, turnRate: 0.5 }), 1 / 60);
    for (const [_key, val] of Object.entries(out)) {
      expect(isFinite(val as number)).toBe(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }
  });

  it("head leads the turn — headDeg > neckUpperDeg > neckLowerDeg for rightward heading", () => {
    // 45° rightward heading → head should lead, neck partially follows
    const out = solver.step(makeFS({ headingRadians: Math.PI / 4 }), 0.5);
    // All should be positive (right turn)
    expect(out.headDeg).toBeGreaterThan(0);
    expect(out.neckUpperDeg).toBeGreaterThan(0);
    expect(out.neckLowerDeg).toBeGreaterThan(0);
    // Head leads most, neckLower follows least
    expect(Math.abs(out.headDeg)).toBeGreaterThan(Math.abs(out.neckUpperDeg));
    expect(Math.abs(out.neckUpperDeg)).toBeGreaterThan(Math.abs(out.neckLowerDeg));
  });

  it("body roll integrates toward turnRate × 0.6 (positive right turn)", () => {
    // After several steps with a positive turn rate, bodyRollDeg should be positive
    const fs = makeFS({ turnRate: 1.0 });
    let out = solver.step(fs, 1 / 60);
    for (let i = 0; i < 30; i++) out = solver.step(fs, 1 / 60);
    expect(out.bodyRollDeg).toBeGreaterThan(0);
  });

  it("tail opposes body roll (tail and body roll have opposite signs)", () => {
    // Positive turn rate → positive body roll → tail should be negative
    const fs = makeFS({ turnRate: 1.0 });
    let out = solver.step(fs, 1 / 60);
    for (let i = 0; i < 20; i++) out = solver.step(fs, 1 / 60);
    expect(out.tailDeg).toBeLessThan(0);
  });

  it("wings flap (non-zero amplitude) during active flight", () => {
    const fs = makeFS({ velocity: 0.8 });
    let out = solver.step(fs, 1 / 60);
    for (let i = 0; i < 10; i++) out = solver.step(fs, 1 / 60);
    // Wing upper degrees should be oscillating — check they are non-zero at some point
    expect(out.flapAmplitude).toBeGreaterThan(0);
    expect(out.flapPhase).toBeGreaterThan(0);
  });

  it("idle mode uses a much gentler flap amplitude than cruise", () => {
    const idleFs   = makeFS({ idle: true,  velocity: 0 });
    const cruiseFs = makeFS({ idle: false, velocity: 1.0 });

    let idleOut   = solver.step(idleFs,   1 / 60);
    let cruiseOut = solver.step(new MotionSolver(new SankofaRig()).step.bind(new MotionSolver(new SankofaRig()))(cruiseFs, 1/60) as never, 1/60);

    // Create fresh solvers for fair comparison
    const idleSolver   = new MotionSolver(new SankofaRig());
    const cruiseSolver = new MotionSolver(new SankofaRig());
    idleOut   = idleSolver.step(idleFs,   1 / 60);
    cruiseOut = cruiseSolver.step(cruiseFs, 1 / 60);

    expect(idleOut.flapAmplitude).toBeLessThan(cruiseOut.flapAmplitude);
  });

  it("eye drifts toward heading direction (east heading → positive eyeX)", () => {
    // East = 90° = π/2 rad → cos(π/2)≈0, sin(π/2)≈1, but SVG Y is down
    // North = 0 rad → cos(0)=1, sin(0)=0 → eyeX=positive, eyeY≈0
    const out = solver.step(makeFS({ headingRadians: 0 }), 1 / 60);
    expect(out.eyeX).toBeGreaterThan(0);
    expect(Math.abs(out.eyeY)).toBeLessThan(0.1);
  });

  it("eye offset magnitude never exceeds 1.5 SVG units (solver cap)", () => {
    // Run with extreme heading changes each frame
    for (let i = 0; i < 60; i++) {
      const headingRad = ((i * 37) % 360) * (Math.PI / 180);
      const out = solver.step(makeFS({ headingRadians: headingRad }), 1 / 60);
      expect(Math.abs(out.eyeX)).toBeLessThanOrEqual(1.5 + 0.001); // ±epsilon
      expect(Math.abs(out.eyeY)).toBeLessThanOrEqual(1.5 + 0.001);
    }
  });

  it("notification pulse decays from 1 toward 0 over multiple steps", () => {
    // Fire a notification pulse
    const fireFs = makeFS({ notificationPulse: 1.0 });
    solver.step(fireFs, 1 / 60);
    // Then let it decay
    const idleFs = makeFS({ notificationPulse: 0 });
    let out = solver.step(idleFs, 1 / 60);
    for (let i = 0; i < 10; i++) out = solver.step(idleFs, 1 / 60);
    expect(out.notificationPulse).toBeGreaterThan(0); // still decaying
    for (let i = 0; i < 120; i++) out = solver.step(idleFs, 1 / 60);
    expect(out.notificationPulse).toBeCloseTo(0, 2); // fully decayed
  });

  it("dt is clamped to 50ms — spiked dt does not produce infinite values", () => {
    // 500ms spike (tab hidden)
    const out = solver.step(makeFS({ velocity: 1.0, turnRate: 2.0 }), 0.5);
    for (const val of Object.values(out)) {
      expect(isFinite(val)).toBe(true);
    }
  });

  it("reset() zeroes all integrated state", () => {
    // Run for a while to build up state
    const fs = makeFS({ velocity: 0.8, turnRate: 0.5, headingRadians: 1.0 });
    for (let i = 0; i < 60; i++) solver.step(fs, 1 / 60);

    solver.reset();

    // Verify rig is fully reset
    for (const node of rig.nodes.values()) {
      expect(node.localDeg).toBe(0);
      expect(node.worldDeg).toBe(0);
    }
    // Public eye state is zeroed
    expect(solver.eyeX).toBe(0);
    expect(solver.eyeY).toBe(0);

    // After one tiny step in idle/calm state, bodyRoll and notification should
    // be near-zero (only 1ms of integration from zero).
    // flapPhase integrates at ~1.5 Hz even at rest, so 1ms gives ~0.0094 rad —
    // we just verify it's much less than π (clearly reset, not mid-cycle).
    const out = solver.step(makeFS({ idle: true }), 0.001);
    expect(Math.abs(out.bodyRollDeg)).toBeLessThan(0.01);
    expect(out.notificationPulse).toBeCloseTo(0, 3);
    expect(out.flapPhase).toBeLessThan(0.02); // nearly zero — definitely reset
  });

  it("wings are mirrored: left up-stroke coincides with right down-stroke", () => {
    // After enough ticks the wings are cycling — at some phase L is up and R is down
    let sawOpposite = false;
    for (let i = 0; i < 120; i++) {
      const out = solver.step(makeFS({ velocity: 0.8 }), 1 / 60);
      if (out.leftWingUpperDeg < -1 && out.rightWingUpperDeg > 1) {
        sawOpposite = true;
        break;
      }
    }
    expect(sawOpposite).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SensorEngine / buildFlightState tests
// ═══════════════════════════════════════════════════════════════════════════

const EXTRAS = (overrides: Partial<{
  bankDeg: number;
  landingPhase: "flying" | "idle" | "takeoff" | "hover" | "slowflap" | "dive" | "perch";
  navigating: boolean;
  eventFired: boolean;
}> = {}) => ({
  bankDeg:       overrides.bankDeg       ?? 0,
  landingPhase:  overrides.landingPhase  ?? ("idle" as const),
  navigating:    overrides.navigating    ?? false,
  eventFired:    overrides.eventFired    ?? false,
});

describe("buildFlightState", () => {
  it("converts heading degrees to radians correctly", () => {
    const fs = buildFlightState(90, 0, "clear", false, EXTRAS());
    expect(fs.headingRadians).toBeCloseTo(Math.PI / 2, 5);
  });

  it("heading=null defaults to 0 radians", () => {
    const fs = buildFlightState(null, 0, "clear", false, EXTRAS());
    expect(fs.headingRadians).toBe(0);
  });

  it("velocity is normalised to [0, 1]: 0 m/s → 0, 15 m/s → 1, 30 m/s → capped at 1", () => {
    expect(buildFlightState(0, 0,  "clear", false, EXTRAS()).velocity).toBe(0);
    expect(buildFlightState(0, 15, "clear", false, EXTRAS()).velocity).toBe(1);
    expect(buildFlightState(0, 30, "clear", false, EXTRAS()).velocity).toBe(1);
  });

  it("turnRate is derived from bankDeg / 28.6", () => {
    const bankDeg = 20;
    const fs = buildFlightState(0, 0, "clear", false, EXTRAS({ bankDeg }));
    expect(fs.turnRate).toBeCloseTo(bankDeg / 28.6, 5);
  });

  it("hoverAmount is 1.0 for landingPhase=hover", () => {
    const fs = buildFlightState(0, 0, "clear", false, EXTRAS({ landingPhase: "hover" }));
    expect(fs.hoverAmount).toBe(1.0);
  });

  it("hoverAmount is 1.0 for landingPhase=perch", () => {
    const fs = buildFlightState(0, 0, "clear", false, EXTRAS({ landingPhase: "perch" }));
    expect(fs.hoverAmount).toBe(1.0);
  });

  it("hoverAmount is 0.7 for landingPhase=slowflap", () => {
    const fs = buildFlightState(0, 0, "clear", false, EXTRAS({ landingPhase: "slowflap" }));
    expect(fs.hoverAmount).toBe(0.7);
  });

  it("idle=true when not navigating and speed < 0.5", () => {
    const fs = buildFlightState(0, 0.2, "clear", false, EXTRAS({ navigating: false }));
    expect(fs.idle).toBe(true);
  });

  it("idle=false when navigating even at low speed", () => {
    const fs = buildFlightState(0, 0.2, "clear", false, EXTRAS({ navigating: true }));
    expect(fs.idle).toBe(false);
  });

  it("idle=false when speed >= 0.5", () => {
    const fs = buildFlightState(0, 0.5, "clear", false, EXTRAS({ navigating: false }));
    expect(fs.idle).toBe(false);
  });

  it("windy weather sets a strong positive windX", () => {
    const fs = buildFlightState(0, 0, "windy", false, EXTRAS());
    expect(fs.windX).toBeGreaterThan(1);
  });

  it("clear weather gives windX=0, windY=0", () => {
    const fs = buildFlightState(0, 0, "clear", false, EXTRAS());
    expect(fs.windX).toBe(0);
    expect(fs.windY).toBe(0);
  });

  it("unknown weather falls back to calm (clear)", () => {
    const fs = buildFlightState(0, 0, "tornado", false, EXTRAS());
    expect(fs.windX).toBe(0);
    expect(fs.windY).toBe(0);
  });

  it("eventFired=true sets notificationPulse=1.0", () => {
    const fs = buildFlightState(0, 0, "clear", false, EXTRAS({ eventFired: true }));
    expect(fs.notificationPulse).toBe(1.0);
  });

  it("eventFired=false leaves notificationPulse at 0", () => {
    const fs = buildFlightState(0, 0, "clear", false, EXTRAS({ eventFired: false }));
    expect(fs.notificationPulse).toBe(0);
  });

  it("landing=true for landingPhase=dive (not flying/idle/takeoff)", () => {
    const fs = buildFlightState(0, 0, "clear", false, EXTRAS({ landingPhase: "dive" }));
    expect(fs.landing).toBe(true);
  });

  it("landing=false for landingPhase=flying", () => {
    const fs = buildFlightState(0, 5, "clear", false, EXTRAS({ landingPhase: "flying" }));
    expect(fs.landing).toBe(false);
  });

  it("batterySaver is passed through directly", () => {
    expect(buildFlightState(0, 0, "clear", true,  EXTRAS()).batterySaver).toBe(true);
    expect(buildFlightState(0, 0, "clear", false, EXTRAS()).batterySaver).toBe(false);
  });

  it("storm weather has higher windX than windy", () => {
    const windy = buildFlightState(0, 0, "windy", false, EXTRAS());
    const storm = buildFlightState(0, 0, "storm", false, EXTRAS());
    expect(storm.windX).toBeGreaterThan(windy.windX);
  });
});
