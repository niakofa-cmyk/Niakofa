---
name: Legacy Start Screen
description: Architecture of the Niakofa Legacy cinematic start screen and how it wires into legacy-home.tsx
---

# Legacy Start Screen

## The Rule
`LegacyStartVisual` (artifacts/pay-it-forward/src/components/legacy-start-visual.tsx) is the **full-screen cinematic start panel** shown when a user taps "Legacy" in the bottom nav or settings. It replaced the old two-column card layout.

**Why:** User design spec (Aug 5 2026) required matching uploaded Niakofa panel reference exactly, removing the "Button States" section, and replacing it with a live "YOUR FAMILY WORLD" card.

## How to Apply
- Component takes `worldVersion`, `recentActivities`, `currentChapterNumber`, `currentChapterTitle`, `isAiUnlocked`, and full sets of mode/nav callbacks
- Two call sites in `legacy-home.tsx`: one for "not ready" state (isReady=false), one for full game UI (isReady=true)
- Hero background uses `/legacy-living-family-reference.png` (already in public, 1536×1024)
- If future uploaded PNGs land on disk, place them at: `artifacts/pay-it-forward/public/niakofa-legacy-bg.png`, `niakofa-legacy-logo.png`, `niakofa-legacy-panel.png`

## Navigation logic
- "Get Started" / "Start New Journey" button → `/legacy/start` (LegacyStartPage — the Awaken the Legacy ancestor selection + cinematic workflow)
- "Continue Journey" button → `/legacy/play`
- Mode grid callbacks → `setActiveMode()` for legacy/exploration/quests/reunion
- Bottom icon row → route to relevant pages

## YOUR FAMILY WORLD card data sources
- `worldVersion` ← `dailyWelcome.worldVersion` or `worldVersion.currentVersion`
- Activity lines ← `dailyWelcome.recentChanges[].description`
- Chapter ← active session chapter or `dailyWelcome.newChapters[0]`
- AI status ← `isAiEnabled` from `/api/legacy/quests/:familyId`
