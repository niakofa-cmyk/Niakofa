# NIAKOFA LEGACY — ART BIBLE & CHARACTER SPECIFICATION

**Version:** 1.0 · August 14, 2026  
**Status:** CANONICAL — all development must conform to these specifications

---

## 1. WORLD ART STYLE

| Property | Specification |
|---|---|
| Style | Hand-drawn / stylized 2–2.5D |
| Camera | Semi-top-down exploration |
| Inspiration | Aurion (African RPG), African anime, hand-drawn 2D |
| Animation | Frame-based |
| Movement | 4-direction (8-direction expansion planned) |
| Perspective | Semi-top-down (2.5D depth) |
| Resolution | 1920×1080 target |
| Tile Size | 64×64 px |
| Character Scale | 1.65m = 2.5 tiles in-game |
| Character Footprint | 32×48 px |
| Frame Rate | 60 FPS target, animation 12 FPS |
| Color Palette | Warm earth tones, rich greens, ocean blues |

---

## 2. CANONICAL CHARACTER: KWAME MENSAH

Kwame is the **calibration character** — all world scale derives from him.

### Identity
```
Name:       Kwame Mensah
Age:        16
Year:       1912
Location:   Cape Coast, Gold Coast (present-day Ghana)
Role:       Student / Protagonist
Status:     Alive
Occupation: Student / Errand Runner
Faction:    Family
Alignment:  Good
```

### Physical Description
```
Height:     1.65m (165 cm)
Body Type:  Lean / Youthful
Skin Tone:  #3D2116 (warm dark brown)
  Highlight:  #7B4A2D
  Shadow:     #2A1208
Hair:       Short, tight curls — #1A0F08
Eyes:       Dark brown — #2D1B0E
```

### Clothing (Starting Equipment)
```
Shirt:      Simple cotton — #D4C5A0 (cream/off-white), shadow #BBA880
Trousers:   Short — #8B7355 (olive brown), shadow #6B5A3E
Belt/Tie:   #A0783C (rope belt)
Sandals:    Village leather — #5C3D1E (dark), #8B6040 (strap)
Accents:    #B87333 (copper), #C6882A (warm gold)
```

### Character Color Palette
| Layer | Hex |
|---|---|
| Skin | #3D2116 |
| Skin Highlight | #7B4A2D |
| Hair | #1A0F08 |
| Shirt | #D4C5A0 |
| Pants | #8B7355 |
| Sandals | #5C3D1E |
| Accents | #B87333 |
| Environment Warm | #C4A882 |

### Stats (Chapter 1 Starting Values)
| Stat | Value | Max |
|---|---|---|
| Health | 100 | 100 |
| Knowledge | 80 | 100 |
| Courage | 70 | 100 |
| Faith | 60 | 100 |
| Reputation | 40 | 100 |

### Skills (Level 1)
- Learning · Level 1
- Discovery · Level 1
- Resolve · Level 1
- Empathy · Level 1

### Traits
- Curious · Kind-Hearted · Determined

### Expressions
| Expression | Context |
|---|---|
| Neutral | Default / resting |
| Curious | Exploration / discovery |
| Determined | Challenge / mission |
| Thoughtful | Dialogue / decision |
| Surprised | Revelation / shock |
| Happy | Success / reunion |
| Worried | Danger / loss |

---

## 3. ANIMATION SPECIFICATION

### State × Direction Matrix

| State | Directions | Recommended Frames | FPS |
|---|---|---|---|
| Idle | 4 | 4–8 | 6–10 |
| Walk | 4 | 6–8 | 8–12 |
| Run | 4 | 6–8 | 10–14 |
| Talk | 4 | 2–4 | 8 |
| Interact | 4 | 4–8 | 10 |
| Inspect/Examine | 4 | 4–6 | 8 |
| Pick Up | 4 | 6–8 | 10 |
| Hurt | 4 | 4–6 | 10 |
| Emote | 1 | 4–8 | 8 |
| Jump/Land | 4 | 6–8 | 12 |

### Directions
- DOWN (toward camera) — primary/default
- LEFT
- RIGHT
- UP (away from camera)

### Combat Poses (Phase 2)
- Light Attack (Slash)
- Heavy Attack (Thrust)
- Dodge / Roll
- Jump Attack
- Block / Guard
- Aerial Attack
- Interact / Talk

---

## 4. CHARACTER EVOLUTION SYSTEM

Kwame ages through the Legacy experience:

```
KWAME — AGE 16 (1912)
  Cape Coast · Student · Chapter 1
  Starting clothing, youthful appearance

KWAME — AGE 25 (1921)
  New chapter · Different clothing
  New responsibilities · Different story knowledge

KWAME — AGE 50
  Family expanded · Occupation evolved
  New locations · New relationships
```

**Character DNA Pipeline:**
```
Family Member
  → Character Identity (Name, Birth, Era, Occupation, Stories, Traits)
  → CHARACTER DNA
  → Visual Profile
  → Age Profile
  → Era Profile
  → Regional Profile
  → Clothing Profile
  → Animation Profile
  → Runtime Character
```

---

## 5. WORLD SCALE HIERARCHY

**All environment design derives from Kwame's canonical height:**

```
Kwame Master Character (1.65m)
  → Character height in world units (2.5 tiles)
  → Doorway height (≥ 3 tiles)
  → Furniture scale
  → NPC scale
  → Building scale
  → Street width (≥ 6 tiles)
  → Camera framing
  → Map composition
```

**Asset validation checklist — every environment asset must answer:**
- Can Kwame walk behind it? (foreground occlusion)
- Can Kwame walk in front of it?
- Is Kwame partially occluded when behind?
- Can Kwame enter it? (interior portal)
- Does Kwame collide with it? (collision box)
- Can Kwame interact with it? (interaction point)
- Does Kwame cast a shadow near it? (lighting layer)

---

## 6. ENVIRONMENT CATALOG

### Locations (Chapter 1: Cape Coast, 1912)
| ID | Name | Description |
|---|---|---|
| ancestral_village | Ancestral Village | Starting village, family compound, baobab tree |
| cape_coast_market | Cape Coast Market | Busy colonial-era market square |
| coastal_town | Coastal Town | Cape Coast waterfront, colonial buildings |
| colonial_town | Colonial Town | British colonial administration buildings |
| mission_school | Mission School | Chapter 2 — Kwame's school |
| coastal_port | Coastal Port | Chapter 3 — Trade, ships, ocean view |
| cocoa_farm | Cocoa Farm | Chapter 4 — Family farming land |
| forest_path | Forest Path | Between locations, nature |
| cliffside_trail | Cliffside Trail | Coastal cliffs, dramatic views |
| cave_entrance | Cave Entrance | Mystery location |

### Tileset Specification
```
Base Tile:      64×64 px
Grid Offset:    32 px (isometric offset for 2.5D depth)
Layers:         Ground → Decoration → Buildings → Props → Foreground → Lighting
```

### Buildings
- Village Hut · Market Stall · Storehouse · Town House
- Mission Church · Colonial Building · Blacksmith
- Boat House · Cocoa Warehouse

### Natural Elements
- Baobab · Palm Tree · Mango Tree · Cocoa Tree · Banana Tree · Acacia
- Bushes · Flowers · Rocks · Cliffs · Water · Shore

### Props & Objects
- Barrels · Chest · Well · Ladder · Switch
- Readable Book · Crate Stack · Notice Board · Farm Tools · Campfire

### Interactive Objects
- Door · Pushable Crate · Lever · Well Bucket · Notice Board (readable)

### Vehicles & Transport
- Oxcart · Horse Cart · Train · Sail Ship

### NPC Types at Scale
- Kwame (16, Youth) — calibration reference
- Farmer · Elder · Merchant · Woman · Student · Soldier · Priest

### Lighting Modes
| Mode | CSS Filter Approach |
|---|---|
| Morning | warm yellow wash, long shadows |
| Midday | neutral, harsh shadows |
| Evening | orange-amber, long soft shadows |
| Night | deep blue-black overlay, lantern warmth |
| Rainy Day | grey-blue, reflections, rain overlay |

### Weather Effects
- Clear · Cloudy · Light Rain · Heavy Rain

---

## 7. HUD / UI SPECIFICATION

```
Character portrait (top-left)
HP bar (red)
SP / Stamina bar (blue)
EXP bar (gold)
Currency: cowrie shells (🐚) / colonial coins

Inventory: grid slots
Journal: auto-populated
Quest tracker (top-right): Chapter N: [title]
  • Task 1 ✓
  • Task 2
  • Task 3 (locked)

Minimap (top-right corner)
Dialogue box (bottom, character portrait + name plate)
```

---

## 8. ART ASSET LOCATIONS

All canonical art assets live under `artifacts/pay-it-forward/public/`:

```
public/
  legacy-character-assets/
    kwame/
      kwame-master-reference.png     ← Primary spec sheet (most detailed)
      kwame-character-sheet-v1.png   ← Full sheet with combat poses
      kwame-4direction-sprites.png   ← 4-direction sprite sheet reference
      kwame-fullspec-combat.png      ← Full spec + combat + dialogue
      kwame-ingame-preview.png       ← In-game viewport preview
      niakofa-rpg-overview.png       ← Full RPG overview (UI, world, map)
  legacy-environment-assets/
    niakofa-environment-full-sheet.png  ← Complete tilesets, buildings, props
    niakofa-environment-assets-dark.png ← Dark theme reference
```

---

## 9. TECHNICAL RUNTIME SPECIFICATION

```
Game Type:    2.5D Hand-Drawn RPG
Perspective:  Semi-Top-Down 2.5D
Build:        Hand-Drawn 2D (Aurion-like)
Animation:    Frame-Based
Resolution:   1920×1080 (HD)
Tile Size:    64×64 px
Frame Rate:   60 FPS
Anim FPS:     12
Player Dirs:  4 (8 later)
Platforms:    PC, Mobile (Android/iOS), Web, Console

Runtime Components (planned):
  Player Controller
  Animation State Machine
  Combat System (Combo / Skills)
  NPC AI & Schedules
  Quest System
  Inventory & Items
  World Stratagem (Family-driven)
  Dialogue System
  Save / Load System
  Day/Night & Weather System
  Legacy World State Manager
```

---

## 10. PRODUCTION QUALITY TARGET

**95% toward Aurion quality** (stated goal from reference art)

> "With full production, voice acting, orchestral music, and polish, we will surpass Aurion."

### Quality Principles
| Principle | Niakofa Implementation |
|---|---|
| Strong visual cohesion | One Niakofa visual bible (this document) |
| Distinct cultural world | African + diaspora + family-specific worldbuilding |
| Hand-crafted presentation | Canonical art direction per this spec |
| Animated characters | Modular character animation system |
| Large RPG world | Connected historical/living regions |
| Story progression | Family history chapters |
| NPCs | Generated family-linked NPCs |
| Cinematic moments | Memory/story events |
| World identity | Era + region + family identity |

---

*This document is the authoritative art bible. All component implementations, sprite work, and environment design must conform to these specifications.*
