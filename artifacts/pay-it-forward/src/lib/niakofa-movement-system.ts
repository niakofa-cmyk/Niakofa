/**
 * NiakofaMovementSystem — sub-tile pixel-precise movement.
 *
 * Inspired by the architectural patterns in the ARPG DotMoveSystem plugin
 * (unagiootoro, MIT license) but a fully original TypeScript reimplementation
 * built specifically for the Niakofa React/canvas runtime. No RPG Maker code
 * is copied here.
 *
 * Core concepts taken from ARPG study:
 * - Position is (x, y) in fractional tile units (0.0 → width-1, 0.0 → height-1)
 * - Movement unit per frame is a fraction of a tile (default 0.0625 = 1/16 tile)
 * - Slide-on-corner: if a diagonal move is blocked, try the horizontal or
 *   vertical component alone so the player glides around corners naturally.
 * - Collision is an AABB check against tile walkability, not a grid snap.
 *
 * Architecture:
 *   NiakofaMovementState  — pure data, serialisable
 *   stepMovement()        — pure function, no side-effects
 *   NiakofaMovementController — stateful class wrapper for React integration
 */

// ── Types ──────────────────────────────────────────────────────────────────────

/** World orientation — matches DemoFacing in legacy-demo-state. */
export type MoveFacing = "up" | "down" | "left" | "right";

/** Sub-tile floating point position (fractional tile units). */
export interface TilePos {
  x: number; // column (0 → mapCols-1)
  y: number; // row    (0 → mapRows-1)
}

/** Per-frame movement intent — either directional or a move-to target. */
export type MoveIntent =
  | { kind: "direction"; dx: number; dy: number }
  | { kind: "target"; tx: number; ty: number }
  | { kind: "none" };

/** Snapshot of a moving entity. */
export interface NiakofaMovementState {
  pos: TilePos;
  facing: MoveFacing;
  /** Current speed in tile-units per frame (default 0.0625). */
  speed: number;
  /** Whether the entity is currently in motion (triggers walk animation). */
  moving: boolean;
  /** Remaining frames of knockback; 0 = normal. */
  knockbackFrames: number;
  knockbackDx: number;
  knockbackDy: number;
}

export function makeMovementState(x: number, y: number): NiakofaMovementState {
  return {
    pos: { x, y },
    facing: "down",
    speed: 0.0625,
    moving: false,
    knockbackFrames: 0,
    knockbackDx: 0,
    knockbackDy: 0,
  };
}

// ── Collision oracle ───────────────────────────────────────────────────────────

/** Returns true if tile (col, row) is walkable. Caller provides this. */
export type TileWalkable = (col: number, row: number) => boolean;

/** AABB half-extents for the entity (in tile units, default 0.35 × 0.35). */
export interface EntityBounds {
  halfW: number;
  halfH: number;
}

const DEFAULT_BOUNDS: EntityBounds = { halfW: 0.35, halfH: 0.35 };

/**
 * Returns true if a rectangle centred at (cx, cy) with given half-extents
 * has no collision with any non-walkable tile on the map.
 */
function canOccupy(
  cx: number,
  cy: number,
  bounds: EntityBounds,
  isWalkable: TileWalkable,
): boolean {
  // Check all four corners of the AABB against the tile grid.
  const x0 = Math.floor(cx - bounds.halfW);
  const x1 = Math.floor(cx + bounds.halfW - 0.001);
  const y0 = Math.floor(cy - bounds.halfH);
  const y1 = Math.floor(cy + bounds.halfH - 0.001);
  for (let row = y0; row <= y1; row++) {
    for (let col = x0; col <= x1; col++) {
      if (!isWalkable(col, row)) return false;
    }
  }
  return true;
}

// ── Core step function ─────────────────────────────────────────────────────────

/**
 * Advances a movement state by one tick.
 *
 * - Applies knockback first, then voluntary movement.
 * - Slide-on-corner: if the full delta is blocked, tries the X component
 *   alone, then the Y component alone. This is the core DotMoveSystem insight:
 *   "if character collides with the corner of a wall, move to the side where
 *   there is no corner."
 * - Returns a new state object (pure).
 */
export function stepMovement(
  state: NiakofaMovementState,
  intent: MoveIntent,
  isWalkable: TileWalkable,
  bounds: EntityBounds = DEFAULT_BOUNDS,
): NiakofaMovementState {
  let { x, y } = state.pos;
  let { facing, speed, knockbackFrames, knockbackDx, knockbackDy } = state;
  let moving = false;

  // ── Knockback phase ────────────────────────────────────────────────────────
  if (knockbackFrames > 0) {
    const nx = x + knockbackDx;
    const ny = y + knockbackDy;
    if (canOccupy(nx, ny, bounds, isWalkable)) {
      x = nx;
      y = ny;
    }
    knockbackFrames--;
    return { pos: { x, y }, facing, speed, moving: true, knockbackFrames, knockbackDx, knockbackDy };
  }

  // ── Voluntary movement ─────────────────────────────────────────────────────
  let dx = 0;
  let dy = 0;

  if (intent.kind === "direction") {
    dx = intent.dx * speed;
    dy = intent.dy * speed;
  } else if (intent.kind === "target") {
    const distX = intent.tx - x;
    const distY = intent.ty - y;
    const dist = Math.hypot(distX, distY);
    if (dist < speed) {
      // Snap to target.
      return { pos: { x: intent.tx, y: intent.ty }, facing, speed, moving: false, knockbackFrames: 0, knockbackDx: 0, knockbackDy: 0 };
    }
    dx = (distX / dist) * speed;
    dy = (distY / dist) * speed;
  }

  if (dx === 0 && dy === 0) {
    return { ...state, moving: false };
  }

  // Update facing from dominant axis.
  if (Math.abs(dx) >= Math.abs(dy)) {
    facing = dx > 0 ? "right" : "left";
  } else {
    facing = dy > 0 ? "down" : "up";
  }

  // Try full move, then slide on X, then slide on Y.
  if (canOccupy(x + dx, y + dy, bounds, isWalkable)) {
    x += dx;
    y += dy;
    moving = true;
  } else if (dx !== 0 && canOccupy(x + dx, y, bounds, isWalkable)) {
    x += dx;
    moving = true;
  } else if (dy !== 0 && canOccupy(x, y + dy, bounds, isWalkable)) {
    y += dy;
    moving = true;
  }
  // If all three fail, entity is fully blocked — stay put.

  return { pos: { x, y }, facing, speed, moving, knockbackFrames: 0, knockbackDx: 0, knockbackDy: 0 };
}

// ── Interaction radius ─────────────────────────────────────────────────────────

/**
 * Returns true when two entity positions are within interaction range.
 * Default radius is 1.2 tile units — close enough to "be next to" but not
 * overlapping. Inspired by the ARPG CharacterCollisionEx contact-range system.
 */
export function withinInteractionRadius(
  a: TilePos,
  b: TilePos,
  radius = 1.2,
): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) <= radius;
}

// ── Controller (stateful wrapper) ─────────────────────────────────────────────

/**
 * Stateful wrapper around `stepMovement` for React integration.
 * Holds movement state and a stable `tick()` method you can call from a
 * `requestAnimationFrame` loop or a fixed-rate interval.
 *
 * Usage:
 *   const ctrl = new NiakofaMovementController(startX, startY, isWalkable);
 *   ctrl.setIntent({ kind: "direction", dx: 1, dy: 0 });
 *   function loop() { ctrl.tick(); setState(ctrl.snapshot()); requestAnimationFrame(loop); }
 */
export class NiakofaMovementController {
  private _state: NiakofaMovementState;
  private _intent: MoveIntent = { kind: "none" };
  private readonly _isWalkable: TileWalkable;
  private readonly _bounds: EntityBounds;

  constructor(
    startX: number,
    startY: number,
    isWalkable: TileWalkable,
    bounds: EntityBounds = DEFAULT_BOUNDS,
  ) {
    this._state = makeMovementState(startX, startY);
    this._isWalkable = isWalkable;
    this._bounds = bounds;
  }

  setIntent(intent: MoveIntent): void {
    this._intent = intent;
  }

  applyKnockback(dx: number, dy: number, frames = 8): void {
    this._state = {
      ...this._state,
      knockbackFrames: frames,
      knockbackDx: dx,
      knockbackDy: dy,
    };
  }

  tick(): void {
    this._state = stepMovement(this._state, this._intent, this._isWalkable, this._bounds);
  }

  snapshot(): Readonly<NiakofaMovementState> {
    return this._state;
  }

  get pos(): TilePos {
    return this._state.pos;
  }

  get facing(): MoveFacing {
    return this._state.facing;
  }

  get moving(): boolean {
    return this._state.moving;
  }

  /**
   * Converts fractional tile position to pixel position in the game canvas.
   * @param tileSize — rendered tile size in pixels (e.g. 64)
   */
  toPixel(tileSize: number): { px: number; py: number } {
    return {
      px: this._state.pos.x * tileSize,
      py: this._state.pos.y * tileSize,
    };
  }

  /**
   * Returns which entities (by index) are within interaction radius.
   */
  findNearby(targets: TilePos[], radius = 1.2): number[] {
    return targets.reduce<number[]>((acc, t, i) => {
      if (withinInteractionRadius(this._state.pos, t, radius)) acc.push(i);
      return acc;
    }, []);
  }
}
