/**
 * Tests for NiakofaMovementSystem — pixel-precise movement, collision, slide-on-corner.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  makeMovementState,
  stepMovement,
  withinInteractionRadius,
  NiakofaMovementController,
  type TileWalkable,
  type MoveIntent,
} from "../niakofa-movement-system.js";

// ── helpers ────────────────────────────────────────────────────────────────────

/** All tiles walkable */
const openMap: TileWalkable = () => true;

/** Solid wall blocking column 3+ on any row */
const walledMap: TileWalkable = (col) => col < 3;

/** 6×9 map — all open */
const openBounded: TileWalkable = (col, row) => col >= 0 && col < 9 && row >= 0 && row < 6;

// ── makeMovementState ──────────────────────────────────────────────────────────

describe("makeMovementState", () => {
  it("initialises at given position", () => {
    const s = makeMovementState(2, 3);
    assert.deepEqual(s.pos, { x: 2, y: 3 });
  });

  it("starts facing down and not moving", () => {
    const s = makeMovementState(0, 0);
    assert.equal(s.facing, "down");
    assert.equal(s.moving, false);
  });

  it("default speed is 0.0625", () => {
    assert.equal(makeMovementState(0, 0).speed, 0.0625);
  });
});

// ── stepMovement — basic direction ────────────────────────────────────────────

describe("stepMovement — direction", () => {
  it("moves right by speed on open map", () => {
    const s = makeMovementState(1, 1);
    const intent: MoveIntent = { kind: "direction", dx: 1, dy: 0 };
    const next = stepMovement(s, intent, openMap);
    assert.ok(next.pos.x > 1, "x should increase");
    assert.equal(next.pos.y, 1);
    assert.equal(next.facing, "right");
    assert.equal(next.moving, true);
  });

  it("moves left and updates facing", () => {
    const s = makeMovementState(2, 2);
    const next = stepMovement(s, { kind: "direction", dx: -1, dy: 0 }, openMap);
    assert.equal(next.facing, "left");
  });

  it("moves down and updates facing", () => {
    const s = makeMovementState(2, 2);
    const next = stepMovement(s, { kind: "direction", dx: 0, dy: 1 }, openMap);
    assert.equal(next.facing, "down");
  });

  it("moves up and updates facing", () => {
    const s = makeMovementState(2, 2);
    const next = stepMovement(s, { kind: "direction", dx: 0, dy: -1 }, openMap);
    assert.equal(next.facing, "up");
  });

  it("does not move on none intent", () => {
    const s = makeMovementState(1, 1);
    const next = stepMovement(s, { kind: "none" }, openMap);
    assert.deepEqual(next.pos, { x: 1, y: 1 });
    assert.equal(next.moving, false);
  });
});

// ── stepMovement — collision ───────────────────────────────────────────────────

describe("stepMovement — collision", () => {
  it("blocks movement into solid tile", () => {
    // Start at x=2.5, trying to move right into col 3 (blocked)
    const s = makeMovementState(2.5, 1);
    const next = stepMovement(s, { kind: "direction", dx: 1, dy: 0 }, walledMap);
    assert.ok(next.pos.x <= 2.6, "should not cross into wall");
  });

  it("allows movement along wall face (slide-on-corner)", () => {
    // Diagonal move: right + down. Right is blocked (col 3), down should succeed.
    const s = makeMovementState(2.5, 1.5);
    const next = stepMovement(s, { kind: "direction", dx: 1, dy: 1 }, walledMap);
    // Should slide: Y should increase, X should stay bounded.
    assert.ok(next.pos.y > 1.5, "y should have increased (slide down along wall)");
  });

  it("stays put when fully blocked", () => {
    // Walled at col 3+; start at 2.9 — full move AND x-only AND y-only all blocked
    const solid: TileWalkable = () => false;
    const s = makeMovementState(1, 1);
    const next = stepMovement(s, { kind: "direction", dx: 1, dy: 0 }, solid);
    assert.equal(next.moving, false);
  });
});

// ── stepMovement — target ─────────────────────────────────────────────────────

describe("stepMovement — target", () => {
  it("moves toward target on open map", () => {
    const s = makeMovementState(0, 0);
    const next = stepMovement(s, { kind: "target", tx: 5, ty: 5 }, openMap);
    assert.ok(next.pos.x > 0);
    assert.ok(next.pos.y > 0);
    assert.equal(next.moving, true);
  });

  it("snaps to target when within one step", () => {
    const s = makeMovementState(4.99, 4.99);
    const next = stepMovement(s, { kind: "target", tx: 5, ty: 5 }, openMap);
    assert.equal(next.pos.x, 5);
    assert.equal(next.pos.y, 5);
    assert.equal(next.moving, false);
  });
});

// ── stepMovement — knockback ──────────────────────────────────────────────────

describe("stepMovement — knockback", () => {
  it("applies knockback delta for remaining frames", () => {
    const s = {
      ...makeMovementState(2, 2),
      knockbackFrames: 4,
      knockbackDx: 0.1,
      knockbackDy: 0.0,
    };
    const next = stepMovement(s, { kind: "none" }, openMap);
    assert.ok(next.pos.x > 2, "x should advance due to knockback");
    assert.equal(next.knockbackFrames, 3);
  });

  it("clears knockback after frames exhaust", () => {
    let s = { ...makeMovementState(2, 2), knockbackFrames: 1, knockbackDx: 0.1, knockbackDy: 0 };
    s = stepMovement(s, { kind: "none" }, openMap);
    assert.equal(s.knockbackFrames, 0);
  });
});

// ── withinInteractionRadius ────────────────────────────────────────────────────

describe("withinInteractionRadius", () => {
  it("returns true for nearby points", () => {
    assert.equal(withinInteractionRadius({ x: 1, y: 1 }, { x: 1.5, y: 1 }), true);
  });

  it("returns false for distant points", () => {
    assert.equal(withinInteractionRadius({ x: 0, y: 0 }, { x: 10, y: 10 }), false);
  });

  it("respects custom radius", () => {
    assert.equal(withinInteractionRadius({ x: 0, y: 0 }, { x: 0.5, y: 0 }, 0.3), false);
    assert.equal(withinInteractionRadius({ x: 0, y: 0 }, { x: 0.5, y: 0 }, 0.6), true);
  });
});

// ── NiakofaMovementController ─────────────────────────────────────────────────

describe("NiakofaMovementController", () => {
  it("starts at given position", () => {
    const ctrl = new NiakofaMovementController(3, 4, openMap);
    assert.deepEqual(ctrl.pos, { x: 3, y: 4 });
    assert.equal(ctrl.moving, false);
  });

  it("moves after setIntent + tick", () => {
    const ctrl = new NiakofaMovementController(0, 0, openMap);
    ctrl.setIntent({ kind: "direction", dx: 1, dy: 0 });
    ctrl.tick();
    assert.ok(ctrl.pos.x > 0);
    assert.equal(ctrl.moving, true);
  });

  it("toPixel scales correctly", () => {
    const ctrl = new NiakofaMovementController(2, 3, openMap);
    const px = ctrl.toPixel(64);
    assert.equal(px.px, 128);
    assert.equal(px.py, 192);
  });

  it("findNearby returns indices within radius", () => {
    const ctrl = new NiakofaMovementController(5, 5, openMap);
    const nearby = ctrl.findNearby([
      { x: 5.5, y: 5 },   // within 1.2
      { x: 10, y: 10 },    // too far
      { x: 5, y: 6 },     // within 1.2
    ]);
    assert.deepEqual(nearby, [0, 2]);
  });

  it("applyKnockback sets knockback state", () => {
    const ctrl = new NiakofaMovementController(5, 5, openMap);
    ctrl.applyKnockback(0.2, 0, 3);
    ctrl.tick();
    assert.ok(ctrl.pos.x > 5, "knockback should have moved player");
  });

  it("snapshot is immutable reference", () => {
    const ctrl = new NiakofaMovementController(1, 1, openMap);
    const snap1 = ctrl.snapshot();
    ctrl.setIntent({ kind: "direction", dx: 1, dy: 0 });
    ctrl.tick();
    const snap2 = ctrl.snapshot();
    assert.notDeepEqual(snap1.pos, snap2.pos);
  });
});

// ── bounded map ───────────────────────────────────────────────────────────────

describe("stepMovement — map boundary clamping", () => {
  it("does not leave the map bounds (x≥0)", () => {
    const s = makeMovementState(0.1, 2);
    const next = stepMovement(s, { kind: "direction", dx: -1, dy: 0 }, openBounded);
    assert.ok(next.pos.x >= 0);
  });

  it("does not leave the map bounds (y≥0)", () => {
    const s = makeMovementState(2, 0.1);
    const next = stepMovement(s, { kind: "direction", dx: 0, dy: -1 }, openBounded);
    assert.ok(next.pos.y >= 0);
  });
});
