# Niakofa Legacy Mode — Architecture & Design

## Overview

The Legacy Mode transforms Niakofa from a family vault app into a Living Family Legacy Experience. Family data becomes a playable RPG world where ancestors are characters, memories become quests, and the family vault is the game database.

## Architecture

```
                    NIAKOFA
                       │
                 FAMILY VAULT
                       │
             ┌─────────┴─────────┐
             │                   │
        FAMILY GRAPH        MEMORY GRAPH
             │                   │
             └─────────┬─────────┘
                       │
               LEGACY ENGINE
                       │
        ┌──────────────┼──────────────┐
        │              │              │
    WORLD BUILDER   STORY ENGINE   GAME ENGINE
        │              │              │
        │              │              │
      MAPS          DIALOGUE        QUESTS
      STAGES        CHAPTERS        EVENTS
      PLACES        NARRATION       ACHIEVEMENTS
      EVENTS        CHARACTERS      INVENTORY
                       │
                       ↓
                  LIVE GAMEPLAY
                       │
                       ↓
                NEW FAMILY MEMORY
                       │
                       ↓
                 WORLD REGENERATES
```

## Database Schema

### Family Vault (Source Data)
- `family_members` — people in the family (ancestors, relatives)
- `family_memories` — recorded memories and stories
- `family_places` — geographic locations tied to the family
- `family_events` — dated life events
- `family_interviews` — oral history recordings
- `family_artifacts` — physical heirlooms with provenance

### Legacy Engine (Game World)
- `legacy_worlds` — generated game worlds from family knowledge
- `legacy_chapters` — life chapters within a world
- `legacy_scenes` — interactive scenes within chapters
- `legacy_dialogues` — AI-generated dialogue for scenes
- `legacy_choices` — player choices within dialogues
- `legacy_sessions` — play sessions (save/resume)
- `legacy_quests` — quests derived from family knowledge gaps
- `legacy_quest_progress` — player progress on quests
- `legacy_achievements` — gameplay achievements
- `legacy_achievement_progress` — progress toward achievements
- `legacy_world_artifacts` — collectible items with real provenance
- `family_knowledge_versions` — versioned family knowledge hashes
- `legacy_world_versions` — knowledge version snapshots

## Gameplay Routes

- `/legacy` — Game hub (mode selector, ancestor preview, readiness score)
- `/legacy/start` — Ancestor selection & journey begin
- `/legacy/play/:sessionId` — Actual gameplay (scenes, dialogue, choices)
- `/legacy/chapter/:chapterId` — Chapter details and scene preview
- `/legacy/map` — Family world map (migration routes)
- `/legacy/character/:memberId` — Character biography / playable history
- `/legacy/achievements` — Progression tracking

## Game Modes

1. **Legacy Mode** — Play an ancestor's life through chapters and scenes
2. **Exploration Mode** — Explore real family locations on the world map
3. **Family Quests** — Collaborative preservation missions
4. **Reunion Mode** — Real-time or asynchronous family challenges

## Historical Layers

Every scene is tagged with one of three historical layers:

1. **Verified Family History** — Facts directly from family records
2. **Historical Context** — General historical information about the time/place
3. **Narrative Interpretation** — AI-generated story elements, clearly labeled as fiction

The AI must never silently turn narrative interpretation into verified history.

## Knowledge Versioning

The family knowledge hash is computed from:
- Member IDs + updated_at timestamps
- Memory IDs + updated_at timestamps
- Event IDs + updated_at timestamps
- Place IDs + created_at timestamps
- Interview IDs + created_at timestamps
- Artifact IDs + created_at timestamps

When the hash changes, a new knowledge version is recorded, and the game world can regenerate.

## The Niakofa Flywheel

```
PLAY → DISCOVER → QUESTION → INTERVIEW → UPLOAD →
AI UNDERSTANDS → WORLD CHANGES → NEW QUEST → PLAY
```

The game drives preservation by identifying knowledge gaps and creating mystery quests that ask the family to fill them.

## Stat System

- **Knowledge** — Unlocks historical clues
- **Relationships** — Changes dialogue and available quests
- **Cultural Wisdom** — Unlocks traditions, languages, recipes, music
- **Courage** — Allows certain difficult historical challenges
- **Reputation** — Changes how characters respond
- **Legacy** — Measures the lasting impact of choices

## Priority Order

- **P0** — Make gameplay real (Legacy Session Engine, Chapter/Scene/Dialogue system)
- **P1** — Build the Family World (Memory Graph, Timeline, Location engine)
- **P2** — Make the world regenerate (Knowledge versioning, World regeneration)
- **P3** — Real preservation (Audio recording, transcription, extraction)
- **P4** — Multiplayer (Family challenges, cooperative quests, reunion events)
