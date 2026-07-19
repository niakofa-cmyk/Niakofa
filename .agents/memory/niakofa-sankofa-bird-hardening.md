---
name: SankofaBird E1-E6 Phase 1-5 Hardening
description: CSS hardening additions fixing phone/mid-zoom gaps and adding per-element animations beyond Rive quality
---

# SankofaBird E1-E6 Hardening (July 18 2026)

## Rule
Six CSS blocks appended LAST in SankofaBirdSvg.tsx after Phase 6 — cascade priority guaranteed. No backticks in CSS comments inside JSX template literals (breaks Babel parser).

## What was fixed
- E1: Crown sway animation-duration per data-activity tier (quiet=5.2s, busy=2.4s, peak=1.6s outer/1.1s central). Uses animation-duration:X !important not full animation: shorthand.
- E2: Helping forward-crane: head translateX(-0.8px)/Y(-0.25px) + neck rotate(-2.5deg) when data-helping=true. transform-box:view-box + px transform-origin = iOS Safari safe.
- E3: Wing highlight shimmer at data-zoom=mid (5.8s idle, 3.6s flying). Phones at zoom 12-14 had zero iridescence before.
- E4: sankofa-idle-settle 8.5s on .sankofa-bird-rig when data-landing=idle data-flying=false. Mutually exclusive with approach-descent.
- E5: Trail gold tint hue-rotate(-28deg) on .sankofa-trail when data-helping=true.
- E6: Per-feather idle micro-rustle at street zoom: feathers 4-11 independent periods 5.4s-8.0s.

## Crown zoom gap (also fixed)
- Crown activity glow was street-only; now applies to BOTH street AND high zoom (phones at zoom 14-16 were missing it).
- Mid-zoom crown feathers 4+5 get sway/alert animation at busy/peak so phones see crown reactivity.
- Peak crown tremble now also fires at high zoom.

## bird-test additions
- PhaseHardeningDemo component: 8 cards for E1-E6. Use isHelping prop not BirdState.helping (that field does not exist).

**Why:** Phones typically stay at zoom 12-14 (mid) or 14-16 (high). Previous CSS only targeted zoom=street for crown glow and wing shimmer, so the bird looked static on mobile.
