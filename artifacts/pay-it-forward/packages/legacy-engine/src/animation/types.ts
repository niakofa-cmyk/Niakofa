export interface HitboxDef {
  x: number;
  y: number;
  width: number;
  height: number;
  damage: number;
  knockback: number;
  /** Optional stagger applied to the target regardless of their HP. */
  stagger?: boolean;
}

/**
 * AnimationClip
 * -------------
 * Exactly the shape described in the design doc:
 *   frames, hitFrames: [6,7,8], hitbox: {...}, damage, knockback
 * The frame-by-frame timing (wind-up / active / recovery) is *derived*
 * from hitFrames rather than hand-authored separately, so an artist only
 * has to say "the hitbox is live on frames 6-8" and wind-up/recovery fall
 * out automatically.
 */
export interface AnimationClip {
  id: string;
  /** Total frame count in the clip. */
  frameCount: number;
  /** How long each frame is shown, in milliseconds. */
  frameDurationMs: number;
  /** Frame indices (1-based, matching the doc's convention) where the hitbox is active. */
  hitFrames?: number[];
  hitbox?: HitboxDef;
  /** Does this clip loop (idle/walk) or play once and hand control back (attack/hurt)? */
  loop: boolean;
  /** Optional atlas frame name pattern, e.g. "kwame_attack_01_{n}.png" */
  atlasPrefix?: string;
}

export interface SpriteAtlasDef {
  characterId: string;
  /** Canonical scale rule: pixels-per-unit so every character lines up on the same grid. */
  pixelsPerUnit: number;
  clips: Record<string, AnimationClip>;
}

export function clipPhaseAtFrame(
  clip: AnimationClip,
  frame: number
): "windup" | "active" | "recovery" | "sustained" {
  if (!clip.hitFrames || clip.hitFrames.length === 0) return "sustained"; // idle/walk have no hit window
  const first = clip.hitFrames[0]!;
  const last = clip.hitFrames[clip.hitFrames.length - 1]!;
  if (frame < first) return "windup";
  if (frame >= first && frame <= last) return "active";
  return "recovery";
}
