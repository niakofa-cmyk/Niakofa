---
name: Niakofa SankofaBird Phase 12 — Gaze System
description: Real-time 8-direction gaze + 10 gap-closure animations added July 19 2026. Math, wiring, CSS, and test harness patterns.
---

## Rule
Phase 12 adds a full real-time gaze system driven by `computeGazeVector()` in `sankofa-bird-math.ts`. The result sets `data-gaze` on the rig div, which CSS uses to shift the iris, tilt the head, arc the neck, and micro-roll the body.

**Why:** Prior sessions built Phases 1-11 but never ported `computeGazeVector` or the gaze CSS to `main`. The work existed only on `origin/restore-and-improve-july-2026` and `origin/sankofa-bird-gap-close-july-2026` branches that were never merged.

## How to apply

### computeGazeVector priority order (highest first)
1. `approaching=true` → `"down"` (focus on landing zone)
2. `upcomingTurnDirection="left"` → `"upleft"`, `"right"` → `"upright"`
3. `isGliding=true` → `"up"` (thermal scan)
4. `newNotification=true` → `"right"` (alert look)
5. `isHelping=true` → `null` (eyes-forward engaged posture)
6. `saccadePhase` (idle) → subtle wander from `["upleft", null, "upright", null]`
7. default → `null` (straight ahead)

### Saccade state pattern
```tsx
const [saccadePhase, setSaccadePhase] = useState<0|1|2|3>(0);
useEffect(() => {
  if (navigating || celebrating || newNotification) return;
  const id = setTimeout(() => setSaccadePhase(p => nextSaccadePhase(p)), 3000 + Math.random() * 3000);
  return () => clearTimeout(id);
}, [saccadePhase, navigating, celebrating, newNotification]);
```
The `Math.random()` in the useEffect is fine — it runs in impure scope, not a durable callback.

### data-gaze suppression rules
- `data-battery-saver="true"` → `transform: translate(0,0) !important` on iris/catchlight; no head/neck gaze
- `data-upcoming-turn="left/right"` → upcoming-turn rotate has `!important` so it overrides gaze rotate (no compound)
- `prefers-reduced-motion` → head/neck/body gaze suppressed; iris shift kept (informational)

### 10 gap-closure animations (G2-G10)
| ID | Effect |
|----|--------|
| G2 | Shadow: gold pulse when helping, teal pulse when celebrating |
| G3 | Body lean into turn + outside-wing rotate before banking |
| G4 | Thermal-lift: `translate: 0 -2.5px` on gliding body (4s sine) |
| G5 | Iris 7-point alert saccade on `data-notification="true"` |
| G6 | Per-feather micro-oscillation during flight at street zoom |
| G7 | Leading-edge feather scaleX compression before bank (inside-turn) |
| G8 | Helping gold tint via glow-layer at `data-zoom="low"` |
| G9 | Speed-correlated crown sway: walking=4.5s … airplane=0.7s |
| G10 | Wing pre-extension: `translate+rotate` keyframe on outside wing |

G1 (duplicate legs keyframe) was already resolved — only one definition exists.
