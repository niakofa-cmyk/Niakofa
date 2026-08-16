---
name: Legacy Hub Declutter
description: What was removed from LegacyStartVisual + legacy-home.tsx and why — the "settings screen" root cause fix.
---

## What was removed
- 4-button mode-selector grid (Legacy Mode / Exploration / Family Quests / Reunion)
- 6-icon bottom icon nav (Inventory / Journal / Map / Family / Quests / Settings)
- Duplicate second "Continue Journey / Begin Journey" CTA at the bottom
- 4 dead SVG icon components (MODE_ICON_LEGACY, MODE_ICON_EXPLORATION, etc.)
- 10 dead lucide-react imports (Users, Package, BookOpen, Map, ClipboardList, Settings, Play, ChevronRight, …)
- 10 dead prop callbacks on LegacyStartVisualProps + both call sites in legacy-home.tsx (lines ~968 and ~1109)

## Why
Root cause from ROOT_CAUSE_TWO_GAMES.md: Journal/Map/Quests/Reunion belong as in-session overlays (already true for Journal+Map in legacy-chapter.tsx, Reunion in legacy-demo.tsx), not a pre-game nav grid. The grid sat between the 3 real CTAs and the world-summary card, making the hub feel like a settings menu instead of a game entry point.

**Why:** The documented cause was confirmed by reading the code — not assumed. Prior agent pass wrote ROOT_CAUSE_TWO_GAMES.md; this pass applied the fix.

## What was preserved
Routes (/legacy/challenges, /legacy/achievements, etc.) still exist. Only the pre-game navigation grid was removed; no destination pages were deleted.

## Files changed
- `artifacts/pay-it-forward/src/components/legacy-start-visual.tsx` — props interface + component stripped of grid; code comment added explaining the design decision
- `artifacts/pay-it-forward/src/pages/legacy-home.tsx` — both LegacyStartVisual call sites cleaned of 10 dead callback props
