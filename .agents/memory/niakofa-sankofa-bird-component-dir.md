---
name: Niakofa SankofaBird component directory
description: The 2,213-line SankofaBirdSvg.tsx monolith was refactored into SankofaBird/ directory; key boundary gotchas and architecture decisions.
---

## Final structure (Phase 19 intact, 0 tsc errors)

`src/components/SankofaBird/` contains:
- `SankofaBird.tsx` — root render function (all hooks + BirdProvider + JSX composition)
- `context.tsx` — `BirdProvider` + `useBird()` hook (all 50+ computed values)
- `types.ts` — `SankofaBirdProps` interface; `skyTier` is `"day"|"golden"|"twilight"|"night"` (NOT "dusk"/"dawn")
- `index.tsx` — barrel export of all anatomy + geometry + metadata + poses
- Sub-dirs: `defs/`, `tail/`, `wings/`, `body/`, `head/`, `legs/`, `effects/`, `animation/`, `geometry/`, `metadata/`, `poses/`

Backward-compat shims:
- `SankofaBirdSvg.tsx` → re-exports from `./SankofaBird/SankofaBird`
- `SankofaBird.tsx` (root) unchanged — still the public API with auto-battery-saver + Rive selector

## Critical extraction boundary rules

The original monolith uses dense JSX where one element's `/>` appears on the line immediately before the next element's comment. `sec(start, end)` **must** be inclusive of the closing `/>` and **exclusive** of the opening of the next section.

Key confirmed line boundaries (git HEAD as of July 2026 push):
| Component | start | end | Notes |
|---|---|---|---|
| Tail.tsx | 1052 | 1115 | includes opacity+`/>` of far-right rectrice |
| RightWing | 1117 | 1229 | 1230 = `<path` of left wing |
| LeftWing | 1230 | 1330 | starts at `<path` (not `className=` line) |
| WingJoints | 1332 | 1366 | |
| Scapulars | 1368 | 1382 | |
| BodyGroup | 1384 | 1499 | |
| Neck | 1502 | 1544 | ends at `/>` of neck-top-sheen; does NOT include `<g className="sankofa-bird-head">` |
| Head | 1545 | 1552 | just the head circle; 1553 = CrownFeathers comment |
| Crest | 1553 | 1626 | 1627 = `<circle` of iris |
| Eye | 1627 | 1718 | ends at `/>` before beak comment at 1719 |
| Beak | 1719 | 1764 | 1765 = `<circle` of chirp-ring-1 |
| ChirpRings | 1765 | 1809 | includes chirp-ring-1/2/3 + beak-glint `/>` |
| Egg | 1810 | 1926 | ends at egg counter-rotation `</g>`; 1927 = sankofa-bird-head `</g>` |
| Legs | 1929 | 2009 | ends at `</g>` for legs group |
| DustMotes | 2011 | 2150 | |
| AdinkraOverlay | 2151 | 2199 | 2200 = `</svg>` |

**Why:** grep finds `className="..."` attribute lines, but the element opens one line earlier. Always go back one line to include the opening `<path`/`<circle`/`<g` tag.

## Architecture invariants

- `<g className="sankofa-bird-head">` wrapper lives in `SankofaBird.tsx`, NOT in Neck.tsx
- `</g>` for sankofa-bird-head (line 1927) is NOT in Egg.tsx — it's in SankofaBird.tsx as the closing tag after `<Egg />`
- `rigRef` type is `React.RefObject<HTMLDivElement | null>` (React 18/19); context.tsx must match
- `useRef<HTMLDivElement | null>(null)` in SankofaBird.tsx (not `useRef<HTMLDivElement>`)
- DustMotes uses `isHelping, celebrating, donated` — must import from `useBird()`
- Gradients.tsx renders `<defs>...</defs>` as a direct `<svg>` child (no wrapping needed)
- ParticleTrail renders inside the trail-wrapper div (heading rotation) not inside the rig

## CSS

`sankofa-bird-css/` 4-file split unchanged. Import via `import { sankofaBirdCss } from "../sankofa-bird-css"` in SankofaBird.tsx.
