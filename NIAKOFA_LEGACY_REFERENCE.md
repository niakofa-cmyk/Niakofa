# Niakofa Legacy — Master Reference File

> **Purpose**: Preserve and catalog all images, documents, and reference materials for the Niakofa Legacy RPG game. This file is the single source of truth for asset locations, document references, and session history.

## Repository
- GitHub: https://github.com/niakofa-cmyk/Niakofa
- Railway: `zesty-ambition-production-f6a1.up.railway.app`
- Demo URL: `/legacy/demo` (public, no auth required)

---

## Reference Images

### Start Screen & Branding
| Asset | Location | Use |
|-------|----------|-----|
| Cinematic baobab sunset | `artifacts/pay-it-forward/public/legacy-living-family-reference.png` | Hero background on start screen |
| Gold NIAKOFA logo | Referenced in session, not yet on disk | Logo overlay |
| Start screen panel | Referenced in session, not yet on disk | Layout reference |

### Live Demo References
| Asset | Location | Use |
|-------|----------|-----|
| House of Mensah demo | `artifacts/pay-it-forward/public/niakofa-legacy-live-demo.png` | House demo visual |
| Family tree reference | `artifacts/pay-it-forward/public/niakofa-legacy-family-tree-reference.png` | Family Tree / world reference |
| RPG screens reference | `artifacts/pay-it-forward/public/niakofa-legacy-rpg-reference.png` | Onboarding and chapter reference |

### Original RPG Art (55 assets)
| Catalog | Location | Count |
|---------|----------|-------|
| Original art catalog | `artifacts/pay-it-forward/public/legacy-rpg-assets/` | 55 approved assets |
| Catalog test | `artifacts/pay-it-forward/src/lib/legacy-rpg-assets-catalog.test.ts` | Runtime verification |

### Village Atmosphere Assets (11 assets)
| Catalog | Location | Count |
|---------|----------|-------|
| Village asset catalog | `artifacts/pay-it-forward/public/legacy-village-assets/catalog.json` | 11 approved files |
| Field grass | `.../materials/field-grass.png` | Ground material |
| Village tree | `.../environment/village-tree.png` | Environment |
| House prosperous | `.../buildings/house-prosperous.png` | World state: prosperous |
| House ravaged | `.../buildings/house-ravaged.png` | World state: pressure |
| Train station | `.../buildings/train-station.png` | Migration landmark |
| Elder idle | `.../characters/elder-idle.png` | Curated NPC cue |
| Villager spritesheet | `.../characters/villager-spritesheet.png` | Ambient NPC motion |
| Tree bark study | `.../materials/tree-bark-01.png` | Living tree material |
| Ground stone echo | `.../materials/ground-stone-echo.png` | Regeneration ground cue |
| Retro live trees | `.../environment/retro-live-trees.png` | Recovered canopy atmosphere |
| Retro dead trees | `.../environment/retro-dead-trees.png` | Pressure canopy atmosphere |

### Baobab Tree
| Asset | Location | Use |
|-------|----------|-----|
| Baobab trunk | `artifacts/pay-it-forward/public/baobab_trunk.png` | Living baobab component |

---

## Key Documents

| Document | Location | Content |
|----------|----------|---------|
| CLAUDE.md (root) | `/CLAUDE.md` | Technical notes for AI sessions — architecture, incident log, design choices |
| CLAUDE.md (agents) | `.agents/memory/CLAUDE.md` | Multi-agent collaboration policy, no-clobber rule |
| MEMORY.md | `.agents/memory/MEMORY.md` | Index of all memory files |
| Legacy Mode Reference | `.agents/memory/niakofa-legacy.md` | RPG demo spec, system map, 20+ page inventory |
| Demo State Rules | `.agents/memory/legacy-demo-state-rules.md` | Idempotency contracts, trait validation, storage sanitizer |
| Session Reference | `NIAKOFA_LEGACY_SESSION_REF.md` | Aug 2026 session work log |
| Legacy API Contracts | `.agents/memory/legacy-api-contracts.md` | Current data sources for Legacy journey |
| Character Engine Runtime | `.agents/memory/legacy-character-engine-runtime.md` | Stable IDs, runtime layers, licensing boundary |
| RPG Art Boundary | `.agents/memory/legacy-rpg-art-boundary.md` | Art is presentation only, never a second runtime |
| Runtime Boundary | `.agents/memory/legacy-runtime-boundary.md` | One React/Vite runtime, Family Vault authoritative |
| House Demo | `.agents/memory/legacy-house-demo.md` | House of Mensah interactive demo boundary |
| Start Screen | `.agents/memory/legacy-start-screen.md` | Cinematic start screen architecture |
| Play Navigate Pattern | `.agents/memory/legacy-play-navigate-pattern.md` | Safe navigate ref pattern |
| 5-Gap Audit Follow-ups | `.agents/memory/niakofa-5gap-audit-followups.md` | Quality gaps closed July 2026 |

---

## RPG Systems Inventory (16 implemented systems)

1. **Cinematic Start Screen** (`legacy-start-visual.tsx`) — baobab sunset hero, gold emblem, mode grid
2. **Living World Map** (`legacy-map.tsx`) — tile-based exploration with landmarks
3. **Dynamic Chapter Generation** (`legacy-chapter.tsx`) — 6-chapter arc with trait choices
4. **Character Progression** (`legacy-character.tsx`) — traits: Leadership, Wisdom, Courage, Compassion
5. **Family Vault** (`legacy-home.tsx`) — artifact system driving quests and chapters
6. **Live Journal** (`legacy-journal.tsx`) — session history and discoveries
7. **AI Director** (`legacy-ai-director.tsx`) — chapter unlocking and quest generation
8. **Seasonal Events** (`legacy-seasonal-events.tsx`) — calendar-driven world activity
9. **World Evolution** (`legacy-world-evolution.tsx`) — regeneration triggered by artifact placement
10. **Achievements** (`legacy-achievements.tsx`) — milestone tracking
11. **Memory Mysteries** (`legacy-memory-mysteries.tsx`) — investigation puzzles
12. **Interview Quest** (`legacy-interview-quest.tsx`) — elder interview with retry handling
13. **Character Evolution** (`legacy-character-evolution.tsx`) — generational trait inheritance
14. **Co-op Challenges** (`legacy-challenges.tsx`) — multi-family-member quests
15. **Timeline** (`legacy-timeline.tsx`) — historical event visualization
16. **Demo Mode** (`legacy-demo.tsx`) — end-to-end playable demo, public, localStorage-persisted

### Supporting Components
- `legacy-living-world.tsx` — tile grid with character sprite, memory echoes, season overlays
- `legacy-living-baobab.tsx` — interactive baobab tree with navigable branches
- `legacy-house-demo.tsx` — House of Mensah artifact placement demo
- `legacy-village-atmosphere.tsx` — curated village atmosphere layer
- `legacy-satchel.tsx` — inventory UI with artifact slots
- `legacy-character-sprite.tsx` — character rendering with appearance layers
- `legacy-memory-encounter.tsx` — NPC memory encounter with choice cards
- `legacy-fishing-encounter.tsx` — fishing mini-game encounter
- `legacy-core-loop.tsx` — core gameplay loop wrapper

### State Engine
- `legacy-demo-state.ts` — idempotency guards, trait validation, coopTasks sanitizer, worldVersion trigger
- `legacy-world-layout.ts` — 6×9 tile grids for original and regenerated world states

---

## 6-Chapter Demo Arc

| Chapter | Era | Character | Theme |
|---------|-----|-----------|-------|
| Prologue | Present Day | Afia | Discovery of Grandma's house |
| Chapter 1 | 1890 | Kwame Mensah, 16 | Farm & trading tutorial |
| Chapter 2 | 1901-1911 | Kwame | Golden Years — education, business, relationships |
| Chapter 3 | 1912-1920 | Kwame | Betrayal — investigation, missing records |
| Chapter 4 | 1920-1930 | Kwame | Collapse — loss mechanics, shrinking map |
| Chapter 5 | 1930-1950 | Family | Migration — diaspora branch to America |
| Chapter 6 | Present | Afia | Discovery of Family Vault, world regeneration |

---

## Bug Fixes Applied This Session (2026-08-13)

1. **NPC memory search case mismatch** — `legacy-demo.tsx` searched for lowercase `"chapter"` but memories store `"Chapter"` — hint never displayed. Fixed to `"Chapter"`.
2. **chooseDemoTrait dedup dead code** — `legacy-demo-state.ts` checked `state.phase` (e.g. `"chapter1"`) but memory string contains `"Chapter 1"` — dedup never matched. Fixed to use `phaseLabel`.
3. **localStorage crash in privacy mode** — `legacy-house-demo.tsx` accessed `localStorage` directly without try/catch. Wrapped in safety guard.
4. **Back button season desync** — `legacy-demo.tsx` back button set phase without updating season. Now calls `seasonForPhase(prev)` to sync.
5. **NiakofahEmblem typo** — `legacy-start-visual.tsx` had extra "h" in component name. Fixed to `NiakofaEmblem`.
6. **CI verification script stale asset count** — `verify-legacy-demo-deployment.mjs` expected 8 village assets but catalog grew to 11. Updated count.
