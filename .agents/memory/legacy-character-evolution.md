---
name: Legacy Character Evolution System
description: CharacterDNA, CharacterLifeStage, KWAME_DNA, LPC spritesheet spec — the canonical character pipeline for Niakofa Legacy
---

## File location
`artifacts/pay-it-forward/src/lib/legacy-character-evolution.ts`

## Core types
- `CharacterBodyType`: "youth" | "adult" | "mature" | "elder"
- `CharacterEra`: "precolonial" | "colonial-early" | "colonial-gold-coast" | "independence" | "postcolonial" | "contemporary"
- `CharacterRegion`: cape-coast, accra, kumasi, volta-region, northern-territories, diaspora-uk/us/caribbean
- `ClothingStyle`: student-colonial, trader-cloth, elder-formal, farmer-working, chief-ceremonial, diaspora-1940s, contemporary

## CharacterDNA
- `id`, `familyId`, `fullName`, `callName`, `familyRole`
- `appearanceSeed` — deterministic from familyId + characterId; drives sprite selection
- `skinTone`: tone-1 through tone-6 (maps to LPC sheet rows)
- `corePersonality: string[]` — persists across all life stages
- `lifeStages: Record<string, CharacterLifeStage>` — keyed by stage name
- `canonicalLifeStage: string` — default display stage

## KWAME_DNA — Calibration Character
Three life stages defined:
- `youth` (age 16, 1912, Cape Coast) — student-colonial clothing, Mission School chapter
- `young_adult` (age 25, 1921) — trader-cloth, running trading house
- `mature` (age 50, 1946) — elder-formal, head of extended family

**Why Kwame is the calibration character:** All world scale decisions derive from
his canonical master character sheet. Every environment asset is validated against
the 7 Kwame questions (walk behind/in-front/occlude/enter/collide/interact/shadow).

## Phase → Life Stage mapping (getLifeStageForPhase)
- prologue/chapter1/chapter2 → "youth"
- chapter3/chapter4 → "young_adult"
- chapter5/chapter6/world-regen/reunion/finale → "mature"
- mystery → "youth" (flashback)

## LPC_SPRITESHEET_SPEC
- Frame size: 64×64
- Frames per row: 20
- Male sheet: `public/legacy-character-assets/lpc-reference/lpc-male-combined-sheet.png` (1280×33152, ~518 rows)
- Female sheet: `public/legacy-character-assets/lpc-reference/lpc-female-combined-sheet.png` (1280×34944, ~546 rows)
- License: **CC-BY-SA** — attribution required before production use
- Niakofa rows: walk_down=0, walk_left=1, walk_right=2, walk_up=3, hurt_down=20-23
- Only non-combat animations for Niakofa (walk + idle + hurt)

## CHARACTER_DNA_REGISTRY
Global registry keyed by character ID. Currently: `{"kwame-mensah": KWAME_DNA}`
Add new family members here as they are defined.
