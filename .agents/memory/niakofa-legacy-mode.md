---
name: Niakofa Legacy Mode
description: Architecture and conventions for the Living Family RPG — 5th bottom-nav tab at /legacy.
---

# Niakofa Legacy Mode

## What it is
A "Living Family RPG" at `/legacy`. Transforms family vault data into quests, characters, achievements, chapters, and a world map. The 5th bottom-nav tab replacing Wallet.

## Key decisions

**Route:** `/legacy` → `artifacts/pay-it-forward/src/pages/legacy-home.tsx` (lazy-loaded)

**Bottom nav:** `BASE_TABS` in `BottomNav.tsx` — Wallet replaced by `{ path: "/legacy", icon: BookHeart, labelKey: "nav.legacy" }`. Wallet remains accessible from the More drawer (unchanged in drawer).

**i18n:** `nav.legacy: "Legacy"` added to `artifacts/pay-it-forward/src/i18n.ts`.

**appNavItems:** Legacy `href` changed from `/diaspora/timeline` to `/legacy`; isActive also matches `/diaspora/timeline`.

## Architecture: full-stack game engine

Backend routes in `artifacts/api-server/src/routes/`:
- `legacy.ts` — quest reservoir, AI-generated quests (Claude 3.5 Haiku), content-hash fingerprint cache
- `legacy-completeness.ts` — readiness score, chapter unlock threshold, dimension breakdowns
- `legacy-chapters.ts` — chapter state machine (locked→unlocked→in_progress→completed/skipped), scene generation from vault data, session CRUD, progress saving with RPG stat accumulation
- `legacy-game-master.ts` — AI narration (scene intros, dialogue, chapter summaries), cached by prompt hash
- `legacy-ai-director.ts` — daily missions from vault gap analysis, mission generation/completion/skip
- `legacy-world-evolution.ts` — evolution log, change summary, knowledge version history
- `legacy-map.ts` — family world map with migration routes from real places
- `legacy-achievements.ts` — achievement definitions and progress tracking
- `legacy-challenges.ts` — family challenges with real progress from vault data
- `legacy-reunion.ts` — template-based reunion challenges with live-computed progress
- `legacy-family-quests.ts` — cooperative quests with per-member leaderboards
- `legacy-memory-mysteries.ts` — mystery quests from vault gaps (unknown photos, missing branches)
- `legacy-seasonal-events.ts` — auto-generated events from family calendar (birthdays, anniversaries)
- `legacy-character-evolution.ts` — character growth tracking (memories, dialogue, relationships)

Backend libs in `artifacts/api-server/src/lib/`:
- `legacy-knowledge-version.ts` — canonical family knowledge hash (member/memory/interview/story/place/event IDs + timestamps), version bumping with real diff
- `legacy-world-evolution.ts` — fire-and-forget evolution logging, triggers knowledge version check
- `legacy-consent.ts` — consented member ID filtering for privacy

## Database tables

### Core Legacy Engine (migration 0093, serial integer PKs)
- `legacy_worlds` — family game world, linked to a knowledge version
- `legacy_chapters` — life chapters with state machine (locked/unlocked/in_progress/completed/skipped)
- `legacy_sessions` — play sessions with autosave state (RPG stats, completed scenes)
- `legacy_achievements` — per-family achievement progress (achievement_key + progress/goal)
- `legacy_quest_progress` — durable record of quest completions (family_id + user_id + quest_id + fingerprint, unique)

### Phase 5 Game Engine (migration 0102, recreated from 0092 design)
- `legacy_scenes` — interactive narrative scenes within chapters (narration/dialogue/reflection/quest/transition)
- `legacy_dialogues` — AI-generated or verified dialogue lines within scenes
- `legacy_choices` — player choices within scenes with consequences and stat changes
- `legacy_world_versions` — world version history linked to knowledge versions
- `legacy_collectibles` — collectible items from vault data (photos, letters, artifacts)
- `legacy_skills` — RPG skill tree (historian, explorer, story_keeper, etc.)

### Persistent Quests (migration 0103)
- `legacy_quests` — durable AI-generated quest storage (replaces in-memory cache)
  - Scoped to family + fingerprint, with quest_type and status enums
  - Unique on (family_id, quest_id_text, fingerprint) to prevent duplicates

### Family Vault (migrations 0093 + earlier)
- `family_places` — real family locations with lat/lng
- `family_events` — life events with dates and member/place links
- `family_stories` — oral stories with teller/about member links
- `family_member_consent` — consent tracking (storytelling/reconnection/publication)
- `family_knowledge_versions` — versioned family knowledge hashes with change diffs
  - Unique constraint on (family_id, version) added in migration 0103

### Phase 5 Enhancements (migration 0101)
- `legacy_ai_director_missions` — daily AI-generated missions
- `legacy_memory_mysteries` — collaborative investigations for vault gaps
- `legacy_world_evolution_log` — evolution change log
- `legacy_character_evolution` — character growth tracking
- `legacy_world_artifacts` — world artifacts

### Family Challenges (migrations 0097 + 0099)
- `legacy_family_challenges` — family challenge definitions and progress

### Place Discoveries (migration 0096)
- `legacy_place_discoveries` — GPS check-ins at family landmarks

## RLS
All legacy tables have RLS enabled with family-membership-scoped policies (migration 0102).
The `legacy_is_family_member(fam_id)` SECURITY DEFINER helper checks membership.

## Gameplay Routes
- `/legacy` — Game hub (mode selector, ancestor preview, readiness score, daily welcome)
- `/legacy/start` — Cinematic ancestor selection & journey begin
- `/legacy/chapter/:chapterId` — Interactive scene viewer with dialogue, choices, autosave
- `/legacy/map` — Family world map (migration routes from real places)
- `/legacy/character/:memberId` — Character biography / playable history
- `/legacy/achievements` — Progression tracking
- `/legacy/challenges` — Family challenges
- `/legacy/ai-director` — Daily missions from vault gaps
- `/legacy/mysteries` — Memory mysteries (unknown photos, missing branches)
- `/legacy/world-evolution` — World evolution log and version history
- `/legacy/seasonal-events` — Family calendar events
- `/legacy/characters` — Character evolution tracking
- `/legacy/journal` — Dynamic journal from session decisions
- `/legacy/timeline` — Family timeline

## Game Modes
1. **Legacy Mode** — Play an ancestor's life through chapters and scenes
2. **Exploration Mode** — Explore real family locations on the world map
3. **Family Quests** — Collaborative preservation missions with per-member leaderboards
4. **Reunion Mode** — Template-based family challenges with live-computed progress

## Stat System (Phase 5)
RPG stats accumulated through choices in sessions:
- **Knowledge** — Unlocks historical clues
- **Relationships** — Changes dialogue and available quests
- **Cultural Wisdom** — Unlocks traditions, languages, recipes, music
- **Courage** — Allows certain difficult historical challenges
- **Reputation** — Changes how characters respond
- **Legacy** — Measures the lasting impact of choices
- **Faith** — Spiritual/cultural dimension

Stats are clamped 0-100, persisted in `session_state.stats`, and restored on session resume.

## Historical Layers
Every scene is tagged with one of three layers:
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

When the hash changes, a new knowledge version is recorded with a real diff (new members/memories/stories/places/events since the previous version), and a "world_regenerated" evolution log entry is created.

## Audio Recording
The legacy-home page uses the MediaRecorder API for real audio capture:
- `navigator.mediaDevices.getUserMedia({ audio: true })` for mic access
- Creates a memory record via `POST /api/family/:id/memories`
- Uploads audio as base64 data URL via `POST /api/family/:id/memories/:memId/assets/upload-direct`
- Invalidates the quest reservoir after upload
- Handles permission errors, upload failures, and cleanup

## Color palette
Dark warm brown `#1A0F08` bg, `#2A1A0F` cards, `#3A2A1A` inner cards.
All accents `text-amber-*` / `bg-amber-*`. Stats: rose (Health), blue (Knowledge), amber (Reputation).

## Reference docs
`docs/legacy-mode-design/` — README.md, ARCHITECTURE.md, ui-reference.png, legacy-design-spec.txt, ai-story-extraction-design.md
