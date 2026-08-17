import type { AnimationClip, SpriteAtlasDef } from "./types.js";

/**
 * SpriteAtlas
 * -----------
 * Thin registry over a character's animation clip data (see types.ts).
 * Deliberately has zero rendering code - a PixiJS (or any other renderer)
 * adapter reads clip.atlasPrefix + frame index to pick the actual texture.
 * That keeps hit-frame timing testable without a renderer at all (see
 * examples/headless-simulation.ts and __tests__/combat.test.ts).
 */
export class SpriteAtlas {
  readonly characterId: string;
  readonly pixelsPerUnit: number;
  private readonly clips: Record<string, AnimationClip>;

  constructor(def: SpriteAtlasDef) {
    this.characterId = def.characterId;
    this.pixelsPerUnit = def.pixelsPerUnit;
    this.clips = def.clips;
  }

  getClip(id: string): AnimationClip {
    const clip = this.clips[id];
    if (!clip) {
      throw new Error(`SpriteAtlas(${this.characterId}): unknown clip "${id}"`);
    }
    return clip;
  }

  hasClip(id: string): boolean {
    return id in this.clips;
  }

  listClips(): string[] {
    return Object.keys(this.clips);
  }

  static fromJSON(json: SpriteAtlasDef): SpriteAtlas {
    return new SpriteAtlas(json);
  }
}
