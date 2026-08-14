---
name: Legacy Cinematic Layer
description: Architecture of the cinematic dialogue and chapter environment system added Aug 2026 per Visual Runtime Bible.
---

## Components

**`src/components/legacy-cinematic-dialogue.tsx` — `LegacyCinematicDialogue`**
- Props: `chapter: CinematicChapter`, `season: DemoSeason`, `traits`, `npcMemory`, `onChoice`, `npcKey?`, `animate?`
- `CinematicChapter` = `{ id, number?, title, era, description, choices?, outcome? }` — matches CHAPTERS items in `legacy-demo.tsx` directly
- Internally manages `chosen` state and resets on `chapter.id` change
- Typewriter via `useTypewriter(text, speed, enabled)` hook; tap the header div to skip
- `npcKey` defaults to `"grandma"` — see `NPC_AVATARS` map for other options
- NPC memory hint shown if any `npcMemory` item's `remembers` string includes "Chapter" or "chose"

**`src/components/legacy-chapter-environment.tsx` — `LegacyChapterEnvironment`**
- Props: `phase: DemoPhase`, `season: DemoSeason`, `worldVersion: number`, `compact?: boolean`
- Renders a 110px (88px compact) CSS-painted SVG scene; `SCENES` record keyed by `DemoPhase`
- Covered phases: prologue, chapter1–6, world-regen, finale
- Season weather overlays: `rain` → `RainOverlay` (drops), `harvest` → `HarvestDust` (particles), `celebration` → `CelebrationSparkles`
- `worldVersion > 1` adds green radial glow at base + "regenerated" badge

## ChapterScreen wiring
- `ChapterScreen` in `legacy-demo.tsx` now accepts `phase: DemoPhase` and `worldVersion: number` props
- Renders `LegacyChapterEnvironment` then `LegacyCinematicDialogue` (replaces old hand-coded choice UI)
- Call site passes `state.phase` and `state.worldVersion`

## CSS animation classes (index.css)
| Class | Keyframe | Purpose |
|---|---|---|
| `.legacy-firefly` | `legacy-firefly` | Firefly drift; set `--firefly-dur` CSS var per element |
| `.legacy-branch-sway` | `legacy-branch-sway` | Transform-origin bottom; 6s ease |
| `.legacy-particle-float` | `legacy-particle-float` | Floating dust/spark; set `--particle-dur` |
| `.legacy-rain-drop` | `legacy-rain-drop` | 0.7s linear infinite |
| `.legacy-memory-pulse` | `legacy-memory-pulse` | Box-shadow pulse for memory nodes |
| `.legacy-world-reveal` | `legacy-world-reveal` | Blur+translate entrance; use once |
| `.legacy-cursor-blink` | `legacy-cursor-blink` | Step-start 1s cursor |

## Baobab fireflies
- `useFireflies(count)` hook in `legacy-living-baobab.tsx` uses `useRef` to stable-init positions (no re-render drift)
- Each fly has unique `x`, `y`, `dur` (2.8–5s), `delay`, `size` (3–5px)
- Rendered as `div`s with `--firefly-dur` CSS var, gold box-shadow glow

**Why:** Visual Runtime Bible spec requires P0 atmosphere animations (idle, ambient life); fireflies + typewriter were the two highest-impact additions achievable without a game canvas rewrite.
