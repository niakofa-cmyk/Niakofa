# Niakofa Legacy Mode — Design Reference

This document captures the design vision, feature inventory, and architecture
for the Legacy Mode RPG within the Niakofa app. It serves as the reference
for all future development and improvement work.

## Core Vision

Legacy Mode transforms family vault data into an evolving RPG experience:

- Ancestors become playable characters
- Memories become quests
- The family vault becomes the game database
- Every contribution regenerates the world

## The Core Loop

The experience must be driven by this loop, not by a feature checklist:

```
Memory → AI → World Changes → Player Notices → New Gameplay → New Memory
```

Every play session should follow this rhythm. The LegacyCoreLoop component
makes this visible to the player after each chapter completion.

## Feature Inventory

### Backend Routes (artifacts/api-server/src/routes/)

| Route File | Purpose |
|---|---|
| legacy.ts | Main legacy hub data |
| legacy-completeness.ts | Vault completeness scoring |
| legacy-chapters.ts | Chapter state machine (locked→unlocked→in_progress→completed) |
| legacy-game-master.ts | AI narration + rich character profiles |
| legacy-ai-director.ts | AI-driven mission generation from vault gap analysis |
| legacy-world-evolution.ts | World change log |
| legacy-interview-quest.ts | Interview quest system (microphone as gameplay) |
| legacy-auto-journal.ts | Auto-generated journal entries after sessions |
| legacy-achievements.ts | Achievement system |
| legacy-map.ts | Family map with places |
| legacy-challenges.ts | Family challenges |
| legacy-seasonal-events.ts | Seasonal events |
| legacy-memory-mysteries.ts | Mystery quest system |
| legacy-character-evolution.ts | Character evolution tracking |
| legacy-reunion.ts | Reunion events |
| legacy-family-quests.ts | Family quests |
| legacy-coop.ts | Cooperative gameplay |

### Backend Libs (artifacts/api-server/src/lib/)

| Lib File | Purpose |
|---|---|
| legacy-ai-gateway.ts | AI model gateway (OpenAI/Claude) |
| legacy-ai-director-enhanced.ts | Enhanced vault gap analysis |
| legacy-character-profile.ts | Rich AI-generated character profiles |
| legacy-consent.ts | Consent management for family members |
| legacy-knowledge-version.ts | Knowledge versioning system |
| legacy-world-evolution.ts | World evolution logging |
| historical-context.ts | Historical context generation |

### Frontend Pages (artifacts/pay-it-forward/src/pages/)

| Page | Route | Purpose |
|---|---|---|
| legacy-home.tsx | /legacy | Main dashboard with chapters, quests, stats |
| legacy-onboarding.tsx | /legacy/onboarding | Chapter 0: Awaken the Legacy (3 quests) |
| legacy-chapter.tsx | /legacy/chapter/:id | Interactive scene viewer with choices |
| legacy-play.tsx | /legacy/play | Continue Journey router |
| legacy-character.tsx | /legacy/character/:id | Rich character biography |
| legacy-journal.tsx | /legacy/journal | Auto-journal reader |
| legacy-map.tsx | /legacy/map | Family map |
| legacy-achievements.tsx | /legacy/achievements | Achievement gallery |
| legacy-ai-director.tsx | /legacy/ai-director | AI Director missions |
| legacy-world-evolution.tsx | /legacy/world-evolution | World evolution log |
| legacy-interview-quest.tsx | /legacy/interview-quest | Interview quest system |
| legacy-start.tsx | /legacy/start | Ancestor selection for new journey |
| legacy-challenges.tsx | /legacy/challenges | Challenge list |
| legacy-seasonal-events.tsx | /legacy/seasonal-events | Seasonal events |
| legacy-memory-mysteries.tsx | /legacy/mysteries | Mystery quests |
| legacy-character-evolution.tsx | /legacy/characters | Character evolution |
| legacy-timeline.tsx | /diaspora/timeline | Interactive timeline |

### Frontend Components (artifacts/pay-it-forward/src/components/)

| Component | Purpose |
|---|---|
| legacy-core-loop.tsx | Visible Memory→AI→World Changes→New Memory overlay |

## Design Principles

1. **Grounded in real family data** — verified history is immutable, narrative
   interpretation is clearly labeled
2. **Every contribution regenerates the world** — new ancestor → character +
   quests + timeline + chapters; oral story → dialogue + journal + side quests;
   photo → collectibles + memories + relationships; landmark → map expansion +
   exploration
3. **Emotional pacing** — alternate between discovery, conversation,
   exploration, reflection, contribution
4. **The microphone is gameplay** — Interview Quests transform recording from
   a utility into the core gameplay mechanic
5. **AI Director guides preservation** — identifies missing ancestors,
   incomplete branches, unanswered questions, undocumented locations
6. **Auto-journal** — written automatically after each session as a narrative
   summary

## Onboarding Flow

Chapter 0: Awaken the Legacy
1. Quest 1 — The First Ancestor (add oldest relative)
2. Quest 2 — Their Voice Lives On (record a 30s memory, transcribed via Nia)
3. Quest 3 — Every Story Has a Place (pin a family location)

After all three: "LEGACY AWAKENED!" → init chapters → navigate to first chapter.

## Character System

Every family member should eventually contain:
- Personality traits (AI-generated archetype + description + traits)
- Skills (occupation, known skills, craft level)
- Beliefs (spiritual, values, life philosophy)
- Relationships (family tree relations)
- Speech style (tone, vocabulary, sample dialogue line)
- Memories (connected family memories)
- Historical knowledge (era, key events, cultural context)
- Emotional profile (dominant emotion, range, triggers)
- Reputation (community standing, known for)
- Legacy score (composite: stories + memories + interviews + descendants + places)

## Interview Quest Types

1. **Elder Interview** — Record an elder's story → timeline + dialogue + chapter
2. **Family Origin** — Trace family origin → map expansion + migration story
3. **Tradition Keeper** — Preserve a tradition → cultural achievement + dialogue
4. **Photo Identification** — Identify old photos → people + relationships
5. **Missing Ancestor** — Discover missing ancestor → new playable character

## World Regeneration Table

| Contribution | Gameplay Changes |
|---|---|
| New ancestor | Character, quests, timeline, chapters |
| Oral story | Dialogue, journal, side quests |
| Photo | Collectibles, memories, relationships |
| Landmark | Map expansion, exploration |
| Letter | Historical context, mysteries |
| Family recipe | Cultural traditions, achievements |
| New relative | Co-op content, reunion events |
