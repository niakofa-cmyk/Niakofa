/**
 * LegacyChapterEnvironment — CSS-painted chapter scene environments
 *
 * Visual Runtime Bible: "hand-drawn characters + painted environments +
 * layered foreground/midground/background depth + authored lighting and weather".
 *
 * Each chapter gets a unique painted CSS scene — no external images required.
 * Layers: sky → horizon glow → terrain → midground elements → foreground.
 */

import type { DemoPhase, DemoSeason } from "@/lib/legacy-demo-state";

// ── Scene definitions per phase ────────────────────────────────────────────────

type ScenePainting = {
  skyTop: string;
  skyBot: string;
  horizon: string;
  groundTop: string;
  groundBot: string;
  label: string;
  era: string;
  // SVG elements painted inline (paths, circles, rects)
  elements: Array<{
    type: "rect" | "ellipse" | "path" | "circle";
    attrs: Record<string, string | number>;
  }>;
};

const SCENES: Partial<Record<DemoPhase, ScenePainting>> = {
  prologue: {
    skyTop: "#1a0d07",
    skyBot: "#2c1208",
    horizon: "#7a3b10",
    groundTop: "#3d2010",
    groundBot: "#1a0d07",
    label: "Grandma's Sunday House",
    era: "Present Day",
    elements: [
      // Warm interior light windows
      { type: "rect", attrs: { x: 30, y: 55, width: 18, height: 22, rx: 3, fill: "#f5c84244" } },
      { type: "rect", attrs: { x: 88, y: 60, width: 14, height: 18, rx: 3, fill: "#f5c84233" } },
      // House outline
      { type: "path", attrs: { d: "M10 85 L10 52 L35 30 L65 30 L90 52 L90 85Z", fill: "#3d1e0c", stroke: "#5a2e14", "strokeWidth": 1.5 } },
      // Roof
      { type: "path", attrs: { d: "M8 54 L35 28 L65 28 L92 54Z", fill: "#2a1508", stroke: "#8b5a2b", "strokeWidth": 1 } },
      // Door
      { type: "rect", attrs: { x: 42, y: 62, width: 16, height: 23, rx: 2, fill: "#1a0a04", stroke: "#8b5a2b", "strokeWidth": 1 } },
      // Mango tree (left)
      { type: "path", attrs: { d: "M155 90 C153 70 157 55 155 38", stroke: "#4a2e14", "strokeWidth": 7, fill: "none", "strokeLinecap": "round" } },
      { type: "ellipse", attrs: { cx: 155, cy: 32, rx: 22, ry: 16, fill: "#2d5a1e", opacity: 0.85 } },
      { type: "ellipse", attrs: { cx: 145, cy: 28, rx: 14, ry: 11, fill: "#3a7025", opacity: 0.7 } },
      // Stars/fireflies
      { type: "circle", attrs: { cx: 120, cy: 18, r: 1.5, fill: "#f5c842", opacity: 0.7 } },
      { type: "circle", attrs: { cx: 140, cy: 12, r: 1, fill: "#f5c842", opacity: 0.5 } },
      { type: "circle", attrs: { cx: 170, cy: 22, r: 1.5, fill: "#f5c842", opacity: 0.6 } },
    ],
  },
  chapter1: {
    skyTop: "#2d1a06",
    skyBot: "#4a2a0a",
    horizon: "#c47a20",
    groundTop: "#5c3510",
    groundBot: "#2a1608",
    label: "The Mensah Family Compound",
    era: "1890 · Cocoa Country",
    elements: [
      // Sun
      { type: "circle", attrs: { cx: 155, cy: 25, r: 14, fill: "#f5c84288" } },
      { type: "circle", attrs: { cx: 155, cy: 25, r: 10, fill: "#f5c842cc" } },
      // Cocoa tree left
      { type: "path", attrs: { d: "M22 90 C20 68 24 50 22 32", stroke: "#3d2010", "strokeWidth": 8, fill: "none", "strokeLinecap": "round" } },
      { type: "ellipse", attrs: { cx: 22, cy: 26, rx: 25, ry: 18, fill: "#1e4015" } },
      { type: "ellipse", attrs: { cx: 10, cy: 22, rx: 14, ry: 10, fill: "#2a5520" } },
      // Cocoa tree right
      { type: "path", attrs: { d: "M168 90 C166 68 170 50 168 35", stroke: "#3d2010", "strokeWidth": 8, fill: "none", "strokeLinecap": "round" } },
      { type: "ellipse", attrs: { cx: 168, cy: 29, rx: 22, ry: 16, fill: "#1e4015" } },
      // Family compound roof
      { type: "path", attrs: { d: "M55 75 L55 48 L100 28 L145 48 L145 75Z", fill: "#4a2810", stroke: "#7a4a1e", "strokeWidth": 1.5 } },
      { type: "path", attrs: { d: "M53 50 L100 26 L147 50Z", fill: "#2a1808", stroke: "#9a6a2e", "strokeWidth": 1.5 } },
      // Cocoa pods on trees
      { type: "ellipse", attrs: { cx: 18, cy: 42, rx: 4, ry: 6, fill: "#c47a20", opacity: 0.8, transform: "rotate(-20 18 42)" } },
      { type: "ellipse", attrs: { cx: 28, cy: 36, rx: 3, ry: 5, fill: "#e8a030", opacity: 0.7, transform: "rotate(10 28 36)" } },
      // Dirt path
      { type: "path", attrs: { d: "M80 90 Q100 80 100 70", stroke: "#8b5a2b", "strokeWidth": 8, fill: "none", opacity: 0.5 } },
    ],
  },
  chapter2: {
    skyTop: "#1a2d08",
    skyBot: "#2d4a10",
    horizon: "#a0c830",
    groundTop: "#3d5a10",
    groundBot: "#1a2808",
    label: "The Market Road",
    era: "1901–1911 · Golden Years",
    elements: [
      // Bright sky
      { type: "circle", attrs: { cx: 160, cy: 20, r: 16, fill: "#f5f0c0aa" } },
      { type: "circle", attrs: { cx: 160, cy: 20, r: 12, fill: "#f5f0c0dd" } },
      // Market tent left
      { type: "path", attrs: { d: "M10 90 L10 55 L40 40 L70 55 L70 90Z", fill: "#4a1e0a", stroke: "#8b3a14", "strokeWidth": 1.5 } },
      { type: "path", attrs: { d: "M8 57 L40 38 L72 57Z", fill: "#c43c14", opacity: 0.8 } },
      // Market tent right
      { type: "path", attrs: { d: "M110 90 L110 55 L140 40 L170 55 L170 90Z", fill: "#4a1e0a", stroke: "#8b3a14", "strokeWidth": 1.5 } },
      { type: "path", attrs: { d: "M108 57 L140 38 L172 57Z", fill: "#c48c14", opacity: 0.8 } },
      // Trading goods on ground
      { type: "circle", attrs: { cx: 50, cy: 80, r: 5, fill: "#c47a20" } },
      { type: "circle", attrs: { cx: 60, cy: 82, r: 4, fill: "#8b5a2b" } },
      { type: "circle", attrs: { cx: 42, cy: 83, r: 4, fill: "#c43c14" } },
      // People silhouettes
      { type: "ellipse", attrs: { cx: 85, cy: 68, rx: 5, ry: 12, fill: "#2a1005" } },
      { type: "circle", attrs: { cx: 85, cy: 55, r: 5, fill: "#3d2010" } },
      { type: "ellipse", attrs: { cx: 100, cy: 70, rx: 5, ry: 11, fill: "#2a1005" } },
      { type: "circle", attrs: { cx: 100, cy: 57, r: 4.5, fill: "#3d2010" } },
      // Lush canopy
      { type: "ellipse", attrs: { cx: 90, cy: 25, rx: 30, ry: 18, fill: "#1e4015", opacity: 0.75 } },
    ],
  },
  chapter3: {
    skyTop: "#0a1520",
    skyBot: "#1a2a38",
    horizon: "#3a5570",
    groundTop: "#1a2810",
    groundBot: "#0a1408",
    label: "The Village Under Pressure",
    era: "1912–1920 · Betrayal",
    elements: [
      // Storm clouds
      { type: "ellipse", attrs: { cx: 60, cy: 20, rx: 40, ry: 16, fill: "#1a2a38", opacity: 0.9 } },
      { type: "ellipse", attrs: { cx: 120, cy: 15, rx: 50, ry: 14, fill: "#1a2a38", opacity: 0.85 } },
      { type: "ellipse", attrs: { cx: 160, cy: 22, rx: 30, ry: 12, fill: "#253544", opacity: 0.8 } },
      // Dark compound, leaning
      { type: "path", attrs: { d: "M55 90 L58 52 L100 30 L142 52 L145 90Z", fill: "#2a1808", stroke: "#4a2e18", "strokeWidth": 1.5 } },
      { type: "path", attrs: { d: "M53 54 L100 28 L147 54Z", fill: "#1a1008", stroke: "#3a2010", "strokeWidth": 1.5 } },
      // Broken fence
      { type: "path", attrs: { d: "M10 75 L30 72 L32 88 M32 72 L32 88", stroke: "#4a2e14", "strokeWidth": 2.5, fill: "none" } },
      { type: "path", attrs: { d: "M34 70 L50 74 L50 88", stroke: "#4a2e14", "strokeWidth": 2, fill: "none", opacity: 0.7 } },
      // Dark spindly tree
      { type: "path", attrs: { d: "M160 90 C158 68 162 45 158 28", stroke: "#2a1808", "strokeWidth": 6, fill: "none" } },
      { type: "path", attrs: { d: "M158 52 C148 42 138 40 128 38", stroke: "#2a1808", "strokeWidth": 3, fill: "none" } },
      { type: "path", attrs: { d: "M160 44 C168 34 174 30 178 26", stroke: "#2a1808", "strokeWidth": 2.5, fill: "none" } },
      // Moon glow
      { type: "circle", attrs: { cx: 22, cy: 18, r: 8, fill: "#7090a0aa" } },
      { type: "circle", attrs: { cx: 22, cy: 18, r: 6, fill: "#90b0c0cc" } },
    ],
  },
  chapter4: {
    skyTop: "#120a04",
    skyBot: "#1e0e06",
    horizon: "#5a3520",
    groundTop: "#2a1808",
    groundBot: "#0e0804",
    label: "The Road After Collapse",
    era: "1920–1930 · What Remains",
    elements: [
      // Grey sky with smoke
      { type: "ellipse", attrs: { cx: 90, cy: 18, rx: 60, ry: 14, fill: "#2a1a10", opacity: 0.8 } },
      // Collapsed building
      { type: "path", attrs: { d: "M45 90 L42 70 L65 55 L95 60 L98 90Z", fill: "#1a0c06", stroke: "#3a1e08", "strokeWidth": 1.5 } },
      { type: "path", attrs: { d: "M40 72 L65 52 L100 62", stroke: "#2a1005", "strokeWidth": 2, fill: "none", opacity: 0.8 } },
      // Rubble
      { type: "rect", attrs: { x: 45, y: 82, width: 6, height: 4, rx: 1, fill: "#4a2810", transform: "rotate(-15 48 84)" } },
      { type: "rect", attrs: { x: 55, y: 80, width: 5, height: 3, rx: 1, fill: "#3a2010", transform: "rotate(8 58 82)" } },
      { type: "rect", attrs: { x: 65, y: 84, width: 7, height: 3, rx: 1, fill: "#4a2810", transform: "rotate(-5 68 86)" } },
      // Bare trees
      { type: "path", attrs: { d: "M140 90 C138 68 142 50 140 32", stroke: "#2a1808", "strokeWidth": 5, fill: "none" } },
      { type: "path", attrs: { d: "M140 55 C130 46 120 42 112 40", stroke: "#2a1808", "strokeWidth": 2.5, fill: "none" } },
      { type: "path", attrs: { d: "M140 48 C148 40 155 36 160 32", stroke: "#2a1808", "strokeWidth": 2, fill: "none" } },
      { type: "path", attrs: { d: "M22 90 C20 72 24 58 22 44", stroke: "#2a1808", "strokeWidth": 4, fill: "none" } },
      { type: "path", attrs: { d: "M22 62 C14 54 10 50 6 46", stroke: "#2a1808", "strokeWidth": 2, fill: "none" } },
      // Overgrown path
      { type: "path", attrs: { d: "M70 90 Q90 82 95 74", stroke: "#2a3810", "strokeWidth": 8, fill: "none", opacity: 0.4 } },
    ],
  },
  chapter5: {
    skyTop: "#04121e",
    skyBot: "#082038",
    horizon: "#1a5070",
    groundTop: "#0a1e30",
    groundBot: "#040e18",
    label: "Across the Ocean",
    era: "1930–1950 · Migration",
    elements: [
      // Ocean horizon
      { type: "rect", attrs: { x: 0, y: 60, width: 200, height: 30, fill: "#0a2a48", opacity: 0.9 } },
      // Wave lines
      { type: "path", attrs: { d: "M0 65 Q25 62 50 65 Q75 68 100 65 Q125 62 150 65 Q175 68 200 65", stroke: "#1a4060", "strokeWidth": 1.5, fill: "none" } },
      { type: "path", attrs: { d: "M0 70 Q25 67 50 70 Q75 73 100 70 Q125 67 150 70 Q175 73 200 70", stroke: "#1a3a58", "strokeWidth": 1, fill: "none" } },
      // Ship silhouette
      { type: "path", attrs: { d: "M60 62 L60 35 L62 35 L62 20 L64 20 L64 35 L66 35 L66 62Z", fill: "#0a1828" } },  // mast
      { type: "path", attrs: { d: "M45 62 L155 62 L150 72 L50 72Z", fill: "#0c1e30" } },  // hull
      { type: "path", attrs: { d: "M64 22 L85 35 L64 35Z", fill: "#1a2e44" } },  // sail
      // Stars
      { type: "circle", attrs: { cx: 20, cy: 12, r: 1, fill: "#90c0e0", opacity: 0.8 } },
      { type: "circle", attrs: { cx: 45, cy: 8, r: 1.2, fill: "#90c0e0", opacity: 0.7 } },
      { type: "circle", attrs: { cx: 130, cy: 10, r: 1, fill: "#90c0e0", opacity: 0.9 } },
      { type: "circle", attrs: { cx: 160, cy: 6, r: 1.2, fill: "#90c0e0", opacity: 0.75 } },
      { type: "circle", attrs: { cx: 175, cy: 15, r: 1, fill: "#90c0e0", opacity: 0.6 } },
      // Moon reflection on water
      { type: "ellipse", attrs: { cx: 100, cy: 66, rx: 8, ry: 2, fill: "#90c0e0", opacity: 0.15 } },
      // Moon
      { type: "circle", attrs: { cx: 100, cy: 20, r: 10, fill: "#c0d8f0", opacity: 0.8 } },
      { type: "circle", attrs: { cx: 104, cy: 18, r: 9, fill: "#082038" } },
    ],
  },
  chapter6: {
    skyTop: "#2a1a08",
    skyBot: "#1a0e04",
    horizon: "#8b5a20",
    groundTop: "#4a2e10",
    groundBot: "#1e1008",
    label: "The Family Vault",
    era: "Present Day · Discovery",
    elements: [
      // Warm interior (vault room)
      { type: "rect", attrs: { x: 20, y: 20, width: 160, height: 70, rx: 4, fill: "#1a0e04" } },
      // Vault chest
      { type: "rect", attrs: { x: 65, y: 50, width: 70, height: 40, rx: 4, fill: "#3d1e08", stroke: "#8b5a2b", "strokeWidth": 2 } },
      { type: "rect", attrs: { x: 65, y: 50, width: 70, height: 8, rx: "4 4 0 0", fill: "#4a2810", stroke: "#8b5a2b", "strokeWidth": 2 } },
      // Lock
      { type: "circle", attrs: { cx: 100, cy: 66, r: 5, fill: "#f5c842", opacity: 0.9 } },
      { type: "circle", attrs: { cx: 100, cy: 66, r: 3, fill: "#c8900a" } },
      // Photographs spilling out
      { type: "rect", attrs: { x: 45, y: 72, width: 18, height: 14, rx: 1, fill: "#f5f0e0", transform: "rotate(-15 54 79)" } },
      { type: "rect", attrs: { x: 140, y: 70, width: 18, height: 14, rx: 1, fill: "#f5f0e0", transform: "rotate(10 149 77)" } },
      // Glow from vault opening
      { type: "ellipse", attrs: { cx: 100, cy: 60, rx: 40, ry: 20, fill: "#f5c842", opacity: 0.08 } },
      // Candles
      { type: "rect", attrs: { x: 28, y: 70, width: 4, height: 14, rx: 1, fill: "#d4c5a0" } },
      { type: "ellipse", attrs: { cx: 30, cy: 68, rx: 3, ry: 5, fill: "#f5c842", opacity: 0.6 } },
      { type: "rect", attrs: { x: 168, y: 68, width: 4, height: 16, rx: 1, fill: "#d4c5a0" } },
      { type: "ellipse", attrs: { cx: 170, cy: 66, rx: 3, ry: 5, fill: "#f5c842", opacity: 0.5 } },
    ],
  },
  "world-regen": {
    skyTop: "#0d2818",
    skyBot: "#1a3d24",
    horizon: "#2a7040",
    groundTop: "#1e4828",
    groundBot: "#0d2010",
    label: "The Living World",
    era: "Present Day · Regeneration",
    elements: [
      // Baobab silhouette (regenerating)
      { type: "path", attrs: { d: "M95 90 C92 65 96 45 95 22", stroke: "#4a2e14", "strokeWidth": 20, fill: "none", "strokeLinecap": "round" } },
      { type: "path", attrs: { d: "M93 55 C72 38 55 30 35 22", stroke: "#3d2510", "strokeWidth": 8, fill: "none", "strokeLinecap": "round" } },
      { type: "path", attrs: { d: "M97 48 C118 32 138 24 158 18", stroke: "#3d2510", "strokeWidth": 8, fill: "none", "strokeLinecap": "round" } },
      { type: "path", attrs: { d: "M94 38 C82 24 78 14 75 8", stroke: "#3d2510", "strokeWidth": 6, fill: "none" } },
      { type: "path", attrs: { d: "M97 34 C110 20 116 10 118 6", stroke: "#3d2510", "strokeWidth": 5, fill: "none" } },
      // Canopy leaves
      { type: "ellipse", attrs: { cx: 32, cy: 18, rx: 22, ry: 14, fill: "#1e5030", opacity: 0.9 } },
      { type: "ellipse", attrs: { cx: 155, cy: 14, rx: 24, ry: 14, fill: "#1e5030", opacity: 0.9 } },
      { type: "ellipse", attrs: { cx: 75, cy: 6, rx: 18, ry: 12, fill: "#2a6040", opacity: 0.85 } },
      { type: "ellipse", attrs: { cx: 118, cy: 4, rx: 20, ry: 12, fill: "#2a6040", opacity: 0.85 } },
      // Gold memory sparks on branches
      { type: "circle", attrs: { cx: 38, cy: 14, r: 4, fill: "#f5c842", opacity: 0.75 } },
      { type: "circle", attrs: { cx: 152, cy: 10, r: 4, fill: "#f5c842", opacity: 0.7 } },
      { type: "circle", attrs: { cx: 76, cy: 4, r: 3, fill: "#f5c842", opacity: 0.8 } },
      { type: "circle", attrs: { cx: 118, cy: 2, r: 3, fill: "#f5c842", opacity: 0.75 } },
      // Ground roots
      { type: "path", attrs: { d: "M95 88 Q70 90 55 88 Q45 86 40 90", stroke: "#3a2010", "strokeWidth": 4, fill: "none", opacity: 0.6 } },
      { type: "path", attrs: { d: "M95 88 Q120 90 135 88 Q148 86 155 90", stroke: "#3a2010", "strokeWidth": 4, fill: "none", opacity: 0.6 } },
    ],
  },
  finale: {
    skyTop: "#1a0d04",
    skyBot: "#2d1808",
    horizon: "#c47a20",
    groundTop: "#3d2010",
    groundBot: "#1a0d07",
    label: "The Baobab Remembers",
    era: "Every Generation",
    elements: [
      // Gold sunrise
      { type: "circle", attrs: { cx: 100, cy: 35, r: 24, fill: "#f5c84222" } },
      { type: "circle", attrs: { cx: 100, cy: 35, r: 18, fill: "#f5c84244" } },
      { type: "circle", attrs: { cx: 100, cy: 35, r: 12, fill: "#f5c84277" } },
      { type: "circle", attrs: { cx: 100, cy: 35, r: 7, fill: "#f5c842cc" } },
      // Baobab (full bloom)
      { type: "path", attrs: { d: "M98 90 C95 62 99 42 98 18", stroke: "#5a3018", "strokeWidth": 18, fill: "none", "strokeLinecap": "round" } },
      { type: "path", attrs: { d: "M96 50 C76 36 55 28 35 18", stroke: "#4a2814", "strokeWidth": 8, fill: "none", "strokeLinecap": "round" } },
      { type: "path", attrs: { d: "M100 44 C120 30 142 22 162 16", stroke: "#4a2814", "strokeWidth": 8, fill: "none", "strokeLinecap": "round" } },
      // Full lush canopy
      { type: "ellipse", attrs: { cx: 32, cy: 14, rx: 26, ry: 18, fill: "#1e5030" } },
      { type: "ellipse", attrs: { cx: 158, cy: 12, rx: 28, ry: 18, fill: "#1e5030" } },
      { type: "ellipse", attrs: { cx: 98, cy: 10, rx: 32, ry: 20, fill: "#2a6040" } },
      // Gold blossoms (achievements)
      { type: "circle", attrs: { cx: 32, cy: 8, r: 5, fill: "#f5c842" } },
      { type: "circle", attrs: { cx: 156, cy: 6, r: 5, fill: "#f5c842" } },
      { type: "circle", attrs: { cx: 80, cy: 2, r: 4, fill: "#f5c842" } },
      { type: "circle", attrs: { cx: 115, cy: 2, r: 4, fill: "#f5c842" } },
      { type: "circle", attrs: { cx: 98, cy: 0, r: 5, fill: "#f5c842" } },
      // Family silhouettes at base
      { type: "ellipse", attrs: { cx: 60, cy: 84, rx: 6, ry: 14, fill: "#2a1005" } },
      { type: "circle", attrs: { cx: 60, cy: 68, r: 6, fill: "#3d1808" } },
      { type: "ellipse", attrs: { cx: 78, cy: 85, rx: 5, ry: 12, fill: "#2a1005" } },
      { type: "circle", attrs: { cx: 78, cy: 71, r: 5, fill: "#3d1808" } },
      { type: "ellipse", attrs: { cx: 120, cy: 85, rx: 5, ry: 13, fill: "#2a1005" } },
      { type: "circle", attrs: { cx: 120, cy: 70, r: 5.5, fill: "#3d1808" } },
      { type: "ellipse", attrs: { cx: 138, cy: 83, rx: 4, ry: 10, fill: "#2a1005" } },
      { type: "circle", attrs: { cx: 138, cy: 71, r: 4, fill: "#3d1808" } },
    ],
  },
};

// ── Season weather overlays ────────────────────────────────────────────────────

function RainOverlay() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {Array.from({ length: 18 }).map((_, i) => (
        <div
          key={i}
          className="absolute top-0 w-px legacy-rain-drop"
          style={{
            left: `${(i * 5.8 + 2) % 100}%`,
            height: `${18 + (i % 5) * 8}%`,
            background: "linear-gradient(to bottom, transparent, rgba(107,174,214,0.4), transparent)",
            animationDelay: `${(i * 0.07) % 0.8}s`,
          }}
        />
      ))}
    </div>
  );
}

function HarvestDust() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="absolute rounded-full legacy-particle-float"
          style={{
            left: `${(i * 12 + 5) % 95}%`,
            bottom: `${10 + (i % 4) * 12}%`,
            width: `${2 + (i % 3)}px`,
            height: `${2 + (i % 3)}px`,
            background: "#f5c842",
            opacity: 0.3 + (i % 3) * 0.1,
            animationDelay: `${i * 0.3}s`,
            animationDuration: `${3 + i * 0.5}s`,
          }}
        />
      ))}
    </div>
  );
}

function CelebrationSparkles() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {Array.from({ length: 12 }).map((_, i) => (
        <div
          key={i}
          className="absolute legacy-particle-float"
          style={{
            left: `${(i * 8.3 + 3) % 95}%`,
            bottom: `${5 + (i % 6) * 14}%`,
            width: "4px",
            height: "4px",
            background: i % 3 === 0 ? "#f5c842" : i % 3 === 1 ? "#ff9f43" : "#f08080",
            borderRadius: "50%",
            opacity: 0.5 + (i % 3) * 0.15,
            animationDelay: `${i * 0.2}s`,
            animationDuration: `${2.5 + i * 0.4}s`,
          }}
        />
      ))}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

interface LegacyChapterEnvironmentProps {
  phase: DemoPhase;
  season: DemoSeason;
  worldVersion: number;
  compact?: boolean;
}

export function LegacyChapterEnvironment({
  phase,
  season,
  worldVersion,
  compact = false,
}: LegacyChapterEnvironmentProps) {
  const scene = SCENES[phase];
  if (!scene) return null;

  const height = compact ? 88 : 110;

  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-amber-800/25"
      style={{
        height,
        background: `linear-gradient(180deg, ${scene.skyTop} 0%, ${scene.skyBot} 45%, ${scene.horizon}40 65%, ${scene.groundTop} 75%, ${scene.groundBot} 100%)`,
      }}
      aria-label={`Scene painting: ${scene.label}, ${scene.era}`}
      role="img"
    >
      {/* SVG scene elements */}
      <svg
        viewBox="0 0 200 90"
        className="absolute inset-0 h-full w-full"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        {scene.elements.map((el, i) => {
          if (el.type === "rect") return <rect key={i} {...el.attrs} />;
          if (el.type === "ellipse") return <ellipse key={i} {...el.attrs} />;
          if (el.type === "circle") return <circle key={i} {...el.attrs} />;
          if (el.type === "path") return <path key={i} {...el.attrs} />;
          return null;
        })}
      </svg>

      {/* Season weather overlays */}
      {season === "rain" && <RainOverlay />}
      {season === "harvest" && <HarvestDust />}
      {season === "celebration" && <CelebrationSparkles />}

      {/* World version glow overlay */}
      {worldVersion > 1 && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: "radial-gradient(ellipse at 50% 100%, rgba(34,197,94,0.08), transparent 60%)",
          }}
          aria-hidden="true"
        />
      )}

      {/* Bottom scene caption */}
      <div className="absolute bottom-0 inset-x-0 flex items-end justify-between gap-2 px-3 pb-2">
        <p className="text-[8px] font-black uppercase tracking-[0.18em] text-amber-300/60">{scene.era}</p>
        {worldVersion > 1 && (
          <span className="rounded-full bg-emerald-950/70 border border-emerald-300/20 px-1.5 py-0.5 text-[7px] font-black uppercase tracking-wide text-emerald-400">
            regenerated
          </span>
        )}
      </div>

      {/* Vignette */}
      <div
        className="pointer-events-none absolute inset-0 rounded-2xl"
        style={{
          background: "radial-gradient(ellipse at 50% 50%, transparent 40%, rgba(0,0,0,0.35) 100%)",
        }}
        aria-hidden="true"
      />
    </div>
  );
}
