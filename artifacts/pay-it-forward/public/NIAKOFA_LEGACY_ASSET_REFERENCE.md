# Niakofa Legacy — Asset Review Reference

This document records every external asset reviewed for Niakofa Legacy RPG
(House of Mensah demo). It is the authoritative record of what was assessed,
why each decision was made, and what is approved for use.

**Canonical art direction:** Hand-drawn / stylized 2–2.5D, semi-top-down,
warm West African palette, 1890s Gold Coast era. Kwame Mensah (age 16, 1912)
is the calibration character for all world scale.

---

## ✅ APPROVED — In Production

### Free Inventory UI Sprites (ElvGames)
- **Source:** `Free_Inventory_1786753104097.zip`
- **Files in production:** `public/legacy-rpg-assets/inventory/`
  - `Inventory_background.png`, `Inventory_Bar.png`, `Inventory_select.png`,
    `Inventory_Slot.png`, `Inventory_style_01a–d.png`, `Inventory_style_02a.png`
- **License:** Free for personal and commercial use. No resale of asset pack.
- **Usage:** Legacy Satchel inventory panel UI backgrounds and slot textures.

---

## ✅ REFERENCE — Structural Reference (Do Not Ship Sprites)

### Mana Seed Farmer Sprite System — Free Sample
- **Source:** `Mana_Seed_Farmer_Sprite_Free_Sample_1786754085804.zip`
- **Author:** Seliel the Shaper (seliel-the-shaper.itch.io)
- **License:** Free sample, commercial use in games permitted. Cannot resell.
- **Visual style:** Modern farming-sim — WRONG ERA. Do not use sprites as-is.
- **What IS valuable — the layer naming system:**

  | Layer ID | Layer Name | Niakofa Equivalent |
  |----------|-----------|-------------------|
  | 01body   | Base body (human) | Kwame/NPC body skeleton |
  | 03fot1   | Footwear (shoes) | Era-appropriate sandals/boots |
  | 04lwr1   | Lower body (pants) | 1890s kente/colonial trousers |
  | 05shrt   | Upper shirt | Batakari/colonial shirt |
  | 13hair   | Hair | Afro/dapper per character |
  | 14head   | Head accessory (hat) | Fez/headscarf per era |

- **Animation set reference (from animation guide PNG):**
  Walk, Run, Idle, Jump, Interact, Carry, Plant, Harvest, Fish, Sleep, etc.
  Each animation uses frames across a 1024×1024 atlas with a cell reference guide.
- **Color ramp system:** 3-color and 4-color base ramps for palette-swapping.
  `00a` = 3-color ramp, `00b` = 4-color, `00c` = two 3-color, `00d` = 4+3 color.
  Directly applicable to Niakofa's character era/age color variations.
- **How to apply to Niakofa Character Resolver 2.0:**
  - `characterId + lifeStage + era` → resolve base body layer
  - `era + clothingStyle` → resolve 04lwr1 + 05shrt layers
  - `characterId + age` → resolve 13hair layer
  - `occupation + era` → resolve 14head layer
  - Composite all layers in deterministic order → final sprite

---

## ❌ REJECTED — Do Not Use

### LMBS (Linear Motion Battle System) — MOG Plugins
- **Source:** `lmbs_1786753918368.zip`
- **Reason:** RPG Maker MV combat plugin system (`MOG_LMBS.js`, `rpg_core.js`,
  etc.). Wrong engine (we use React/Vite). Combat-focused — Niakofa has no
  combat. Fantasy characters (Arche, Athena, Farah, Lamia, Frog) wrong era.
  No license file found. Do not reuse any assets from this package.

### The Dude Free Character Sprites
- **Source:** `The_Dude_Free_1786754035465.zip`
- **Files:** Idle.png (512×128), Jump.png (640×128), Land.png (512×128),
  Sprint.png (1024×128), Walk.png (1024×128)
- **Reason:** Modern cartoon sidescroller character. Side-view spritesheets —
  Niakofa uses semi-top-down. Contemporary style, wrong era entirely.

### SHADOW Series — Shadeflit (Free)
- **Source:** `SHADOW_Series_-_Shadeflit_(Free)_1786754044364.rar`
- **Files:** idle.png, run-turn.png, run.png
- **Reason:** Shadow/silhouette character style. Incompatible with Niakofa's
  warm, detailed West African visual aesthetic. Wrong perspective (sidescroller).

### FFXIV Dialogue Overlay Maker (Windows 32-bit)
- **Source:** `FFXIV_Dialogue_Overlay_Maker_(Windows_32-bit)_1786754063817.zip`
- **Reason:** Windows `.exe` application — cannot run in this environment.
  Contains proprietary fonts: **Myriad Pro** (Adobe licensed, cannot redistribute),
  FinalF (FFXIV game asset), Lavinia (display font). None may be committed.
- **Design reference:** The FFXIV dialogue box pattern (dark frame + portrait +
  typewriter text + choice list) was the inspiration for `LegacyNpcDialogue`.
  Our implementation already matches this pattern. No assets needed.

---

## Pending / To Evaluate

- **Universal LPC Spritesheet Generator** — Vite web app for generating layered
  top-down character sprites. CC-BY-SA license (attribution required). Useful
  as a character factory for Niakofa — but needs per-asset attribution tracking
  before any sprites enter production. See `legacy-rpg-art-boundary.md`.

---

## Character Asset Resolver 2.0 — Road Map

Based on Mana Seed layer system + LPC generator concepts:

```
characterId
  → age (16 / 25 / 40 / 60)
  → era (1890 / 1912 / 1932 / present)
  → occupation (farmer / trader / elder / chief)
  → appearanceSeed (deterministic, from family data)
  ↓
Layer resolution order:
  01_body   — base skeleton (youth/adult/elder body shape)
  02_skin   — skin tone (from characterId seed)
  03_feet   — footwear (era-appropriate)
  04_lower  — lower clothing (kente, trousers, wrapper)
  05_upper  — upper clothing (batakari, colonial shirt, suit)
  06_face   — face features (nose, eyes, mouth)
  07_hair   — hairstyle (natural, dapper, headscarf)
  08_head   — head accessory (fez, crown, nothing)
  09_extras — jewelry, staff, tools
  ↓
Output: Composite sprite + attribution record
```

**Attribution tracking required per layer** before production use of any
external (LPC/CC-BY-SA) art. Internal original art has no restriction.

---

*Last reviewed: August 2026 — all assessments by Replit Agent*
