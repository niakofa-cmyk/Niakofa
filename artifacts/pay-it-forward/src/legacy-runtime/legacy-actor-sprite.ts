/**
 * Bridges LegacyActorController / LegacyCombatController (pure state,
 * framework-agnostic) to an actual on-screen PixiJS sprite. This is the
 * concrete answer to "the 384-frame hand-drawn Kwame atlas becomes gameplay
 * art rather than an asset library" from the runtime update doc.
 */

import "pixi.js/unsafe-eval";

import { AnimatedSprite, Texture } from "pixi.js";
import { LegacyActorController } from "@/lib/legacy-animation-fsm";
import type { LegacyFacing } from "@/lib/legacy-animation-fsm";
import type { LegacyFullAnimState } from "@/lib/legacy-combat-fsm";
import { CharacterFrameSet, resolveFrames } from "./legacy-asset-loader";
import { TILE_SIZE_PX } from "@/lib/legacy-map-engine";

export class LegacyActorSprite {
  readonly view: AnimatedSprite;
  private frameSet: CharacterFrameSet;
  private lastKey = "";
  private lastFallbackWarned = new Set<string>();

  constructor(frameSet: CharacterFrameSet, initialTextures: Texture[]) {
    this.frameSet = frameSet;
    this.view = new AnimatedSprite(initialTextures.length ? initialTextures : [Texture.WHITE]);
    this.view.anchor.set(0.5, 1); // feet-anchored, matches scene renderer's building/prop convention
    this.view.animationSpeed = 0; // we drive frames manually from ANIM_SPEC-derived timing, not Pixi's built-in ticker speed
    this.view.loop = true;
  }

  /** Call every frame after controller.tick()/combat.tick() have updated state. */
  sync(actor: LegacyActorController, animState: LegacyFullAnimState, facing: LegacyFacing) {
    const key = `${animState}:${facing}`;
    if (key !== this.lastKey) {
      const { frames, isFallback } = resolveFrames(this.frameSet, animState, facing);
      if (frames.length) {
        this.view.textures = frames;
        this.view.gotoAndStop(0);
      }
      if (isFallback && !this.lastFallbackWarned.has(key)) {
        this.lastFallbackWarned.add(key);
        console.warn(`[legacy-actor-sprite] no hand-drawn frames for "${key}" -- using fallback frames. See ATLAS_INTEGRATION_GUIDE.md coverage table.`);
      }
      this.lastKey = key;
    }

    // Manual frame advance driven by the controller's own animFrame index,
    // so the FSM (which already computes fps/frameCount per ANIM_SPEC) stays
    // the single source of truth for timing -- Pixi just displays frame N.
    const frameIndex = Math.min(actor.state.animFrame, this.view.textures.length - 1);
    if (frameIndex >= 0) this.view.gotoAndStop(frameIndex);

    this.view.x = actor.state.x * TILE_SIZE_PX;
    this.view.y = actor.state.y * TILE_SIZE_PX;
  }
}
