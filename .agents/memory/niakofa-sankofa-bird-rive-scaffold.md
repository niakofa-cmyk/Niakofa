---
name: Niakofa SankofaBird Rive scaffold
description: Architecture for the Rive state machine drop-in, including file locations, activation flag, and designer handoff spec.
---

# SankofaBird Rive scaffold

## The rule
SankofaBird.tsx is now a thin auto-selector — it never contains animation logic itself. The SVG engine lives in SankofaBirdSvg.tsx; the Rive engine lives in SankofaBirdRive.tsx.

## Activation
Set `VITE_USE_RIVE_BIRD=true` in Replit Secrets + place `sankofa-bird.riv` in `artifacts/pay-it-forward/public/`. The Rive runtime chunk is lazy-loaded and tree-shaken when the flag is false, so there is zero bundle impact by default.

## State machine contract
- State machine name: `BirdStateMachine` (exact, case-sensitive)
- .riv file location: `artifacts/pay-it-forward/public/sankofa-bird.riv`
- Full input list and layer spec: `artifacts/pay-it-forward/public/SANKOFA_BIRD_RIVE_SPEC.md`

## Key inputs mapped in SankofaBirdRive.tsx
Number: heading, speed, mapZoom, mapBearing
Boolean: navigating, celebrating, newNotification, accepted, donated, nearbyUser, upcomingTurnLeft, upcomingTurnRight

## Fallback chain
If .riv is absent or corrupt → `onLoadError` callback → `setLoadFailed(true)` → renders SankofaBirdSvg transparently. Map is never broken.

**Why:** The design doc calls for Rive but .riv files require the Rive desktop editor (cannot be code-generated). The scaffold lets a designer deliver the file independently without touching React code.

**How to apply:** When adding new SankofaBird props in the future, add them to SankofaBirdProps in SankofaBirdSvg.tsx, then add the corresponding input in SankofaBirdRive.tsx and document it in SANKOFA_BIRD_RIVE_SPEC.md.
