/**
 * Extension of legacy-character-engine.ts's asset registry with an
 * enforced hand-drawn-art requirement for protagonist/antagonist roles.
 *
 * This file is additive: it does not replace legacy-character-engine.ts,
 * it wraps it. Every currently-registered RPG-Maker-style asset becomes
 * `artTier: "prototypePixel"` and stays valid for background NPCs and
 * internal prototyping — it is simply no longer eligible for Kwame, any
 * playable ancestor, or any named antagonist.
 *
 * Family facts still stay in the vault. This module resolves a visual
 * runtime representation only, and never infers identity, history, or
 * gender — same boundary the base engine already documents.
 */

import type {
  LegacyAssetRecord,
  LegacyWalkingAppearance,
} from "@/lib/legacy-character-engine";

export type LegacyArtTier = "handDrawn" | "prototypePixel";

export type LegacyCharacterRole =
  | "protagonist"   // Kwame Mensah, any playable ancestor
  | "antagonist"
  | "namedNPC"       // e.g. Uncle Kofi, Mama — has dialogue and a name
  | "background";    // unnamed crowd/filler

/** Extends the base registry record with the art-tier this asset was produced at. */
export interface TieredAssetRecord extends LegacyAssetRecord {
  artTier: LegacyArtTier;
}

const ROLE_REQUIRES_HAND_DRAWN: Record<LegacyCharacterRole, boolean> = {
  protagonist: true,
  antagonist: true,
  namedNPC: false,
  background: false,
};

export class HandDrawnArtRequiredError extends Error {
  constructor(characterId: string, role: LegacyCharacterRole) {
    super(
      `Character "${characterId}" has role "${role}", which requires ` +
        `artTier "handDrawn". No hand-drawn asset is registered for this ` +
        `character yet — see docs/ARCHITECTURE_PLAN.md §5 for the rollout ` +
        `order to close this gap. Refusing to silently fall back to a ` +
        `prototype sprite for a ${role}.`
    );
    this.name = "HandDrawnArtRequiredError";
  }
}

/**
 * Wraps a base appearance resolution with the role→art-tier policy.
 *
 * @param characterId  stable id, e.g. "kwame-mensah"
 * @param role         narrative role — determines whether handDrawn is mandatory
 * @param resolved     the appearance already resolved by the base engine
 * @param assetTiers   artTier lookup for each assetId used in `resolved`
 * @param mode         "strict" throws (use in production builds / CI);
 *                      "flagged" returns a placeholder marker instead of
 *                      throwing (use in local dev so the scene still renders,
 *                      visibly incomplete, instead of crashing the app)
 */
export function enforceArtTierPolicy(
  characterId: string,
  role: LegacyCharacterRole,
  resolved: LegacyWalkingAppearance | null,
  assetTiers: Map<string, LegacyArtTier>,
  mode: "strict" | "flagged" = "flagged"
): LegacyWalkingAppearance | { placeholder: true; characterId: string; role: LegacyCharacterRole } | null {
  if (!resolved) return null;
  if (!ROLE_REQUIRES_HAND_DRAWN[role]) return resolved;

  const allHandDrawn = resolved.layers.every(
    (layer: { assetId: string }) => assetTiers.get(layer.assetId) === "handDrawn"
  );
  if (allHandDrawn) return resolved;

  if (mode === "strict") {
    throw new HandDrawnArtRequiredError(characterId, role);
  }
  // Dev-mode: render a clearly-marked placeholder rather than the
  // prototype pixel sprite, so nobody mistakes it for finished art.
  return { placeholder: true, characterId, role };
}
