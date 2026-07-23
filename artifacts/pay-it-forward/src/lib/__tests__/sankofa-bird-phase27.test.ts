/**
 * Phase 27 contract coverage.
 *
 * These checks are intentionally source-level: the phase is a CSS/SVG
 * composition layer, so the important regressions are missing barrel wiring,
 * selector drift, and reintroducing unsafe Safari CSS.
 */

import { describe, it } from "node:test";
import { expect } from "expect";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { sankofaBirdCss, sankofaCssPhase27 } from "../../components/sankofa-bird-css";

const wingsSource = readFileSync(
  fileURLToPath(new URL("../../components/SankofaBird/Flight/Wings.tsx", import.meta.url)),
  "utf8",
);
const rendererSource = readFileSync(
  fileURLToPath(new URL("../../components/SankofaBird/Core/Renderer.tsx", import.meta.url)),
  "utf8",
);

describe("Phase 27: living feathers and natural light", () => {
  it("is included after Phase 26 in the combined CSS", () => {
    expect(sankofaBirdCss.endsWith(sankofaCssPhase27)).toBe(true);
    expect(sankofaCssPhase27).toContain("sankofa-p27-iri-natural");
  });

  it("targets the active speed tiers and night-mode wiring", () => {
    expect(sankofaCssPhase27).toContain('[data-speed="driving"]');
    expect(sankofaCssPhase27).toContain('[data-speed="airplane"]');
    expect(sankofaCssPhase27).toContain('[data-night-mode="true"]');
    expect(sankofaCssPhase27).toContain(".sankofa-ambient-warmth");
  });

  it("covers the new SVG layer classes", () => {
    for (const selector of [
      ".sankofa-shoulder-feather",
      ".sankofa-wingtip-feather",
      ".sankofa-neck-mid-organic",
      ".sankofa-bird-iris",
    ]) {
      expect(sankofaCssPhase27).toContain(selector);
    }
  });

  it("keeps each wingtip layer inside its animated wing rig", () => {
    expect(wingsSource).toContain('<WingtipFeathers side="right" />');
    expect(wingsSource).toContain('<WingtipFeathers side="left" />');
    expect(wingsSource).toContain("className=\"sankofa-sme-wing-right-rig\"");
    expect(wingsSource).toContain("className=\"sankofa-sme-wing-left-rig\"");
    expect(rendererSource).not.toContain("<WingtipFeathers />");
  });

  it("disables new animation channels for battery saver and reduced motion", () => {
    expect(sankofaCssPhase27).toContain('[data-battery-saver="true"]');
    expect(sankofaCssPhase27).toContain("@media (prefers-reduced-motion: reduce)");
    expect(sankofaCssPhase27).toContain("animation: none !important");
  });

  it("keeps Safari-sensitive CSS constraints intact", () => {
    expect(sankofaCssPhase27).toContain("@property --p27-iri-hue");
    expect(sankofaCssPhase27).toContain("transform-box: view-box");
    expect(sankofaCssPhase27).not.toContain("`");
    expect(sankofaCssPhase27).not.toMatch(/@media[^{]*\{[\s\S]*@media/);
  });
});