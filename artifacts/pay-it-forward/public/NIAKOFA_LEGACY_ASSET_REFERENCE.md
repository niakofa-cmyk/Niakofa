# Niakofa Legacy — Asset Review Reference

This document records every external asset reviewed for Niakofa Legacy RPG
(House of Mensah demo). It is the authoritative record of what was assessed,
why each decision was made, and what is approved for use.

**Canonical art direction:** Hand-drawn / stylized 2–2.5D, semi-top-down,
warm West African palette, 1890s–present Gold Coast / Ghana. Kwame Mensah
(age 16, 1912, Cape Coast) is the calibration character for all world scale.

See `NIAKOFA_CANONICAL_SPEC.md` for the full authoritative design specification.

---

## Session 1 Assets (Aug 2026, Batch 1)

### ❌ LMBS Plugin ZIPs
- **Files:** `lmbs_ATB_*.zip`, `lmbs_OTB_*.zip` (multiple)
- **Content:** RPG Maker MV JavaScript combat plugins (ATB/OTB battle systems)
- **Verdict:** REJECTED — Wrong engine (RPG Maker MV), fantasy combat focus,
  no West African cultural context, wrong technical format
- **Rule enforced:** No RPG Maker MV plugins; Niakofa is React/Vite

---

### ❌ The Dude Free Character Sprites
- **File:** `The_Dude_Free_*.zip`
- **Content:** Modern sidescroller character sprites, side-view perspective
- **Verdict:** REJECTED — Wrong perspective (sidescroller vs semi-top-down),
  modern aesthetic, wrong era
- **Rule enforced:** Semi-top-down only; 1890s Gold Coast era

---

### ❌ SHADOW Series Shadeflit
- **File:** `SHADOW_Series_Shadeflit_*.rar`
- **Content:** Shadow silhouette character sprites
- **Verdict:** REJECTED — Silhouette style incompatible with Niakofa's warm,
  character-forward aesthetic; wrong visual language

---

### ❌ FFXIV Dialogue Overlay Maker
- **File:** `FFXIV_Dialogue_Overlay_Maker_*.zip`
- **Content:** Windows .exe application with embedded Myriad Pro font
- **Verdict:** REJECTED — Windows executable (not web-compatible); Myriad Pro
  is proprietary Adobe font; FFXIV visual style incompatible

---

### ✅ Mana Seed Farmer Sprite — CHARACTER RESOLVER 2.0 REFERENCE
- **File:** `Mana_Seed_Farmer_Sprite_Free_Sample_*.zip`
- **Content:** LPC-adjacent layered character sprite system
- **Verdict:** REFERENCE — Layer naming model is the specification for
  Niakofa's Character Resolver 2.0:
  `01body` → `03fot1` → `04lwr1` → `05shrt` → `13hair` → `14head`
  + era + age-stage + deterministic seed per characterId
- **Location:** Reference documentation in `public/NIAKOFA_LEGACY_ASSET_REFERENCE.md`

---

## Session 2 Assets (Aug 2026, Batch 2)

### 💡 Protagonist Producer
- **File:** `Protagonist-Producer-main_1786754566914.zip`
- **Content:** Vite + vanilla JS app — AI character name, synopsis, and DALL-E
  portrait generator using OpenAI API (gpt-3.5-turbo-instruct + DALL-E 2)
- **Verdict:** REFERENCE — Cannot use directly (vanilla JS, no TypeScript,
  deprecated model). The AI prompt engineering patterns for character
  generation (name → backstory → portrait in one flow) are directly
  applicable to Niakofa's future Character DNA → NPC generator system.
- **Key patterns to adapt:**
  - Character name generation: `"Generate a short and creative character name for [description]"`
  - Backstory generation with structured fields (name/occupation/motivation/synopsis)
  - Portrait prompt: `"Create a character portrait for [description] with name [name]. Appropriate background, artstyle, no text."`
- **Niakofa adaptation:** These prompts will seed the Character DNA pipeline
  (Family Member → Identity → Visual Profile → Runtime Character)

---

### ✅ Tavern Card Crafter v3 Prime — CHARACTER CARD V3 REFERENCE
- **File:** `tavern-card-crafter-v3-prime_1786754571187.zip`
- **Content:** Full React + TypeScript + Tailwind + shadcn/ui app — AI
  character card creation tool implementing the Character Card V3 specification
- **License:** MIT (Copyright 2026 Your Mum / 2025 Idun)
- **Verdict:** HIGH VALUE REFERENCE — MIT license; Character Card V3 format
  is the industry standard for AI NPC definition. Directly adapted into
  Niakofa's `NpcDefinition` type.
- **Character Card V3 fields adapted into NpcDefinition:**

  | Card V3 Field | Niakofa Implementation |
  |---------------|----------------------|
  | `first_mes` | `openingLine?: string` — opening line on first encounter |
  | `mes_example` | `exampleDialogue?: string` — tone/vocabulary reference |
  | `system_prompt` | `systemPrompt?: string` — NPC behavioral identity for AI generation |
  | `creator_notes` | `creatorNotes?: string` — internal design notes |
  | `character_book` (lorebook) | `lorebook?: NpcLorebookEntry[]` — keyword-activated memory context |
  | Lorebook `keys` | `NpcLorebookEntry.keys: string[]` — memory tags that activate entry |
  | Lorebook `constant` | `NpcLorebookEntry.constant?: boolean` — always-active entries |
  | Lorebook `insertion_order` | `NpcLorebookEntry.insertionOrder?: number` — priority |
  | Lorebook `content` | `NpcLorebookEntry.content: string` — narrative context unlocked |

- **Key innovation:** `requiresMemoryTag?: string` on `DialogueOption` implements
  the lorebook keyword-activation pattern — past events the player witnessed
  unlock deeper dialogue branches on future NPC visits.
- **Source type definitions:** `src/types/charactercard.ts` in the zip

---

### ✅ Male LPC Combined Spritesheet — TOP-DOWN CHARACTER REFERENCE
- **File:** `Male_spritesheet_all_1786754581120.png`
- **Dimensions:** 1280 × 33152 pixels (8.8 MB)
- **Frame size:** 64 × 64 pixels (LPC standard)
- **Frames per row:** 20
- **Total rows:** ~518
- **License:** CC-BY-SA (standard LPC / Liberated Pixel Cup license)
  **Attribution required before any production use**
  See: https://lpc.opengameart.org/
- **Verdict:** CONDITIONALLY USABLE — Correct perspective (semi-top-down),
  correct frame size, correct animation structure. Contains dozens of
  character variants (different skin tones, body types) across rows.
  West African skin tones are present in the sheet.
- **Stored at:** `public/legacy-character-assets/lpc-reference/lpc-male-combined-sheet.png`
- **Niakofa use:**
  - Walk rows (0-3: down/left/right/up) — 9 frames each
  - Idle = frame 0 of walk row
  - Hurt rows (20-23) for future use
  - Must recolor/identify the correct skin tone rows for Kwame (tone-3 canonical)
  - LPC spec documented in `src/lib/legacy-character-evolution.ts` → `LPC_SPRITESHEET_SPEC`
- **Production gate:** Must verify exact CC-BY-SA attribution requirements and
  identify which row contains the canonical West African skin tone before shipping

---

### ✅ Female LPC Combined Spritesheet — TOP-DOWN CHARACTER REFERENCE
- **File:** `Female_spritesheet_all_1786754613573.png`
- **Dimensions:** 1280 × 34944 pixels (8.2 MB)
- **Frame size:** 64 × 64 pixels (LPC standard)
- **Total rows:** ~546 (slightly more than male — additional animation variants)
- **License:** CC-BY-SA (same as male sheet)
- **Verdict:** CONDITIONALLY USABLE — Same assessment as male sheet.
  Grandma Ama's sprite will eventually use the correct female LPC rows.
- **Stored at:** `public/legacy-character-assets/lpc-reference/lpc-female-combined-sheet.png`
- **Production gate:** Same as male sheet above

---

### ✅ Niakofa Canonical Resolution Document — AUTHORITATIVE SPEC
- **File:** `Pasted-NIAKOFA-CANONICAL-RESOLUTION-CHARACTER-SCALE-WORLD-ART-_1786754753532.txt`
- **Content:** Complete Niakofa design specification — art style, character
  scale, animation targets, map architecture, runtime architecture,
  Living World system, Character Evolution system
- **Verdict:** AUTHORITATIVE — This IS the design law for Niakofa Legacy.
  All future asset and code decisions must be validated against this document.
- **Published as:** `public/NIAKOFA_CANONICAL_SPEC.md` (formatted version)
- **Key decisions encoded:**
  - Kwame Mensah (16, 1912) is the calibration character
  - Runtime architecture: React App | World Service | Game Runtime (3 layers)
  - Character DNA → Visual/Age/Era/Regional/Clothing/Animation Profiles
  - 17-layer map structure (Layer 17 = Legacy World State = unique differentiator)
  - Living World = Authored World + Living Family Data → Knowledge Graph
  - Animation targets: Idle 4-8f, Walk 6-8f, Talk 2-4f, Interact 4-8f
- **Implemented in:** `src/lib/legacy-character-evolution.ts` →
  `KWAME_DNA`, `CharacterDNA`, `CharacterLifeStage`, `LPC_SPRITESHEET_SPEC`

---

### ❌ 72 Character Free (18-character sample)
- **File:** `72_Character_Free_1786754960940.zip`
- **Content:** 18 character spritesheets out of a 72-character pack,
  each 768 × 1408 PNG
- **License:** NOT FOUND — no license file in the zip
- **Verdict:** REJECTED — No license = cannot use in any capacity.
  Additionally, visual style assessment (768px-wide multi-frame sheets,
  generic naming) suggests these are fantasy/modern RPG characters
  incompatible with 1890s West Africa aesthetic.
- **Rule enforced:** Assets without explicit license documentation cannot
  be integrated regardless of visual appeal

---

## Asset Integration Summary

| Asset Category | Files | Location | Status |
|---------------|-------|----------|--------|
| Inventory sprites (Mana Seed layer ref) | Style variants 01a-01d, 02a | `public/legacy-rpg-assets/inventory/` | ✅ Reference |
| Village environment pack | 11 assets | `public/legacy-village-assets/` | ✅ In use |
| LPC male spritesheet | 1 file (8.8 MB) | `public/legacy-character-assets/lpc-reference/` | ⚠️ CC-BY-SA gate |
| LPC female spritesheet | 1 file (8.2 MB) | `public/legacy-character-assets/lpc-reference/` | ⚠️ CC-BY-SA gate |

---

## Character Resolver Road Map

### Resolver 2.0 — Layered Character Composition
Based on the Mana Seed layer model and the Canonical Resolution spec:

```
CharacterDNA
  ├── appearanceSeed (deterministic from familyId + characterId)
  ├── skinTone (tone-1 to tone-6, LPC row mapping)
  ├── era (precolonial | colonial-gold-coast | contemporary...)
  └── lifeStages
        └── CharacterLifeStage
              ├── bodyType (youth | adult | mature | elder)
              ├── clothingStyle (student-colonial | trader-cloth | elder-formal...)
              └── spriteVariant → LPC row + clothing layer overlay
```

Layers to compose (in render order):
1. **Body** — LPC skin tone row (01body equivalent)
2. **Feet** — footwear appropriate to era/status (03fot1 equivalent)
3. **Lower** — era clothing lower body (04lwr1 equivalent)
4. **Upper** — era clothing upper body (05shrt equivalent)
5. **Hair** — culturally appropriate (13hair equivalent)
6. **Head** — headwear / accessories (14head equivalent)
7. **Lighting overlay** — atmospheric era coloring

Implementation target: `src/components/legacy-character-sprite.tsx`

---

## Usage Rules (Non-Negotiable)

1. **No historical identity claim.** Characters are created characters, not
   digitizations of real historical people.
2. **No AI faces.** No DALL-E or generative facial portraits for NPCs without
   explicit design review.
3. **License-gated.** Any asset without a verified open license is rejected.
   CC-BY-SA requires attribution in the app before shipping to production.
4. **Era validation.** Every asset must be validated against "Could this exist
   in 1890s Gold Coast?" OR have an explicit era exception.
5. **Kwame calibration.** Before approving any environment asset, verify the
   seven Kwame calibration questions (walk behind, walk in front, occlude,
   enter, collide, interact, cast shadow).

---

*Last updated: August 2026 — Session 2 (6 additional assets assessed)*
