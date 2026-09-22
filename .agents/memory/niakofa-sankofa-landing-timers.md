---
name: Niakofa SankofaBird landing sequence timers
description: The landing sequence timers t2/t3 were short by 1600ms total; documents the correct values and why they matter.
---

# SankofaBird Landing Sequence Timer Bug

## The Rule
Landing sequence timers in `artifacts/pay-it-forward/src/components/SankofaBird.tsx` must use cumulative offsets:
- `t1 = 800` (slowflap → hover)
- `t2 = 2200` (hover → perch) = 800 + 1400
- `t3 = 4200` (perch → idle) = 800 + 1400 + 2000

**Why:** The comment at L93 documents the DURATION of each phase (800ms, 1400ms, 2000ms). The setTimeout values must be CUMULATIVE offsets from the sequence start, not the phase durations. The original code used t2=1600 and t3=2600, meaning hover lasted only 800ms (should be 1400ms) and perch lasted only 1000ms (should be 2000ms) — 1600ms short total.

**How to apply:** Any time this landing sequence is edited, verify t2 = t1 + hoverDuration and t3 = t2 + perchDuration.
