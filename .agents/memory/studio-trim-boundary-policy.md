---
name: Studio trim boundary policy
description: User-approved accuracy and keyframe tradeoff for fast Studio trims.
---

**Rule:** Fast trims use a shrink boundary policy: never retain footage outside the user's selected range. Accept losing up to 0.25 seconds near a keyframe (especially at the start); cuts farther from a keyframe may re-encode for precision.

**Why:** The user prioritizes honoring the selected range and respecting hard clip-duration limits over retaining every frame at a keyframe edge.

**How to apply:** Keep the shrink policy in trim implementation and tests; do not switch back to expanding keyframe boundaries. Recheck representative trim timings in Chromium after changes.
