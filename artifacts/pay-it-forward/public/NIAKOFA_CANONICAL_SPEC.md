# Niakofa Canonical Resolution — Character Scale & World Art Direction

> **Source:** `NIAKOFA CANONICAL RESOLUTION + CHARACTER SCALE WORLD ART` (Aug 2026)
> This is the authoritative design specification for the Niakofa Legacy RPG.

---

## World Art Style

| Dimension | Specification |
|-----------|--------------|
| **Style** | Hand-drawn / stylized 2–2.5D |
| **Camera** | Semi-top-down exploration |
| **Character** | Modular/generated but visually unified |
| **Animation** | Frame-based |
| **Movement** | 8-direction capability (eventual) |
| **Lighting** | Real-time overlays |
| **Weather** | Runtime effects |
| **Time** | World-state driven |
| **World** | Hand-authored foundation + procedurally populated Legacy content |

---

## Visual Identity Formula

```
HAND-DRAWN CHARACTER ART
+
PAINTERLY ENVIRONMENTS
+
AFRICAN-INSPIRED VISUAL IDENTITY
+
ANIME-INFLUENCED SILHOUETTES
+
2–2.5D DEPTH
+
FRAME-BASED ANIMATION
+
CINEMATIC PRESENTATION
= Niakofa Original Visual Identity
```

---

## Calibration Character: Kwame Mensah

**Kwame Mensah (Age 16, 1912, Cape Coast)** is the single canonical calibration
character. All world scale decisions derive from his master character sheet.

### World Scale Hierarchy

```
KWAME MASTER CHARACTER
    ↓
Character height in world units
    ↓
Doorway height
    ↓
Furniture scale
    ↓
NPC scale
    ↓
Building scale
    ↓
Street width
    ↓
Camera framing
    ↓
Map composition
```

### Environment Validation Test
Before approving any environment asset, ask:
- Can Kwame **walk behind** it?
- Can Kwame **walk in front** of it?
- Can Kwame be **partially occluded** by it?
- Can Kwame **enter** it?
- Can Kwame **collide** with it?
- Can Kwame **interact** with it?
- Can Kwame **cast a shadow** near it?

### Character Master Sheet Format
```
              FRONT
               [Kwame]
LEFT  [Kwame]           [Kwame]  RIGHT
               [Kwame]
                BACK
```
Defines: Canvas Width/Height · Visible Character Height · Foot Anchor ·
Collision Box · Interaction Point · Shadow Area · Camera Scale

---

## Character DNA System

```
FAMILY MEMBER
    ↓
CHARACTER IDENTITY
    ├── Name / Birth / Death
    ├── Relationships
    ├── Location / Occupation / Era
    └── Stories / Traits
    ↓
CHARACTER DNA
    ↓
VISUAL PROFILE
    ↓
AGE PROFILE
    ↓
ERA PROFILE
    ↓
REGIONAL PROFILE
    ↓
CLOTHING PROFILE
    ↓
ANIMATION PROFILE
    ↓
RUNTIME CHARACTER
```

### Character Evolution Example (Kwame)

| Life Stage | Age | Year | Clothing | Status |
|-----------|-----|------|----------|--------|
| Youth | 16 | 1912 | Mission School uniform | Student at Cape Coast |
| Young Adult | 25 | 1921 | Trader cloth | Running trading house |
| Mature | 50 | 1946 | Elder formal | Head of extended family |

---

## Animation Specification

### Canonical Animation Set (Exploration)

| State | Directions | Recommended Frames | FPS |
|-------|-----------|-------------------|-----|
| Idle | 4 | 4–8 | 6–10 |
| Walk | 4 | 6–8 | 8–12 |
| Run | 4 | 6–8 | 10–14 |
| Talk | 4 | 2–4 | Variable |
| Interact | 4 | 4–8 | Variable |
| Inspect | 4 | 4–6 | Variable |
| Pick Up | 4 | 6–8 | Variable |
| Hurt | 4 | 4–6 | Variable |

**Directions:** DOWN · LEFT · RIGHT · UP

### Character DNA → Generated Animation
```
NIAKOFA CHARACTER DNA
    ↓
Generated Portrait
    ↓
Generated Exploration Model
    ↓
Generated Animation Set
    ↓
Generated Combat Representation
```

---

## Map Layer Architecture

Each playable location contains 15 layer types:

```
MAP
│
├── 1. Terrain
├── 2. Paths
├── 3. Buildings
├── 4. Interior Portals
├── 5. Props
├── 6. Vegetation
├── 7. Water
├── 8. Collision
├── 9. Navigation
├── 10. Interaction Points
├── 11. NPC Spawn Points
├── 12. Story Events
├── 13. Foreground Occlusion
├── 14. Lighting
├── 15. Weather
├── 16. Audio Zones
└── 17. Legacy World State  ← THIS IS WHAT MAKES NIAKOFA UNIQUE
```

---

## Living World System

```
AUTHORED WORLD
+
LIVING FAMILY DATA
    ↓
"Your grandfather attended school in Cape Coast."
    ↓
AI EXTRACTION
    ├── PERSON: Grandfather
    ├── PLACE: Cape Coast
    ├── EVENT: Attended school
    └── TIME: 1912
    ↓
KNOWLEDGE GRAPH UPDATE
    ↓
WORLD EVENT GENERATED
    ↓
MISSION SCHOOL MAP UPDATED
    ↓
NEW NPC + NEW ARTIFACT + NEW DIALOGUE + NEW QUEST
```

---

## Runtime Architecture (THREE-LAYER)

```
┌──────────────────────────────────┐
│         NIAKOFA APP              │
│                                  │
│  React / Platform UI             │
│  Family Tree · Family Vault      │
│  Recording · Video · Microphone  │
│  Legacy Dashboard                │
│  Character Management            │
└───────────────┬──────────────────┘
                │ Shared Data
                ▼
┌──────────────────────────────────┐
│     LEGACY / WORLD SERVICE       │
│                                  │
│  Family Graph · Memories         │
│  Transcripts · Characters        │
│  Relationships · World State     │
│  Quests · Chapters               │
└───────────────┬──────────────────┘
                ▼
┌──────────────────────────────────┐
│      NIAKOFA GAME RUNTIME        │
│                                  │
│  Main Loop · Renderer · Input    │
│  Camera · Movement · Collision   │
│  Animation · NPC AI · Dialogue   │
│  Quest System · Inventory        │
│  Map Runtime · Weather           │
│  Lighting · Audio · Save/Load    │
└──────────────────────────────────┘
```

> **Critical:** React should not become the game engine itself.
> React remains the powerful Niakofa application layer.
> The dedicated game runtime handles real-time movement and simulation.

---

## Production Quality Table

| Quality Principle | Niakofa Implementation |
|-------------------|----------------------|
| Strong visual cohesion | One Niakofa visual bible |
| Distinct cultural world | African + diaspora + family-specific worldbuilding |
| Hand-crafted presentation | Canonical art direction |
| Animated characters | Modular character animation system |
| Large RPG world | Connected historical/living regions |
| Story progression | Family history chapters |
| NPCs | Generated family-linked NPCs |
| Combat/action | Optional phased implementation |
| Cinematic moments | Memory/story events |
| World identity | Era + region + family identity |
| High production quality | Asset validation + runtime standards |

---

## Final Niakofa Formula

```
Enhanced HIGH Quality-Level VISUAL COHESION
+
Enhanced HIGH Quality-Level RPG PRESENTATION
+
NIAKOFA ORIGINAL HAND-DRAWN 2–2.5D ART
+
LIVING FAMILY DATA
+
CHARACTER EVOLUTION
+
GENERATIVE NPC POPULATION
+
MEMORY-DRIVEN WORLD UPDATES
+
REAL PLAYABLE EXPLORATION
+
CINEMATIC STORYTELLING
= A REAL, COHERENT, PLAYABLE RPG WORLD
```

---

*Canonical specification — last updated August 2026*
