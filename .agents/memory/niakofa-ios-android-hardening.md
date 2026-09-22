---
name: Niakofa iOS Safari / Android Chrome rendering hardening
description: What was done to ensure SankofaBird animations and all inputs work on real iOS Safari and Android Chrome, including GPU compositing, @supports guards, and input zoom prevention.
---

# iOS Safari / Android Chrome Rendering Hardening

**Why:** SankofaBirdSvg.tsx has 30+ CSS animations with @property-registered custom vars, transform-box:view-box, mix-blend-mode, and filter:drop-shadow — all of which have Safari/iOS-specific quirks. Inputs with text-sm trigger iOS auto-zoom.

**What was fixed (July 2026):**

## SankofaBirdSvg.tsx additions
- `.sankofa-bird-rig`: `backface-visibility:hidden` + `translateZ(0)` → GPU layer promotion on iOS (prevents full-SVG repaint per animation frame)
- `.sankofa-bird-rig`: `isolation:isolate` → contains mix-blend-mode for eye catchlights / night wing rim (P10 effects); without this Safari blends against page background
- `.sankofa-svg-root`: `isolation:isolate` + `overflow:visible` → stacking context containment
- `.sankofa-bird-container` class added to outer wrapper div at line 461; CSS adds GPU hints
- `@supports not (rotate: 0deg)` guard → suppresses individual CSS transform properties (rotate:/translate:/scale:) on iOS < 14.1 where they're not supported
- Universal reduced-motion block: `animation-duration:0.001ms !important` on all rig children covers all future phases automatically
- F18 (already present): all @property vars have `var(--prop, safe-fallback)` so older Safari reads initial-value

## index.css additions
- `@media (hover:none) and (pointer:coarse)`: `font-size: max(16px, 1em) !important` on input/textarea/select → prevents iOS Safari auto-zoom on focus
- `*`: `-webkit-tap-highlight-color: transparent` → eliminates grey tap flash on all interactive elements
- `.overflow-y-auto` etc: `-webkit-overflow-scrolling:touch` + `overscroll-behavior-y:contain` → momentum scroll on iOS < 13

## App.tsx
- Per-page `<ErrorBoundary>` wrapping the Switch — if one page crashes, BottomNav stays alive; user sees "Page crashed" card with Reload button

## useOfflineQueue.ts
- 30s timeout auto-resets `isSyncing` when SW doesn't respond — prevents permanent spinner on SW crash

## notification-worker.ts
- Explicit try/catch in `processNotification` with structured log (user_id, jobId, attemptsMade) before re-throwing for BullMQ retry

**How to apply:** On any future iOS rendering issue, check these three layers: (1) GPU compositing via backface-visibility, (2) stacking context via isolation:isolate, (3) @property fallbacks via var(--prop, safe-fallback).
