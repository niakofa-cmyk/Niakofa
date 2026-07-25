---
name: Niakofa SankofaBird landing sequence timers
description: The landing sequence timers t2/t3 were short by 1600ms total; documents the correct values and why they matter.
---

# SankofaBird Landing Sequence Timer Bug

## The Rule
Landing sequence timers in the `useLanding` state machine must use cumulative offsets:
- `slowflap = 600` (dive → slowflap)
- `hover = 1400` (sequence start → hover)
- `perch = 2200` (sequence start → perch)
- `idle = 4200` (sequence start → idle)

**Why:** The landing behavior uses cumulative `setTimeout` offsets. Treating phase durations as offsets shortens the hover/perch experience and makes the bird appear to skip intentional braking and settling.

**How to apply:** Any time this landing sequence is edited, verify each offset is later than the previous one and that the final idle offset includes the full perch duration.
