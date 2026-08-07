# Sankofa Bird — Official SVG Asset Pipeline

**Visual Reference:** `public/SANKOFA_BIRD_OFFICIAL_REFERENCE.png`  
**Master Vector:** `artifacts/pay-it-forward/src/components/SankofaBirdSvg.tsx`  
**Views Component:** `artifacts/pay-it-forward/src/components/SankofaBirdViews.tsx`  
**Sprite360:** `artifacts/pay-it-forward/src/components/SankofaBirdSprite360.tsx`

---

## Coordinate System

- **ViewBox:** `0 0 200 200` — center at **(100, 100)**
- **Default Viewport:** 1024 × 1024 (scale up from 200-unit space)
- **Pivot (0,0):** Body center = **(100, 110)** in viewBox coords
- **All exports:** Keep center origin (0,0) for consistency

---

## Pivot Points (ViewBox coords)

| Pivot | x | y |
|---|---|---|
| Body Center | 100 | 110 |
| Left Wing Base | 68 | 108 |
| Right Wing Base | 132 | 108 |
| Neck Base | 100 | 88 |
| Tail Base | 100 | 150 |
| Leg Base L | 90 | 152 |
| Leg Base R | 110 | 152 |
| Egg Center | 130 | 72 |

---

## Color Palette

| Name | Hex | Use |
|---|---|---|
| Bright Teal | `#0FE5D4` | Wing tips, crest, highlights |
| Mid Teal | `#2683AB` | Wing mid-tone, body mid |
| Deep Teal | `#0D7F7A` | Deep wing feathers |
| Body Shadow | `#095E5A` | Body fill, underbelly |
| Near-Black | `#062E2E` | Shadows, deep under-wing |
| Beak / Claws | `#0AF012` | Beak, claw highlights |
| Egg Body | `#D0F5F0` | Pearl egg base |
| Egg Highlight | `#FFFFFF` | Egg specular |
| Specular | `#C8FFF8` | Iridescent wing sheen |
| Gold | `#F5D98A` | Skeleton wireframe / crown tip |

---

## View Inventory (15 total)

### Cardinal + 3/4 Views (8)
| # | Name | Angle | Key Technique |
|---|---|---|---|
| 1 | FRONT | 0° | Bilateral symmetry baseline |
| 2 | FRONT 3/4 RIGHT | 30° | skewX(-10) + right wing foreshortened to 52% |
| 3 | FRONT 3/4 LEFT | 300° | CSS scaleX(-1) mirror of Front3QRight |
| 4 | LEFT SIDE | 90° | Body ellipse squished X, one wing visible |
| 5 | RIGHT SIDE | 270° | CSS scaleX(-1) mirror of LeftSide |
| 6 | BACK 3/4 LEFT | 210° | CSS scaleX(-1) mirror of Back3QRight |
| 7 | BACK 3/4 RIGHT | 120° | skewX(10) + back plumage (showBack=true) |
| 8 | BACK | 180° | Head rotated 160° (classic Sankofa pose) |

### Vertical + Diagonal + Cross Views (7)
| # | Name | Key Technique |
|---|---|---|
| 9 | UP VIEW (TOP) | Dorsal surface, body ellipse compressed Y |
| 10 | DOWN VIEW (BOTTOM) | Ventral surface, under-wing gradient |
| 11 | DIAGONAL UP LEFT | skewX(-10) skewY(-15) |
| 12 | DIAGONAL UP RIGHT | CSS mirror of DiagonalUpLeft |
| 13 | DIAGONAL DOWN LEFT | skewX(-10) skewY(15) |
| 14 | DIAGONAL DOWN RIGHT | CSS mirror of DiagonalDownLeft |
| 15 | CROSS VIEW | Wireframe skeleton + pivot markers |

---

## Wing Deformation States (5)

| State | Flight Phase | Key Path Change |
|---|---|---|
| `high-stretch` | Upstroke | Primary feathers angled up-rearward |
| `relaxed` | Neutral hover | Horizontal spread baseline |
| `power-stroke` | Downstroke | Cupped, tips down, leading edge forward |
| `braking` | Deceleration | Wrists forward, wide fan |
| `glide` | Cruise | Swept back, narrow chord |

---

## Tail Deformation States (4)

| State | Use Case |
|---|---|
| `wide` | Display / braking |
| `speed` | High-speed cruise, narrow arrow |
| `braking` | Tight fold, raised |
| `stream` | Long center stream, slight spread |

---

## Turn Sequence (12 steps — Illusion Perspective)

Step → View → Angle → Wing State:

```
 0  FRONT           →   0°  → relaxed
 1  FRONT 3/4 RIGHT →  30°  → power-stroke
 2  RIGHT SIDE      →  90°  → power-stroke
 3  BACK 3/4 RIGHT  → 120°  → glide
 4  BACK            → 180°  → glide
 5  BACK 3/4 LEFT   → 210°  → glide
 6  LEFT SIDE       → 270°  → braking
 7  FRONT 3/4 LEFT  → 300°  → braking
 8  DIAGONAL UP L   → 315°  → relaxed
 9  DIAGONAL DOWN L → 330°  → relaxed
10  FRONT 3/4 LEFT  → 345°  → relaxed
11  FRONT           → 360°  → relaxed
```

---

## Feather Layer Order (back-to-front)

1. Tail Feathers (Under)
2. Left Wing Under / Right Wing Under
3. Body (main ellipse)
4. Tail Feathers (Top)
5. Left Wing (Top) / Right Wing (Top)
6. Wing Coverts
7. Neck
8. Head (with Crest, Eye, Beak)
9. Egg

---

## SVG Transform Convention

**Mirror around x=100 (viewBox center X):**
```
transform="translate(200,0) scale(-1,1)"
```
This is the SVG-native equivalent of CSS `scaleX(-1) transformOrigin: 100px`.  
**Never** use CSS `transform` or `transformOrigin` on SVG `<g>` elements — they are not cross-browser reliable.

---

## Pipeline Compatibility

| Target | Status | Notes |
|---|---|---|
| SVG (Web) | ✅ Primary | React SVG, tree-shakeable exports |
| Rive | ✅ | State machine: `BirdStateMachine` |
| Lottie | ✅ | via Bodymovin export |
| Spine 2D | ✅ | Bone rig matches pivot table above |
| Canvas / PixiJS | ✅ | Rasterise at 3× (3072×3072) |

---

## Export Guidelines

- Viewport: 1024 × 1024
- Center origin (0,0) on all exports
- Enable `Responsive = false` for pixel-perfect
- Use SVGO with `FloatPrecision: 3`
- Gradient IDs: unique per instance (use React `useId()` if rendering multiple copies)

---

## Animation Recommendations

- Use turn sequence for idle / look-around cycles
- Wing deformation for flight cycle (power-stroke ↔ glide)
- Tail deformation for speed / braking
- Add slight head-bob for natural motion (4.2s idle period)
- Wing asymmetry +18ms between left/right for realism
