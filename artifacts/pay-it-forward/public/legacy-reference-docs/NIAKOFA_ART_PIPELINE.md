# Niakofa Art Pipeline
_Reference document — do not ship as game content. For art direction and pipeline decisions only._

---

## The Pipeline Architecture

```
                    NIAKOFA ART PIPELINE
                           │
          ┌────────────────┼────────────────┐
          │                │                │
       HAND DRAWN        3D BLOCKOUT       AI
          │                │                │
          ▼                ▼                ▼
       Characters      Environment       Concepts
          │             geometry           │
          └───────────────┼────────────────┘
                          ▼
                  ART CLEANUP / PAINT
                          │
                          ▼
                  MASTER ATLAS
                          │
                          ▼
                  SPRITE EXTRACTOR
                          │
                          ▼
                 ANIMATION FRAMES
                          │
                          ▼
                 ANIMATION MANIFEST
                          │
                          ▼
                  NIAKOFA RUNTIME
                          │
                ┌─────────┼─────────┐
                ▼         ▼         ▼
             Movement  Interaction Combat
                │         │         │
                └─────────┼─────────┘
                          ▼
                    LIVING WORLD
```

---

## Art Tier Hierarchy

Every asset entering the Niakofa runtime must be classified:

| Tier | Who | Examples | Gate |
|------|-----|---------|------|
| **Tier 1 — Hero Art** | Hand-drawn 2–2.5D | Kwame, Ama, Kofi, Abena, Nana, important NPCs | Required for protagonist/antagonist roles |
| **Tier 2 — World Art** | Hand-painted African environments | Cape Coast, Mensah compound, cocoa farms, markets, school, coast, trading houses, villages | Preferred, AI concepts allowed as reference |
| **Tier 3 — Runtime** | ARPG/MZ mechanics | Movement, collision, interaction, events, combat, dynamic events | Technical, no art |
| **Tier 4 — Supporting** | Pixel references, sprite tools, 3D blockouts, temporary prototypes | RPG Maker MV frames (NPC only), DarkNinja (reference), Red Mage (reference) | Dev/reference only — never in production scenes |

**The trap to avoid:** mixing all art styles. Niakofa must not look like an asset marketplace demo.

---

## Asset Evaluation Gate

Before promoting any asset to canonical:

```
TEMPORARY EVALUATION
        ↓
REFERENCE LIBRARY
        ↓
LICENSE VERIFIED?
        ↓
STYLE COMPATIBLE?
        ↓
CONVERTIBLE?
        ↓
CANONICAL NIAKOFA ASSET
```

---

## Character Production Pipeline

```
FAMILY MEMBER
       ↓
Character DNA
       ↓
Age + Era + Region + Vocation + Uniform / Clothing
       ↓
Base Character Model
       ↓
Pose / Animation
       ↓
2D Hand-Drawn Rendering
       ↓
Character Asset Library
       ↓
Runtime Character
```

---

## Niakofa Character Runtime Standard

Every playable or principal NPC character must define:

```
Character ID
Name
Age
Gender
Generation
Location
Occupation
Personality
Family relationships
Sprite atlas
Portrait                 ← 660×624
Dialogue bust            ← 500×624
Dialogue face            ← 144×144
Animation manifest
Movement speed
Collision box
Interaction radius
Animation FPS            ← 12 FPS per spec
State machine
Equipment
Skills
Traits
Historical period
```

### Kwame Mensah — Canonical Instance

```
KWAME_MENSAH_1890
Age: 16
Location: Cape Coast
Role: Student / Farmer's son
Generation: 1
Movement: 4-direction
Runtime cell: 256×256 (rendered ~160px)
Animation: 12 FPS
```

The same system produces:

```
Kwame age 16  →  Kwame age 24  →  Kwame age 40  →  Kwame elder
```

without rebuilding the character system — this is what `CharacterDNA` and the evolution system enable.

---

## Sprite Extractor Workflow

Tool: `tools/sprite-extractor/index.html` (browser-based, offline)

```
AI / Hand-drawn artwork
          ↓
Master Atlas (PNG)
          ↓
[Open in Sprite Extractor]
          ↓
Individual Frames extracted
          ↓
Animation Manifest (JSON)
          ↓
Niakofa Runtime (kwame-sprite-atlas.ts)
```

Supported formats: PNG, JPG, WEBP, GIF, BMP, TIFF, SVG, ZIP sprite archives.

Frame naming convention: `<character>-<action>-<direction>-<N>.png`
Example: `kwame-walk-down-01.png`

---

## 3D Blockout Usage (Brezhnevka FBX and future assets)

3D environment assets (FBX/Blender) are **not** final Niakofa environment assets — they are construction reference for:

```
3D blockout
      ↓
Camera composition
      ↓
Lighting study
      ↓
Perspective / Building proportions
      ↓
Hand-painted reconstruction
      ↓
Niakofa 2.5D environment
```

Niakofa is **not** a 3D game. Runtime stays 2D/2.5D. Art production may use 3D as an optional foundation layer.

---

## Vocations and Uniforms Pipeline (Blender)

The `Vocations_and_Uniforms.blend` file contains modular character/clothing data.

Potential pipeline:

```
3D CHARACTER BASE
        +
VOCATION / UNIFORM (Farmer, Teacher, Trader, Soldier, Fisherman, Healer, Student, Craftsperson, Mission Worker, Elder, Modern Professional)
        +
ERA CLOTHING
        +
REGION VARIANT
        ↓
POSE + LIGHT + RENDER
        ↓
HAND-DRAWN / PAINTERLY OVERPAINT
        ↓
2D NIAKOFA CHARACTER ASSET
```

**Status:** Inspect contents in Blender 3.x before production use. Verify license terms before using any mesh as a render base.

---

## Animation Frame Reference (Red Mage Free Demo)

Animation state machine structure derived from the Free Demo (reference only — visuals are not Niakofa style):

```
CHARACTER
    ↓
ANIMATION CONTROLLER
    ↓
Idle (loop)
Walk (loop)
Run (loop)
Interact (one-shot)
Hurt (one-shot)
Attack (one-shot)
Cast / Skill (one-shot)
Death (one-shot)
    ↓
FRAME EVENTS (future)
    ↓
Footstep sound
Hit frame
Projectile spawn
Effect spawn
Camera shake
```

Frame strip format reference:
- Frame height: 128px
- GIF preview: 384×384
- Horizontal strip: `(frameCount × 128) × 128`

---

## Assets Currently in Niakofa

| Asset | Status | Location |
|-------|--------|----------|
| Kwame idle/walk 4-dir | ✅ Hand-drawn | `public/legacy-character-assets/kwame-mensah/atlas/` |
| Kwame run 4-dir | ✅ Hand-drawn | same |
| Kwame hurt 4-dir | ✅ Hand-drawn | same |
| Kwame talk 8-dir | ✅ Hand-drawn | same |
| Kwame inspect/interact/pick-up | ✅ Hand-drawn | same |
| Kwame combat clips (attack, dodge, guard, jump, aerial, land) | ⏳ Commissioned — pending delivery | `kwame-sprite-atlas.ts` KWAME_PENDING_ART_CLIPS |
| Kwame portrait / dialogue bust / face | ⏳ Commissioned — pending delivery | `niakofa-character-asset-library.ts` |
| Environment scenes (CSS-painted) | 🔄 Prototype | `legacy-chapter-environment.tsx` |
| Mensah compound (hand-painted) | ⏳ Pending | — |

---

_Last updated: Aug 2026_
_Maintainer: Niakofa art direction_
