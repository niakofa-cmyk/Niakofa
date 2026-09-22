# Black Panther — Official SVG Asset Pipeline

**Status: spec locked, master marker art shipped.** This file is the canonical spec —
transcribed from the official pipeline reference (`BLACK_PANTHER_OFFICIAL_REFERENCE`
assets) — for the Black Panther companion, mirroring the structure and
fidelity of `SANKOFA_BIRD_ASSET_PIPELINE.md` exactly, the same way the
reference art mirrors the Bird's own asset-pipeline sheet.

The current in-app renderer (`BlackPantherSvg.tsx`) is the shipped layered
master marker: original SVG anatomy, melanistic rosettes, gold eyes, reaction
states, night palette, and battery/zoom LOD. The 15-view / 12-turn-sequence
vocabulary below remains the expansion path for future high-resolution
turnaround art.

```
ASSET TYPE:        Vector (SVG)              COORDINATE SYSTEM: Center Origin
STYLE:              Layered Gradient Vector    DEFAULT VIEWPORT:  1024 × 1024
RENDER:             SVG / RIVE / Lottie / Canvas   PIVOT (0,0):   Body Center
Built from:          BlackPantherSvg.tsx — Master Vector (React SVG)
```

## View Inventory (15 total)

### Cardinal + 3/4 Views (8)
Front · Front 3/4 (Right) · Front 3/4 (Left) · Left Side · Right Side ·
Back 3/4 (Left) · Back 3/4 (Right) · Back

### Vertical + Diagonal + Cross Views (7)
Up (Top) · Down (Bottom) · Diagonal Up (Left) · Diagonal Up (Right) ·
Diagonal Down (Left) · Diagonal Down (Right) · Cross View

## Turn Sequence (12-step, Illusion Perspective)

Same technique as the Bird's `SankofaBirdSprite360.tsx`: a convincing
rotation through CSS transform morphing (skew/scale + layered path
visibility) between 12 discrete poses — no WebGL/Three.js.

| # | Pose | # | Pose |
|---|---|---|---|
| 1 | Front | 7 | Left Side |
| 2 | Front 3/4 (Right) | 8 | Front 3/4 (Left) |
| 3 | Right Side | 9 | Diagonal Up (Left) |
| 4 | Back 3/4 (Right) | 10 | Diagonal Down (Left) |
| 5 | Back | 11 | Front 3/4 (Left) |
| 6 | Back 3/4 (Left) | 12 | Front |

## Leg Deformation States (5)

| State | Description |
|---|---|
| Reach Forward (Extended) | leading leg fully extended, stride opening |
| Plant (Contact) | paw touches ground, weight transfer begins |
| Push Off (Power) | trailing leg drives, haunch compresses |
| Curl Up (Folded) | leg tucked under body — mid-stride recovery |
| Reach Back (Extended) | trailing leg fully extended behind |

## Tail Deformation States (5)

| State | Description |
|---|---|
| Tail Curve (Relaxed) | idle, gentle downward-then-up curve |
| Tail S-Curve (Balanced) | walking counterbalance |
| Tail Flick (Fast) | quick snap — alert/notify reaction |
| Tail Loop (Tight) | coiled — pounce wind-up / celebrate |
| Tail Straight (Aligned) | full sprint, trailing straight for balance |

## Layer Hierarchy

```
BlackPanther
└─ Root (Group)
   ├─ Defs (Gradients, Masks, Clips)
   ├─ Body
   │  ├─ Chest
   │  ├─ Back
   │  └─ Underbody
   ├─ Neck
   ├─ Head
   │  ├─ Crest
   │  ├─ Eye
   │  ├─ Whiskers
   │  ├─ Ears
   │  └─ Mouth
   ├─ Front Leg (Left)
   │  ├─ Upper
   │  └─ Lower
   ├─ Front Leg (Right)
   │  ├─ Upper
   │  └─ Lower
   ├─ Hind Leg (Left)
   │  ├─ Upper
   │  └─ Lower
   ├─ Hind Leg (Right)
   │  ├─ Upper
   │  └─ Lower
   └─ Tail
```

## Pivots (ViewBox coords, center-origin)

| Pivot | Purpose |
|---|---|
| Body Center (0,0) | root transform origin |
| Neck Base | head/neck articulation |
| Head Base | head tilt / ear-perk |
| Left Shoulder / Right Shoulder | front leg rotation origin |
| Left Hip / Right Hip | hind leg rotation origin |
| Tail Base | tail sway/flick/loop origin |
| Tail Tip | secondary tail motion (lag/whip) |

## Color Palette

| Token | Hex | Use |
|---|---|---|
| Base Fur (darkest) | `#0A0A0A` | deepest shadow / gradient anchor |
| Layer 2 | `#141414` | base fur mid-tone |
| Layer 3 | `#1E1E1E` | fur gradient step |
| Spot Layer | `#2B2B2B` | rosette/spot fill |
| Highlight Fur | `#383838` | raking-light fur highlight |
| Muscle Definition | `#4A4A4A` | form-shadow modeling |
| Underbody Shade | `#9A9A9A` | lightest fur tone, underbody only |
| Whiskers | `#D4D4D4` | whisker strands |
| **Eye Highlight** | `#FFD700` | gold eyes — the panther's signature accent (not the Bird's teal) |

## Gradient System

**Fur gradient** (5-stop): `#0A0A0A → #1E1E1E → #386B38 → #6B6B6A → #9A9A9A`
**Spot gradient** (4-stop): `#0A0A0A → #141414 → #2B2B2B → #4AAAA4`

## Spot Pattern & Layer Map

10 depth-ordered layers, back to front: Base Fur → Spot Layer → Highlight
Fur → Shadow Fur → Muscle Definition → Underbody Shade → Whiskers →
Eyes/Details → Nose/Mouth → Claws. Spot-pattern "breathing" (subtle drift
as the panther moves) is achieved via path morphing, not a mesh deform —
same technique the Bird uses for feather layers.

## Pipeline Compatibility

| Format | Supported |
|---|---|
| SVG (Web) | ✅ |
| Rive | ✅ (once a Rive export exists — see Deferred, below) |
| Lottie | ✅ |
| Canvas / Pixi | ✅ |

## Export Guidelines

- Keep viewport 1024×1024 for the master vector; the in-app renderer scales
  to a 40×40 viewBox to match the Bird's marker sizing (`SpiritAnimalAvatar`
  passes the same `size` prop to either companion).
- Maintain center origin (0,0) for all exports.
- Enable "Responsive = false" for pixel-perfect scaling.
- Use SVGO with `floatPrecision: 3`.

## Animation Recommendations

- Use the 12-step turn sequence for idle look-around / heading changes.
- Leg deformation states drive the walk/trot/sprint cycle.
- Tail deformation states pair with reactions: Flick → notify, Loop → celebrate/pounce, Straight → sprint.
- Add subtle head sway & breathing at idle, matching the Bird's idle-breathe cadence.

---

## Current Implementation Status

What's real vs. stubbed in the codebase today, so it's obvious what a
vector artist needs to fill in:

| Piece | Status | File |
|---|---|---|
| Color palette (this doc) | ✅ wired into layered master | `BlackPantherSvg.tsx` |
| Gold eye accent (`#FFD700`) | ✅ wired into layered master | `BlackPantherSvg.tsx` |
| Idle / walk / celebrate / notify reactions | ✅ working on the master marker | `BlackPantherSvg.tsx` |
| Layered fur, rosettes, anatomy, and whiskers | ✅ shipped in the master marker | `BlackPantherSvg.tsx` |
| 15-view vocabulary | 🟡 typed expansion stubs, each currently uses the master marker with heading orientation | `BlackPantherViews.tsx` |
| Leg/Tail deformation state types | 🟡 typed (`LegState`, `TailState`); master marker has animated walk/tail deformation | `BlackPantherViews.tsx` |
| High-resolution 15-view vector turnaround | 🟡 planned expansion — master marker is the runtime baseline | `BlackPantherViews.tsx` |
| 12-step turn-sequence sprite (`BlackPantherSprite360.tsx`) | ❌ not started — build once the 15 views above are real, following `SankofaBirdSprite360.tsx`'s technique 1:1 | — |
| Rive variant | ❌ not started | — |
| Weather / trust-tier / stalk-sprint-pounce locomotion | ❌ not started (post-MVP, see original MVP doc notes) | — |

**The next art expansion is the 15 high-resolution view SVGs.** The runtime
master marker already ships and remains the fallback while the turnaround
views are authored.
