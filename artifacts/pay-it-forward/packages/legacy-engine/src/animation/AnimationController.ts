import type { SpriteAtlas } from "./SpriteAtlas.js";
import type { AnimationClip } from "./types.js";
import { clipPhaseAtFrame } from "./types.js";

export interface AnimationControllerContract {
  onFrameChanged(cb: (frame: number) => void): () => void;
  onClipComplete(cb: (clipId: string) => void): () => void;
}

/**
 * AnimationController
 * --------------------
 * "Kwame's actual hand-drawn animation determines when the attack is
 * dangerous" - this is that mechanism. It never decides gameplay outcomes
 * itself (no damage math, no collision) - it only tells CombatController
 * "hitbox is live right now, here's its geometry", frame-accurately, at a
 * fixed fps derived from clip.frameDurationMs so it's identical whether
 * the game renders at 30fps or 144fps.
 */
export class AnimationController implements AnimationControllerContract {
  private atlas: SpriteAtlas;
  private clip: AnimationClip;
  private currentFrame = 1; // 1-based, matches the design doc's frame numbering
  private elapsedMsInFrame = 0;
  private completed = false;

  private frameListeners = new Set<(frame: number) => void>();
  private completeListeners = new Set<(clipId: string) => void>();

  constructor(atlas: SpriteAtlas, initialClipId: string) {
    this.atlas = atlas;
    this.clip = atlas.getClip(initialClipId);
  }

  get clipId(): string {
    return this.clip.id;
  }

  get frame(): number {
    return this.currentFrame;
  }

  get isComplete(): boolean {
    return this.completed;
  }

  /** True only during frames where clip.hitFrames includes the current frame. */
  get isHitboxActive(): boolean {
    return !!this.clip.hitFrames?.includes(this.currentFrame);
  }

  get phase(): "windup" | "active" | "recovery" | "sustained" {
    return clipPhaseAtFrame(this.clip, this.currentFrame);
  }

  get hitbox() {
    return this.isHitboxActive ? this.clip.hitbox : undefined;
  }

  /** Switch clips, resetting playback. No-op if already playing this clip and it loops. */
  play(clipId: string, opts: { restartIfSame?: boolean } = {}): void {
    if (clipId === this.clip.id && this.clip.loop && !opts.restartIfSame) return;
    this.clip = this.atlas.getClip(clipId);
    this.currentFrame = 1;
    this.elapsedMsInFrame = 0;
    this.completed = false;
    this.frameListeners.forEach((cb) => cb(this.currentFrame));
  }

  tick(dtSeconds: number): void {
    if (this.completed && !this.clip.loop) return;
    this.elapsedMsInFrame += dtSeconds * 1000;

    while (this.elapsedMsInFrame >= this.clip.frameDurationMs) {
      this.elapsedMsInFrame -= this.clip.frameDurationMs;
      this.advanceFrame();
    }
  }

  private advanceFrame(): void {
    if (this.currentFrame >= this.clip.frameCount) {
      if (this.clip.loop) {
        this.currentFrame = 1;
      } else {
        this.completed = true;
        this.completeListeners.forEach((cb) => cb(this.clip.id));
        return; // hold on the last frame
      }
    } else {
      this.currentFrame += 1;
    }
    this.frameListeners.forEach((cb) => cb(this.currentFrame));
  }

  onFrameChanged(cb: (frame: number) => void): () => void {
    this.frameListeners.add(cb);
    return () => this.frameListeners.delete(cb);
  }

  onClipComplete(cb: (clipId: string) => void): () => void {
    this.completeListeners.add(cb);
    return () => this.completeListeners.delete(cb);
  }
}
