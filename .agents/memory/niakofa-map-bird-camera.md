---
name: Niakofa map+bird camera invariants
description: Camera animation rules for map.tsx and request-active.tsx; fitBounds/easeTo race fix; helper-mode auto-recenter.
---

## Rules

**fitBounds + easeTo race (request-active.tsx)**
- `fitBounds` (route overview, 1200ms) and the GPS-follow `easeTo` (fired every RAF tick via tweenedPosition) compete and cause visible camera jitter.
- Fix: `isFittingBoundsRef` set to `true` before `fitBounds`, cleared via `setTimeout(..., 1400)` (200ms grace). The `easeTo` effect guards with `if (isFittingBoundsRef.current) return`.
- `fittingBoundsTimerRef` must be cleared before resetting so repeated route updates don't leave the guard permanently armed.

**Camera follow — request-active.tsx (navigation screen)**
- GPS-follow uses `mapRef.current.easeTo({ center: [tweenedPosition.lng, lat], duration: 600 })`.
- Camera uses `tweenedPosition ?? myLocation` so it glides with the bird, not snaps with the raw GPS fix.
- `easeTo` dep array: `[tweenedPosition?.lat, tweenedPosition?.lng, myLocation?.lat, myLocation?.lng]`.
- Skip when `isArrived || autoArrived || isFittingBoundsRef.current`.

**Camera follow — map.tsx (explore/helper map)**
- Does NOT auto-follow GPS on every update — intentional, lets user browse freely.
- One-shot `flyTo` fires only when the first real GPS fix arrives after IP-fallback start (`hasAutoRecenteredOnGps` ref guards it).
- Manual recenter: `recenterOnMe()` (flyTo, speed 1.4).
- **Helper mode activation**: When `helperModeActive` toggles ON, `flyTo` fires automatically so the helper sees nearby requests immediately (not wherever they were browsing). Uses `myLocationRef.current ?? ipFallbackRef.current` (stable refs, not stale closure).

**Why:**
- Camera jitter during navigation was the #1 UX complaint about the bird feeling "attached wrong" to the map.
- Helper-mode auto-recenter prevents the common frustration of switching to helper mode and seeing a neighborhood the user was browsing, not their own.
