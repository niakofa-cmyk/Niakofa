/**
 * SpiritAnimal/SpiritEnvironmentProvider.tsx
 *
 * Injects per-spirit-animal CSS custom properties into the document root
 * whenever the user's selected spirit animal changes. This is what makes
 * the entire app feel different for each animal — not just the avatar.
 *
 * Panther → shadows deepen, transitions slow, everything becomes more deliberate.
 * Bird    → surfaces lift, teal glimmers, transitions glide.
 * Lion    → warm gold everywhere, typography sharpens, bold authority.
 * etc.
 *
 * Components consume:
 *   var(--spirit-accent)          — primary accent colour
 *   var(--spirit-surface-tint)    — subtle background tint (rgba)
 *   var(--spirit-shadow-intensity)— scale multiplier for drop-shadows
 *   var(--spirit-shadow-blur)     — shadow blur radius
 *   var(--spirit-transition-dur)  — base transition duration
 *   var(--spirit-transition-ease) — base easing curve
 *   var(--spirit-font-weight)     — base font-weight (Lion bumps to 600)
 *   var(--spirit-border-tint)     — card/input border tint
 *   var(--spirit-backdrop-blur)   — backdrop-filter blur value
 *   var(--spirit-bg-gradient)     — ambient radial gradient on page bg
 *   var(--spirit-nav-glow)        — bottom-nav glow ring colour
 *   var(--spirit-particle-color)  — ambient particle / mote colour
 *   var(--spirit-anim-speed)      — global animation speed multiplier
 *
 * Usage: wrap near the root of the app, INSIDE AppProvider so it can read
 * currentUser.spirit_animal from context.
 */

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { useAppContext } from "@/lib/AppContext";
import { getSpiritEnvironment } from "./environments";
import { SPIRIT_ANIMAL_IDS, type SpiritAnimalId } from "./types";

const STYLE_ID = "spirit-env-vars";

function isValidSpiritAnimalId(v: unknown): v is SpiritAnimalId {
  return typeof v === "string" && (SPIRIT_ANIMAL_IDS as readonly string[]).includes(v);
}

export function SpiritEnvironmentProvider({ children }: { children: ReactNode }) {
  const { currentUser } = useAppContext();
  const prevSpeciesRef = useRef<SpiritAnimalId | null>(null);

  const species: SpiritAnimalId = isValidSpiritAnimalId(
    (currentUser as unknown)?.spirit_animal
  )
    ? ((currentUser as unknown).spirit_animal as SpiritAnimalId)
    : "sankofa_bird";

  useEffect(() => {
    if (prevSpeciesRef.current === species) return;
    prevSpeciesRef.current = species;

    const env = getSpiritEnvironment(species);

    // Build the CSS variable declarations
    const varBlock = Object.entries(env.cssVars)
      .map(([k, v]) => `  ${k}: ${v};`)
      .join("\n");

    // Also expose particle colour and species id as vars
    const css = `:root {\n${varBlock}\n  --spirit-particle-color: ${env.particleColor};\n  --spirit-species: "${species}";\n}\n`;

    // Inject or update the <style> tag
    let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement("style");
      el.id = STYLE_ID;
      document.head.appendChild(el);
    }
    el.textContent = css;

    // Apply a data attribute to <html> for CSS selectors in component stylesheets
    document.documentElement.setAttribute("data-spirit", species);

    // Background darkening for panther
    if (env.darkenBackground) {
      document.documentElement.setAttribute("data-spirit-dark", "true");
    } else {
      document.documentElement.removeAttribute("data-spirit-dark");
    }
  }, [species]);

  return <>{children}</>;
}
