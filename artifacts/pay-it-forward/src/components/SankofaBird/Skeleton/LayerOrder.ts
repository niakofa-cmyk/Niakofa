/**
 * SankofaBird/Skeleton/LayerOrder.ts
 *
 * Canonical SVG render order for the Sankofa Bird.
 * Components MUST be composed in this order inside <svg> for correct occlusion.
 * Changing this list changes what appears in front — consult before reordering.
 */

export const LAYER_ORDER = [
  // ── Background / depth ──────────────────────────────────────────────────
  "Shadow",          // ground shadow ellipse (altitude illusion)
  "GlowLayer",       // ambient bioluminescent halo (behind everything)

  // ── Tail ────────────────────────────────────────────────────────────────
  "Tail",            // all tail rectrice paths (center, outer, far)

  // ── Wings (drawn before body so body overlaps leading edge) ─────────────
  "RightWing",       // right wing body + all right feather layers
  "LeftWing",        // left wing body + all left feather layers
  "WingJoints",      // wing-joint shoulder highlights
  "Scapulars",       // scapular shoulder feathers

  // ── Body (drawn after wings to occlude wing roots) ──────────────────────
  "BodyGroup",       // body ellipse, chest, back, belly, 11 body feathers

  // ── Head group (drawn last = on top) ─────────────────────────────────────
  "Neck",            // neck stroke + S-wave segments + top sheen
  "Head",            // head circle
  "Crest",           // crown feathers 1-5 + crown-tip catchlights
  "Eye",             // iris, pupil, catchlights, eyelids, nictitating membrane
  "Beak",            // upper + lower beak + gloss + glint
  "ChirpRings",      // SVG chirp-ring-1/2/3 (from beak tip)
  "Egg",             // counter-rotation wrapper + egg + orbit particles + thermal

  // ── Legs (below body in field, rendered after for depth cue) ────────────
  "Legs",            // both legs + toes + talons + knee joints

  // ── Effect overlays (rendered last = always visible) ─────────────────────
  "DustMotes",       // idle dust + walk-dust particles
  "AdinkraOverlay",  // Adinkra / Kente trust-tier pattern overlays
] as const;

export type LayerName = typeof LAYER_ORDER[number];
