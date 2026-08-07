---
name: Niakofa Legacy Mode Reference
description: Canonical reference for Niakofa Legacy RPG — design goals, demo spec, feature map, and session decisions.
---

# Niakofa Legacy Mode — Master Reference

## What Niakofa Legacy Is
An **Advanced Gameplay Style RPG** built on family history.
- Play. Discover. Preserve. Honor.
- Every family memory, vault artifact, and recorded story regenerates the living world.
- Genre: narrative RPG / family heritage simulation.

## Start Screen Rule (enforced by commit ef8e40b3)
`/legacy` → `LegacyHomePage` → shows `LegacyStartVisual` as the first thing.
- `hasJourney=true` → "Continue Your Journey" (gold, primary)
- Always → "Start New Journey" / "Get Started" (dark, secondary)
- Always → **"Play Demo"** button (amber outline) → `/legacy/demo`

## Demo Route
- **Public URL**: `/legacy/demo` — bypasses auth (handled in `AppContent` before `AppShell`)
- **Page file**: `artifacts/pay-it-forward/src/pages/legacy-demo.tsx`
- **Phases**: prologue → chapter1-6 → world-regen → coop-quest → finale
- **Persistence**: `localStorage` key `niakofa:demo:v2`
- **End CTA**: "Continue Your Journey" → `/legacy`

## House of Mensah Demo Component
- File: `artifacts/pay-it-forward/src/components/legacy-house-demo.tsx`
- Storage key: `niakofa:legacy-house-demo:v1`
- 4 artifacts: photo, recipe, medal, certificate
- 3 areas: house, kitchen, reunion

## RPG Systems Inventory (implemented)
1. Cinematic start screen (`legacy-start-visual.tsx`)
2. Living world map (`legacy-map.tsx`)
3. Dynamic chapter generation (`legacy-chapter.tsx`)
4. Character progression with traits (`legacy-character.tsx`)
5. Family vault as artifact system (`legacy-home.tsx`)
6. Live journal (`legacy-journal.tsx`)
7. AI Director (`legacy-ai-director.tsx`)
8. Seasonal events (`legacy-seasonal-events.tsx`)
9. World evolution / regeneration (`legacy-world-evolution.tsx`)
10. Achievements (`legacy-achievements.tsx`)
11. Memory mysteries (`legacy-memory-mysteries.tsx`)
12. Interview quest (`legacy-interview-quest.tsx`)
13. Character evolution across generations (`legacy-character-evolution.tsx`)
14. Co-op family challenges (`legacy-challenges.tsx`)
15. Timeline (`legacy-timeline.tsx`)
16. Demo mode end-to-end (`legacy-demo.tsx`) ← added Aug 2026

## Demo Document Spec (from attached_assets)
Title: "The House of Mensah · A Living Family Legacy Experience"
Theme: Wealth · Betrayal · Migration · Redemption · Legacy

### 6-Chapter Arc
- Ch 1 (1890): Kwame Mensah, 16. Farm & trading. Tutorial via exploration.
- Ch 2 (1901-1911): Golden Years — education/business/relationship choices.
- Ch 3 (1912-1920): Betrayal — investigation, missing records, trust decisions.
- Ch 4 (1920-1930): Collapse — loss mechanics, shrinking map.
- Ch 5 (1930-1950): Migration — diaspora branch to America.
- Ch 6 (Present): Afia discovers Family Vault. World Regeneration triggered.

### World Regeneration Events (when all artifacts placed)
- Forgotten ancestor appears in Family Tree
- Migration route revealed on map
- New chapter unlocked
- Old business location appears on map
- New dialogue unlocked
- Additional quests generated

### Cooperative Family Quest: "The Lost Ledger"
- Identify people in old photographs
- Interview an elder (record voice)
- Tag ancestral location on map
- Reconnect a Family Tree branch

## Key Design Principles
- **No combat** — relationships and consequences drive conflict
- **Living world** — every upload regenerates map/quests/journal/dialogue/achievements
- **Generational play** — traits inherited across playable characters
- **Family Vault = gameplay** — not storage, but artifact → quest → NPC → chapter
- **Co-op by default** — invite family members to continue rebuilding together

## Reference Images (attached_assets/)
- `niakofa_panel3_StartScreen_*` — Start screen layout with mode grid
- `ChatGPT_Image_Aug_5_*_08_42_05_PM` — 12-panel full RPG system overview
- `ChatGPT_Image_Aug_3_*_10_54_14_PM_(1)` — Legacy start screen + gameplay dashboard
- `ChatGPT_Image_Aug_5_*_12_20_28_PM` — Family at baobab tree (hero scene)
- `ChatGPT_Image_Aug_5_*_12_30_25_PM` — Gold NIAKOFA logo on black

## Railway Deployment
- Service: zesty-ambition-production-f6a1.up.railway.app
- Verified rollout documented in commit b4040e35

**Why this file exists:** The Niakofa Legacy feature set spans 20+ pages and components across multiple sessions. This file is the single source of truth for design intent, implemented systems, and the demo spec so future sessions don't re-investigate what already exists.
