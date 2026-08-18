/**
 * PixiJS rendering adapter (reference implementation)
 * ----------------------------------------------------
 * The engine core (LivingWorld, Actor, AnimationController, CombatController)
 * has zero PixiJS imports so it can be unit-tested headlessly. This file is
 * the thin glue layer for the one place that *does* need Pixi: turning
 * Actor.position / Actor.animation.frame into on-screen sprites.
 *
 * This is written against pixi.js v8 (the version already in
 * artifacts/pay-it-forward/package.json) and is meant to be dropped into
 * legacy-chapter-world.tsx in place of its current ad-hoc sprite handling.
 *
 * Usage sketch inside a React component:
 *
 *   const app = new Application();
 *   await app.init({ resizeTo: containerRef.current });
 *   const world = new LivingWorld();
 *   const adapter = new PixiActorAdapter(app, kwameActor, "/legacy-rpg-assets/kwame/");
 *   app.ticker.add((ticker) => {
 *     world.tick(ticker.deltaMS / 1000);
 *     adapter.sync();
 *   });
 */
import "pixi.js/unsafe-eval";

import { AnimatedSprite, Assets, Container, Graphics, Texture } from "pixi.js";
import type { Actor } from "../actors/Actor.js";

const DEBUG_DRAW_HITBOXES = false;

export class PixiActorAdapter {
  readonly view: Container;
  private readonly actor: Actor;
  private readonly baseUrl: string;
  private readonly clipTextureCache = new Map<string, Texture[]>();
  private sprite: AnimatedSprite | null = null;
  private currentClipId: string | null = null;
  private debugGraphics: Graphics | null = null;

  constructor(actor: Actor, baseUrl: string) {
    this.actor = actor;
    this.baseUrl = baseUrl;
    this.view = new Container();
    if (DEBUG_DRAW_HITBOXES) {
      this.debugGraphics = new Graphics();
      this.view.addChild(this.debugGraphics);
    }
  }

  /** Preload every clip's frame textures up front (call once before first sync()). */
  async preload(clipFrameCounts: Record<string, number>): Promise<void> {
    for (const [clipId, frameCount] of Object.entries(clipFrameCounts)) {
      const urls = Array.from({ length: frameCount }, (_, i) => `${this.baseUrl}${clipId}_${i + 1}.png`);
      const textures = (await Promise.all(urls.map((u) => Assets.load(u)))) as Texture[];
      this.clipTextureCache.set(clipId, textures);
    }
  }

  /** Call once per render frame after LivingWorld.tick(). Cheap: just reads Actor state. */
  sync(): void {
    const { animation, position, facing } = this.actor;

    if (animation.clipId !== this.currentClipId) {
      this.currentClipId = animation.clipId;
      const textures = this.clipTextureCache.get(animation.clipId);
      if (textures && textures.length > 0) {
        this.sprite?.destroy();
        this.sprite = new AnimatedSprite(textures);
        this.sprite.anchor.set(0.5, 1);
        this.sprite.loop = false; // AnimationController drives frames explicitly, Pixi shouldn't auto-advance
        this.view.addChildAt(this.sprite, 0);
      }
    }

    if (this.sprite) {
      // AnimationController.frame is 1-based; Pixi's AnimatedSprite frames are 0-based.
      const frameIndex = Math.min(animation.frame - 1, this.sprite.textures.length - 1);
      this.sprite.gotoAndStop(Math.max(0, frameIndex));
      this.sprite.scale.x = facing;
    }

    this.view.position.set(position.x, position.y);

    if (this.debugGraphics) {
      this.debugGraphics.clear();
      const hurtbox = this.actor.worldHurtbox();
      this.debugGraphics
        .rect(hurtbox.x - position.x, hurtbox.y - position.y, hurtbox.width, hurtbox.height)
        .stroke({ color: 0x00ff00, width: 1 });

      if (animation.isHitboxActive && animation.hitbox) {
        const hb = animation.hitbox;
        this.debugGraphics
          .rect(hb.x * facing - hb.width / 2, hb.y - hb.height / 2, hb.width, hb.height)
          .stroke({ color: 0xff0000, width: 2 });
      }
    }
  }

  destroy(): void {
    this.sprite?.destroy();
    this.view.destroy({ children: true });
  }
}
