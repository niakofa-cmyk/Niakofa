/**
 * Phase 27 contract coverage.
 *
 * Source-level checks: the phase is a CSS/SVG composition layer, so the
 * important regressions are missing barrel wiring, selector drift, missing
 * @property registrations, and reintroducing unsafe Safari CSS.
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

  it("registers all four @property declarations required for Safari", () => {
    expect(sankofaCssPhase27).toContain("@property --p27-iri-hue");
    expect(sankofaCssPhase27).toContain("@property --p27-shoulder-angle");
    expect(sankofaCssPhase27).toContain("@property --p27-neck-mid-opacity");
    expect(sankofaCssPhase27).toContain("@property --p27-ambient-opacity");
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
      ".sankofa-ambient-warmth",
      ".sankofa-neck-top-sheen",
    ]) {
      expect(sankofaCssPhase27).toContain(selector);
    }
  });

  it("has night-mode rules for crown, covert-band r/l, body-luminary, and dorsal-hi", () => {
    expect(sankofaCssPhase27).toContain(".sankofa-crown-feather");
    expect(sankofaCssPhase27).toContain(".sankofa-wing-covert-band-r");
    expect(sankofaCssPhase27).toContain(".sankofa-wing-covert-band-l");
    expect(sankofaCssPhase27).toContain(".sankofa-body-luminary-layer");
    expect(sankofaCssPhase27).toContain('[data-night-mode="true"][data-flying="true"] .sankofa-dorsal-hi');
  });

  it("covers aerodynamic wing-pose feather-level responses (27.9)", () => {
    expect(sankofaCssPhase27).toContain('[data-wing-pose="down"]');
    expect(sankofaCssPhase27).toContain('[data-wing-pose="up"]');
    expect(sankofaCssPhase27).toContain('[data-wing-pose="forward"]');
    expect(sankofaCssPhase27).toContain('[data-wing-pose="back"]');
    expect(sankofaCssPhase27).toContain(".sankofa-bird-wing-right-highlight");
    expect(sankofaCssPhase27).toContain(".sankofa-feather-iri-edge");
  });

  it("covers tail-pose flare and stream feather-level responses (27.9)", () => {
    expect(sankofaCssPhase27).toContain('[data-tail-pose="flare"]');
    expect(sankofaCssPhase27).toContain('[data-tail-pose="stream"]');
    expect(sankofaCssPhase27).toContain(".sankofa-tail-luminary-inner");
    expect(sankofaCssPhase27).toContain(".sankofa-tail-luminary-outer");
    expect(sankofaCssPhase27).toContain(".sankofa-tail-iri-left");
    expect(sankofaCssPhase27).toContain(".sankofa-tail-iri-right");
  });

  it("covers neck-luminary fast-speed strengthening", () => {
    expect(sankofaCssPhase27).toContain(".sankofa-neck-luminary");
  });

  it("covers activity-tier eye-scan-group speed change", () => {
    expect(sankofaCssPhase27).toContain('[data-activity="busy"]');
    expect(sankofaCssPhase27).toContain('[data-activity="peak"]');
    expect(sankofaCssPhase27).toContain(".sankofa-eye-scan-group");
    expect(sankofaCssPhase27).toContain("animation-duration: 11s");
  });

  it("covers bank-dir body-banking dorsal response", () => {
    expect(sankofaCssPhase27).toContain('[data-bank-dir="left"][data-flying="true"]');
    expect(sankofaCssPhase27).toContain('[data-bank-dir="right"][data-flying="true"]');
    expect(sankofaCssPhase27).toContain(".sankofa-dorsal-hi");
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
