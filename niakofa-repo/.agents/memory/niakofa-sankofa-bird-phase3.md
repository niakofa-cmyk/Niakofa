---
name: Niakofa SankofaBird Phase 3
description: 15 beyond-Rive CSS compound-selector effects; isVisuallyGliding separation; iOS reduce-motion override + Rive parity; zero-flash reload; map accessibility entry. July 18 2026.
---

# SankofaBird Phase 3 — full state (July 18 2026)

## isVisuallyGliding vs isGliding separation

`computeFlightMode` now returns THREE fields:
- `isMoving` — speed > 0.3 m/s and (navigating OR landingPhase="flying")
- `isGliding` — isMoving AND speed > 50 m/s (airplane). Controls flap cadence (4 s) and lean angle (12°).
- `isVisuallyGliding` — isMoving AND speed > 10 m/s (driving tier). Controls `data-gliding` HTML attribute → CSS body elongation + wing-tip slotted spread.

**Why:** glide CSS effects were written with `[data-speed="driving"]` sub-rules that were never reachable because `data-gliding` required airplane speed (50 m/s). Separating physics (isGliding) from CSS-visual (isVisuallyGliding) makes the effects fire during everyday navigation without touching the flap/lean physics.

**How to apply:** when adding new CSS effects gated on `data-gliding="true"` — they fire at driving speed. Effects that should only fire at true airplane speed must use `data-speed="airplane"` compound selector.

## iOS Reduce Motion override — complete system (July 18 2026)

### Hooks in `useAnimationPreference.ts`
- `useOsReducedMotion()` — reactive raw OS preference (matchMedia + change listener). Use when you need the OS signal separately from the user override (display labels).
- `useIsAnimationSuppressed()` — returns true when OS wants reduced AND user has NOT overridden. Watches both matchMedia AND MutationObserver on `html[data-bird-anim]`. Use to actually gate animations in JS components.
- `useAnimationPreference()` — `{ animEnabled, toggleAnim, setAnimEnabled }`. The toggle surface.
- localStorage key: `niakofa_bird_anim` = "enabled" to override
- DOM: sets/removes `html[data-bird-anim="enabled"]` attribute
- **Module-level init**: `applyPref(readPref())` runs at import time (before any React render) so the attribute is already on `<html>` by first paint.
- **`index.html` inline script** (plain `<script>`, NOT `type="module"`): reads localStorage and sets the attribute synchronously — true zero-flash even before the JS bundle loads. Modules are deferred; plain scripts are not.

### CSS gate
ALL 5 `@media (prefers-reduced-motion: reduce)` blocks are gated on `html:not([data-bird-anim="enabled"])`:
- Blocks 1/2/3/4: CSS nesting (`html:not([data-bird-anim="enabled"]) { }` inside `@media`)
- Block 5 (Phase 3): explicit selector prefix on each line

CSS nesting safe: Chrome 112+, Safari 16.5+ (iOS 16.5+), Firefox 117+.

### UI surfaces
- `AccessibilityCard` in `profile.tsx` — Switch with three-state contextual description
- `MapControlsPanel` Accessibility section — pill toggle matching Traffic/Heatmap style; surfaced from Map Settings drawer so users never need to leave the map
- `MapAnimNudge` component — one-time dismissible banner shown when OS Reduce Motion is on + override not set + not yet dismissed; `niakofa_anim_nudge_dismissed` localStorage flag; z-index = `Z_CARD`; rendered in `map.tsx` inside `relative w-full h-[100dvh]` root

### Rive parity (`SankofaBirdRive.tsx`)
- `useIsAnimationSuppressed()` called at component top
- When suppressed: forces `batterySaverInput.value = true` (overrides `batterySaver` prop) → Rive SM enters static-idle state
- CSS `animate-ping` pulse rings replaced with static `opacity-15` dot when suppressed — bypasses CSS gate entirely

### Component consumers of useIsAnimationSuppressed
- `KindnessImpactRing.tsx` — `prefersReducedMotion` flag
- `TurnArrowHUD.tsx` — `prefersReducedMotion` flag
- `SankofaBirdRive.tsx` — `animSuppressed` flag (gates batterySaverInput + pulse rings)

**Critical invariant:** When adding a NEW `@media (prefers-reduced-motion: reduce)` block, EVERY selector inside it MUST be wrapped in `html:not([data-bird-anim="enabled"]) { }` nesting or prefixed explicitly. A block without this guard breaks the toggle for all animations it covers. Verify with:
```
python3 -c "
import re; txt=open('artifacts/pay-it-forward/src/components/SankofaBirdSvg.tsx').read()
blocks=list(re.finditer(r'@media \(prefers-reduced-motion: reduce\) \{', txt))
for m in blocks:
    start=m.end(); depth=1; i=start
    while i<len(txt) and depth>0:
        if txt[i]=='{': depth+=1
        elif txt[i]=='}': depth-=1
        i+=1
    guarded='html:not([data-bird-anim' in txt[start:i-1][:150]
    print(f'Line {txt[:m.start()].count(chr(10))+1}: {\"OK\" if guarded else \"MISSING GUARD\"}')"
```

**Why:** Many iOS users have "Reduce Motion" on for system UI (stops parallax/animations) which also suppressed all bird Phase 3 CSS. The toggle lets them opt back in per-app.

## TypeScript zero-error state

- `lib/api-client-react` and `lib/api-zod` must be built (`pnpm --filter @workspace/api-client-react build && pnpm --filter @workspace/api-zod build`) before `tsc --noEmit` in the frontend.
- dist/ directories are gitignored; post-merge.sh handles the build on fresh clone.
- After building: `cd artifacts/pay-it-forward && npx tsc --noEmit` → 0 errors.
- Remaining implicit-any errors in wallet/profile/request-new pages were resolved by the lib build (they were all TS6305 cascades).

## Test count

123 frontend tests pass (was 121). 2 new `isVisuallyGliding` / running-speed tests added July 18.
141 backend tests pass.

## Phase 3 effects inventory (all 15)

1. Glide body elongation — fires at > 10 m/s (driving) via isVisuallyGliding
2. Blink rate modulation — by state (celebrating/notification/nearby)
3. Eye saccade — street (6.5 s) AND high zoom (8.5 s)
4. Head preturn — data-upcoming-turn left/right
5. Slotted wing-tip spread — driving+high zoom (±0.45/0.28 px), airplane+street (±1.4/0.9 px)
6. Vortex rings — visible at mid zoom (0.35 opacity), hidden only at low
7. Donation shimmer cascade — data-donated="true"
8. Talon specular — high zoom (6.5 s, 0.38 base), street (4.2 s, 0.50 base), mid (opacity:0.15, no anim)
9. Speed-adaptive breathe — see earlier phase doc
10. Perch impact pulse — data-landing="perch"
11. Contrail pulse — data-speed="airplane"
12. Iris parallax — data-celebrating="true"
13. Proximity field — data-nearby-user="true"
14. Crown burst — data-celebrating="true"
15. Tail-center iridescence — .sankofa-tail-center class
