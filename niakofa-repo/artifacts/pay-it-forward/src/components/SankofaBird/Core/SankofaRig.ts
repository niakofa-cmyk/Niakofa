/**
 * SankofaBird/Core/SankofaRig.ts
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * SANKOFA MOTION ENGINE (SME) — Layer 1: Rig
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * TypeScript port of the Flutter SankofaRig / RigNode system (sankofa_rig.dart).
 * Pure data + math — no React, no DOM, no CSS.
 *
 * Key responsibilities:
 *   • Define the bone hierarchy with pivot coordinates from Skeleton/Pivots.ts
 *   • Enforce per-joint rotation constraints (minRotation / maxRotation)
 *   • Propagate parent world-rotations to children via resolveAll()
 *
 * Pipeline position (Layer 1 — topmost):
 *   ► RIG (this file) — bone graph, pivots, constraints ◄
 *     ↓
 *   Flight State (FlightState.ts)
 *     ↓
 *   Motion Solver (MotionSolver.ts — reads/writes rig node rotations)
 *     ↓
 *   Sensor Engine → Animation Mixer → Renderer
 */

import {
  PIVOT_BODY,
  PIVOT_NECK_BASE,
  PIVOT_HEAD,
  PIVOT_BEAK_BASE,
  PIVOT_EGG,
  PIVOT_WING,
  PIVOT_TAIL,
  PIVOT_LEG_LEFT,
  PIVOT_LEG_RIGHT,
} from "../Skeleton/Pivots";

// ── Part enum ──────────────────────────────────────────────────────────────

/**
 * Named bones in the kinematic chain.
 * Order here is topological — parents always appear before children.
 * MotionSolver iterates this exact order to resolve the chain.
 */
export enum BirdPart {
  body         = "body",
  chest        = "chest",
  neckLower    = "neckLower",
  neckUpper    = "neckUpper",
  head         = "head",
  beak         = "beak",
  egg          = "egg",
  leftWingUpper  = "leftWingUpper",
  leftWingLower  = "leftWingLower",
  rightWingUpper = "rightWingUpper",
  rightWingLower = "rightWingLower",
  tail         = "tail",
  legLeft      = "legLeft",
  legRight     = "legRight",
}

// ── RigNode ────────────────────────────────────────────────────────────────

/** A single joint in the skeletal hierarchy. */
export interface RigNode {
  readonly part: BirdPart;
  readonly parentPart: BirdPart | null;
  /** Pivot in SVG viewBox units (40×40 coordinate space). */
  readonly pivotX: number;
  readonly pivotY: number;
  /** Joint limits in degrees. */
  readonly minDeg: number;
  readonly maxDeg: number;
  /** Local rotation set by MotionSolver each tick. */
  localDeg: number;
  /** World rotation = sum of all parent localDegs + own localDeg. */
  worldDeg: number;
}

// ── SankofaRig ────────────────────────────────────────────────────────────

/**
 * The full rig graph.  Mirrors Flutter's SankofaRig class with RigNodes
 * addressed by BirdPart enum.
 *
 * Pivots come from Skeleton/Pivots.ts (canonical SVG-space coordinates).
 * Constraints are in degrees and match the Flutter radian values × (180/π).
 */
export class SankofaRig {
  readonly nodes: Map<BirdPart, RigNode>;

  constructor() {
    const nodes = new Map<BirdPart, RigNode>();

    const add = (
      part: BirdPart,
      parentPart: BirdPart | null,
      pivotX: number, pivotY: number,
      minDeg: number, maxDeg: number,
    ): void => {
      nodes.set(part, { part, parentPart, pivotX, pivotY, minDeg, maxDeg, localDeg: 0, worldDeg: 0 });
    };

    // ── Spine chain ───────────────────────────────────────────────────────
    add(BirdPart.body,      null,            PIVOT_BODY.x,      PIVOT_BODY.y,      -180, 180);
    add(BirdPart.chest,     BirdPart.body,   PIVOT_BODY.x,      PIVOT_BODY.y,        -8,   8); // ≈±0.15 rad
    add(BirdPart.neckLower, BirdPart.chest,  PIVOT_NECK_BASE.x, PIVOT_NECK_BASE.y, -34,  34); // ≈±0.60 rad
    add(BirdPart.neckUpper, BirdPart.neckLower, PIVOT_NECK_BASE.x, PIVOT_NECK_BASE.y - 6, -40, 40); // ≈±0.70 rad
    add(BirdPart.head,      BirdPart.neckUpper, PIVOT_HEAD.x,   PIVOT_HEAD.y,      -51,  51); // ≈±0.90 rad

    // ── Beak + egg ────────────────────────────────────────────────────────
    add(BirdPart.beak,      BirdPart.head,   PIVOT_BEAK_BASE.x, PIVOT_BEAK_BASE.y, -11,  11); // ≈±0.20 rad
    add(BirdPart.egg,       BirdPart.beak,   PIVOT_EGG.x,       PIVOT_EGG.y,       -17,  17); // ≈±0.30 rad

    // ── Wings ─────────────────────────────────────────────────────────────
    add(BirdPart.leftWingUpper,  BirdPart.chest, PIVOT_WING.x, PIVOT_WING.y, -80, 80); // ≈±1.40 rad
    add(BirdPart.leftWingLower,  BirdPart.leftWingUpper,  PIVOT_WING.x - 8, PIVOT_WING.y, -69, 17);
    add(BirdPart.rightWingUpper, BirdPart.chest, PIVOT_WING.x, PIVOT_WING.y, -80, 80);
    add(BirdPart.rightWingLower, BirdPart.rightWingUpper, PIVOT_WING.x + 8, PIVOT_WING.y, -69, 17);

    // ── Tail + legs ───────────────────────────────────────────────────────
    add(BirdPart.tail,     BirdPart.body, PIVOT_TAIL.x,     PIVOT_TAIL.y,     -29, 29); // ≈±0.50 rad
    add(BirdPart.legLeft,  BirdPart.body, PIVOT_LEG_LEFT.x, PIVOT_LEG_LEFT.y, -11, 11); // ≈±0.20 rad
    add(BirdPart.legRight, BirdPart.body, PIVOT_LEG_RIGHT.x,PIVOT_LEG_RIGHT.y,-11, 11);

    this.nodes = nodes;
  }

  /**
   * Set local rotation for a joint (clamped to joint limits).
   * @param deg Desired local rotation in degrees.
   */
  setRotation(part: BirdPart, deg: number): void {
    const node = this.nodes.get(part);
    if (!node) return;
    node.localDeg = Math.max(node.minDeg, Math.min(node.maxDeg, deg));
  }

  /**
   * Propagate world rotations from root to leaves.
   * Must be called AFTER all setRotation() calls each solver tick.
   * Node insertion order in the constructor is topological (parents before children).
   */
  resolveAll(): void {
    for (const node of this.nodes.values()) {
      const parent = node.parentPart !== null ? this.nodes.get(node.parentPart) : undefined;
      node.worldDeg = (parent?.worldDeg ?? 0) + node.localDeg;
    }
  }

  /** Get a resolved node (throws if part doesn't exist — indicates a coding error). */
  get(part: BirdPart): RigNode {
    const node = this.nodes.get(part);
    if (!node) throw new Error(`SankofaRig: unknown part "${part}"`);
    return node;
  }

  /** Reset all local rotations to zero (used when resetting state). */
  reset(): void {
    for (const node of this.nodes.values()) {
      node.localDeg = 0;
      node.worldDeg = 0;
    }
  }
}
