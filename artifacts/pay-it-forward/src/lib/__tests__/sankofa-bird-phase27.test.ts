/**
 * Phase 27 contract coverage.
 *
 * These checks are intentionally source-level: the phase is a CSS/SVG
 * composition layer, so the important regressions are missing barrel wiring,
 * selector drift, and reintroducing unsafe Safari CSS.
 */

import { describe, it } from "node:test";
import { expect } from "expect";
import { sankofaBirdCss, sankofaCssPhase27 } from "../../components/sankofa-bird-css";

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