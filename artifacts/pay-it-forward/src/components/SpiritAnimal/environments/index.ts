/**
 * SpiritAnimal/environments/index.ts
 *
 * Per-species environment configurations.
 *
 * Each animal "owns an entire environment" — not just a different skin,
 * but a different world. Selecting Panther darkens shadows and slows
 * transitions. Selecting Bird adds sky-gradient tints and quick glides.
 * Selecting Elephant warms the earth-tone palette and steadies the rhythm.
 *
 * These configs are injected as CSS custom properties by SpiritEnvironmentProvider.
 * Every component in the app can read them via var(--spirit-*) — no prop drilling.
 */

import type { SpiritAnimalId } from "../types";

export interface SpiritEnvironmentConfig {
  /** Short atmospheric description (used in debug overlays). */
  atmosphere: string;
  /** CSS custom properties injected at :root when this animal is active.
   *  Use only --spirit-* namespace to avoid collisions with Tailwind tokens. */
  cssVars: Record<string, string>;
  /** Particle system colour (for ambient motes / feathers / dust). */
  particleColor: string;
  /** Ambient particle shape hint for the future particle engine. */
  particleShape: "feather" | "dust" | "leaf" | "water" | "ember";
  /** Whether the overall app should feel darker. */
  darkenBackground: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sankofa Bird
// lighter · floating · flowing · graceful
// sky gradients · floating particles · feathers · brighter · wind
// ─────────────────────────────────────────────────────────────────────────────
const BIRD: SpiritEnvironmentConfig = {
  atmosphere: "Sky gradients · floating feathers · teal wind",
  particleColor: "#0fe5d4",
  particleShape: "feather",
  darkenBackground: false,
  cssVars: {
    "--spirit-surface-tint":      "rgba(15, 229, 212, 0.028)",
    "--spirit-accent-hsl":        "174 94% 55%",
    "--spirit-accent":            "#0fe5d4",
    "--spirit-shadow-intensity":  "0.45",
    "--spirit-shadow-blur":       "14px",
    "--spirit-shadow-color":      "rgba(15, 229, 212, 0.12)",
    "--spirit-transition-dur":    "260ms",
    "--spirit-transition-ease":   "cubic-bezier(0.22, 0.61, 0.36, 1)",
    "--spirit-border-tint":       "rgba(15, 229, 212, 0.14)",
    "--spirit-backdrop-blur":     "14px",
    "--spirit-font-weight":       "400",
    "--spirit-bg-gradient":       "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(15,229,212,0.06) 0%, transparent 70%)",
    "--spirit-particle-density":  "0.8",
    "--spirit-anim-speed":        "1.05",
    "--spirit-nav-glow":          "rgba(15, 229, 212, 0.18)",
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Black Panther
// quieter · smoother · lower to the ground · amber eyes · moonlit
// ─────────────────────────────────────────────────────────────────────────────
const PANTHER: SpiritEnvironmentConfig = {
  atmosphere: "Moonlit shadows · amber glow · low breathing dust",
  particleColor: "#FFD700",
  particleShape: "dust",
  darkenBackground: true,
  cssVars: {
    "--spirit-surface-tint":      "rgba(20, 10, 0, 0.07)",
    "--spirit-accent-hsl":        "45 100% 50%",
    "--spirit-accent":            "#FFD700",
    "--spirit-shadow-intensity":  "1.55",
    "--spirit-shadow-blur":       "22px",
    "--spirit-shadow-color":      "rgba(255, 215, 0, 0.08)",
    "--spirit-transition-dur":    "480ms",
    "--spirit-transition-ease":   "cubic-bezier(0.16, 1, 0.3, 1)",
    "--spirit-border-tint":       "rgba(255, 215, 0, 0.1)",
    "--spirit-backdrop-blur":     "20px",
    "--spirit-font-weight":       "400",
    "--spirit-bg-gradient":       "radial-gradient(ellipse 90% 60% at 50% 110%, rgba(255,215,0,0.04) 0%, rgba(10,8,2,0.12) 60%, transparent 100%)",
    "--spirit-particle-density":  "0.4",
    "--spirit-anim-speed":        "0.88",
    "--spirit-nav-glow":          "rgba(255, 215, 0, 0.15)",
    "--spirit-surface-darken":    "brightness(0.96) saturate(0.9)",
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// African Elephant
// warm earth · trees · dust · footsteps · sunrise
// grounded · steady · unhurried · ancient wisdom
// ─────────────────────────────────────────────────────────────────────────────
const ELEPHANT: SpiritEnvironmentConfig = {
  atmosphere: "Warm earth · dust motes · sunrise amber",
  particleColor: "#D2691E",
  particleShape: "dust",
  darkenBackground: false,
  cssVars: {
    "--spirit-surface-tint":      "rgba(180, 110, 40, 0.04)",
    "--spirit-accent-hsl":        "30 72% 52%",
    "--spirit-accent":            "#CD8542",
    "--spirit-shadow-intensity":  "0.85",
    "--spirit-shadow-blur":       "18px",
    "--spirit-shadow-color":      "rgba(160, 90, 20, 0.15)",
    "--spirit-transition-dur":    "400ms",
    "--spirit-transition-ease":   "cubic-bezier(0.33, 1, 0.68, 1)",
    "--spirit-border-tint":       "rgba(200, 130, 60, 0.12)",
    "--spirit-backdrop-blur":     "10px",
    "--spirit-font-weight":       "400",
    "--spirit-bg-gradient":       "radial-gradient(ellipse 100% 50% at 50% 100%, rgba(200,130,50,0.07) 0%, transparent 70%)",
    "--spirit-particle-density":  "0.6",
    "--spirit-anim-speed":        "0.92",
    "--spirit-nav-glow":          "rgba(200, 130, 60, 0.18)",
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Lion
// golden savannah · warm lighting · banners · stronger typography
// sovereign authority · bold · patrols
// ─────────────────────────────────────────────────────────────────────────────
const LION: SpiritEnvironmentConfig = {
  atmosphere: "Golden savannah · warm light · bold sovereignty",
  particleColor: "#DAA520",
  particleShape: "ember",
  darkenBackground: false,
  cssVars: {
    "--spirit-surface-tint":      "rgba(218, 165, 32, 0.05)",
    "--spirit-accent-hsl":        "43 74% 49%",
    "--spirit-accent":            "#DAA520",
    "--spirit-shadow-intensity":  "1.0",
    "--spirit-shadow-blur":       "16px",
    "--spirit-shadow-color":      "rgba(218, 165, 32, 0.18)",
    "--spirit-transition-dur":    "320ms",
    "--spirit-transition-ease":   "cubic-bezier(0.34, 1.56, 0.64, 1)",
    "--spirit-border-tint":       "rgba(218, 165, 32, 0.18)",
    "--spirit-backdrop-blur":     "10px",
    "--spirit-font-weight":       "600",
    "--spirit-bg-gradient":       "radial-gradient(ellipse 100% 70% at 50% 100%, rgba(218,165,32,0.09) 0%, rgba(180,100,20,0.04) 50%, transparent 100%)",
    "--spirit-particle-density":  "0.5",
    "--spirit-anim-speed":        "1.0",
    "--spirit-nav-glow":          "rgba(218, 165, 32, 0.22)",
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Fish Eagle
// rivers · blue skies · distant mountains · flowing motion
// crisp · clean · wide open
// ─────────────────────────────────────────────────────────────────────────────
const FISH_EAGLE: SpiritEnvironmentConfig = {
  atmosphere: "Rivers · blue skies · distant mountains · flowing",
  particleColor: "#1E8FDC",
  particleShape: "water",
  darkenBackground: false,
  cssVars: {
    "--spirit-surface-tint":      "rgba(30, 143, 220, 0.04)",
    "--spirit-accent-hsl":        "207 74% 49%",
    "--spirit-accent":            "#1E8FDC",
    "--spirit-shadow-intensity":  "0.6",
    "--spirit-shadow-blur":       "16px",
    "--spirit-shadow-color":      "rgba(30, 143, 220, 0.12)",
    "--spirit-transition-dur":    "340ms",
    "--spirit-transition-ease":   "cubic-bezier(0.25, 0.1, 0.25, 1)",
    "--spirit-border-tint":       "rgba(30, 143, 220, 0.14)",
    "--spirit-backdrop-blur":     "12px",
    "--spirit-font-weight":       "400",
    "--spirit-bg-gradient":       "radial-gradient(ellipse 80% 60% at 50% -10%, rgba(30,143,220,0.07) 0%, transparent 70%)",
    "--spirit-particle-density":  "0.7",
    "--spirit-anim-speed":        "1.0",
    "--spirit-nav-glow":          "rgba(30, 143, 220, 0.18)",
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Registry
// ─────────────────────────────────────────────────────────────────────────────
export const SPIRIT_ENVIRONMENTS: Record<SpiritAnimalId, SpiritEnvironmentConfig> = {
  sankofa_bird:  BIRD,
  black_panther: PANTHER,
  elephant:      ELEPHANT,
  lion:          LION,
  fish_eagle:    FISH_EAGLE,
};

export function getSpiritEnvironment(id: SpiritAnimalId): SpiritEnvironmentConfig {
  return SPIRIT_ENVIRONMENTS[id] ?? BIRD;
}
