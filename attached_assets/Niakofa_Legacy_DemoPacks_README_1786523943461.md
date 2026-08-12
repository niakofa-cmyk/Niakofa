# Niakofa Legacy RPG — Demo Asset Packs

These two packs are the curated visual layer for the **House of Mensah** vertical-slice
demo described in the Niakofa Legacy design notes. They are deliberately *not* a raw
dump of the source ZIPs — each has been cleaned (no `__MACOSX`/`.DS_Store` junk),
sorted into a usable folder structure, filtered down to what the demo actually needs,
and indexed in a `catalog.json` so a character/world engine can reference assets by
ID instead of hard-coded filenames.

Per the design notes' own architecture principle:

> "ZIP = visual vocabulary. Niakofa = intelligence."

Nothing in these packs decides who a family member is, what happened to them, or how
the world should change. That's the job of the Family Vault → AI Extraction →
Knowledge Graph → World Regeneration pipeline. These packs only supply the pixels.

---

## What's inside

### 1. `CharacterPack/` (from `generator.zip`)
The RPG-Maker-style character generator — **4,226 assets**, exactly matching the
count the design notes cite. Organized into `Face/`, `TV/`, `TVD/`, `SV/`,
`Variation/`, each split by `Male/Female/Kid`, plus the four `grad_*.png` recolor
gradients. See `CharacterPack/README.md`.

### 2. `WorldPack/` (curated from `img.zip`)
The 2D tile/sprite/UI subset needed to build villages, interiors, dialogue, HUD,
and weather. See `WorldPack/README.md` and `WorldPack/EXCLUDED_ASSETS.md` for what
was deliberately left out and why.

---

## How this maps to the Golden Path

The design notes define one canonical end-to-end test — the thing that, if it works,
proves the whole Niakofa Legacy concept:

```
CREATE FAMILY → ADD ANCESTOR → RECORD STORY → AI EXTRACTS FACTS
→ KNOWLEDGE VERSION +1 → WORLD REGENERATES
→ NEW CHARACTER + NEW PLACE + NEW QUEST + NEW CHAPTER SEED
→ PLAYER ENTERS THE CHANGED WORLD
```

These packs supply the two things that "new character" and "new place" actually
render as:

| Golden Path event                  | Asset pack                  | What renders |
|---|---|---|
| New ancestor discovered            | `CharacterPack/TV` + `Face` | A walking sprite + dialogue portrait, composed from Body/Hair/Clothing/Face layers |
| New NPC generated (e.g. "Kofi")    | `CharacterPack/TV` + `Face` | Same resolver, different appearance seed |
| New landmark / building appears    | `WorldPack/tilesets`, `sprites/Buildings` | A village compound, trading house, market stall, etc. |
| World state changes (prosperous → collapsed) | `WorldPack/sprites/Buildings/Ravaged Houses` + `WorldPack/weather` | Same building, damaged variant; rain/fog for tone |
| Oral story recorded → "World Updated" moment | `WorldPack/ui/Dialogue`, `WorldPack/system/ActionName*`, `WorldPack/eventindicators` | Dialogue box, "new discovery" banner, quest marker |
| Player HUD (health/energy/XP)      | `WorldPack/ui/Bars`, `WorldPack/system` | Relabel per the notes: Health→Health, Energy→Stamina, XP→Knowledge, etc. |
| Migration / origin-region roots    | `WorldPack/parallaxes`, `WorldPack/tilesets/Biomes` | Sky, ocean, mountain backdrops for the migration sequence |

---

## Vertical-slice scene checklist (Phase 1 from the design notes)

Everything needed for **one playable 1890 Mensah village scene** is present:

- [x] Outdoor village tileset — `WorldPack/tilesets/Outside_A1-A5, B, C`
- [x] Furniture/interior tileset (for the family compound interior) — `WorldPack/tilesets/Furniture`, `Inside_A1-A5`
- [x] Trees (2D, retro style) — `WorldPack/trees`
- [x] Buildings incl. a damaged/"collapse" variant — `WorldPack/sprites/Buildings`
- [x] Player + NPC walking sprites (father, mother, elder, merchant "Kofi", child) — `CharacterPack/TV`
- [x] Dialogue portraits for the same cast — `CharacterPack/Face`
- [x] Dialogue box, Yes/No, name box — `WorldPack/ui/Dialogue`
- [x] Quest / discovery indicators — `WorldPack/eventindicators`
- [x] HUD bars, gold, level — `WorldPack/ui/Bars`, `WorldPack/system`
- [x] Weather (rain for the "Collapse" chapter, light/particles for "Golden Years") — `WorldPack/weather`
- [x] Collectibles reframed as "Legacy Artifacts" (flowers, ledgers-as-items, food) — `WorldPack/sprites/Collectibles`, `Items`, `Food`

Not needed for Phase 1, present for later phases:

- `CharacterPack/SV` — reserved for optional future action sequences (design notes: "Niakofa doesn't need to become a combat RPG")
- `CharacterPack/TVD` — reserved for world-state variant sprites
- `WorldPack/titles_reference/` — generic RPG-Maker title-screen fantasy art, kept only as a styling reference, **not for direct use** (dragons/castles/swords are explicitly Tier-3 "do not use" per the notes)

---

## Explicit "do not use" (Tier 3, per design notes)

- Dungeon tilesets (removed from `WorldPack/tilesets` already)
- Fantasy character layers: beast ears, tails, wings, cloaks (flagged in `CharacterPack/catalog.json` under `tier_notes.tier3_not_for_niakofa_fantasy_layers`)
- Generic knight/mage/elf/dragon content, and the title-screen medieval fantasy set — reference only

## License note

These are third-party RPG Maker-style asset packs. Before shipping the House of
Mensah demo publicly, confirm the license terms attached to the original packs
(the generator catalog in the design notes flags `licenseStatus: "review-required"`
— carry that same flag forward here).
