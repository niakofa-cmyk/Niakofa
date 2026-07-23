---
name: Niakofa SankofaBird Phase 19 — Upright-Body Heading Fix
description: Root cause and fix for the 360° rotation bug; how heading is now communicated without rotating the body.
---

## Rule (Phase 19: Upright-body Heading Cues)

**Root cause fixed:** `sankofa-bird-container` previously applied `rotate(${screenRotationDeg}deg)` to the ENTIRE SVG, causing the body to flip upside-down at S heading and go sideways at E/W.

**Fix:**
- Removed rotation from `sankofa-bird-container`.
- Added `sankofa-bird-trail-wrapper` child div — the rotation lives here so trails still point behind direction of travel, but the bird body is never rotated.
- The `P14.7 transition` CSS (which previously targeted `.sankofa-bird-container`) was moved to `.sankofa-bird-trail-wrapper`.

**How heading is now communicated (body stays upright always):**
1. `data-facing` → `scaleX(-1)` flip for East vs West (already existed, now the only body-flip)
2. `--gaze-rotate-deg` CSS var → head/iris pointing direction
3. `bankDeg` (±25° max) → slight body tilt into turns
4. `data-heading-quadrant` (8-value: N/NE/E/SE/S/SW/W/NW) → Phase 19 CSS posture cues:
   - N heading: forward-crane (head dip + neck extend)
   - S heading: head dip + slight tail fan
   - E/W: handled by `scaleX` flip only (no extra CSS needed)

**Why:** Rotating the whole rig for heading was architecturally wrong — it fights every element's own transform-origin. The heading should be a *cue* not a *rotation*.

**P18.9 bug fixed at same time:** Head-crane CSS was double-counting gaze (`--head-lead-deg + --vertical-gaze-deg`). Corrected to use combined `--gaze-rotate-deg`.
