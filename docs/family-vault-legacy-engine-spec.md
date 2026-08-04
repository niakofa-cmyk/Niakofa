# Family Vault Schema + Completeness API + Legacy Engine

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
      MAPS          DIALOGUE        QUESTS
      STAGES        CHAPTERS        EVENTS
      PLACES        NARRATION       ACHIEVEMENTS
      EVENTS        CHARACTERS      INVENTORY
```

## Data Model

### Family Vault Domain (new tables)

#### `family_places`
Geographic locations tied to a family's history.

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL PK | |
| family_id | INTEGER FK → families | |
| label | TEXT | "Kumasi", "Cape Coast Castle" |
| place_type | TEXT | village\|town\|city\|school\|church\|cemetery\|business\|landmark |
| country | TEXT | |
| region | TEXT | |
| lat | DOUBLE PRECISION | |
| lng | DOUBLE PRECISION | |
| notes | TEXT | free-text context |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

#### `family_events`
Dated events in family history — births, deaths, migrations, marriages.

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL PK | |
| family_id | INTEGER FK → families | |
| member_id | INTEGER FK → family_members | |
| title | TEXT | "Moved to Detroit" |
| description | TEXT | |
| event_date | TIMESTAMPTZ | when the event happened |
| event_date_precision | TEXT | day\|month\|year\|circa |
| category | TEXT | birth\|death\|migration\|marriage\|education\|work\|religious\|other |
| place_id | INTEGER FK → family_places | |
| metadata | JSONB | |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

#### `family_stories`
Narrative stories told by or about family members.

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL PK | |
| family_id | INTEGER FK → families | |
| teller_member_id | INTEGER FK → family_members | who told the story |
| about_member_id | INTEGER FK → family_members | who the story is about |
| title | TEXT | |
| body | TEXT | the narrative text |
| category | TEXT | oral\|written\|tradition\|recipe\|song\|proverb\|biography |
| language | TEXT | "Twi", "English" |
| memory_id | INTEGER FK → family_memories | |
| tags | JSONB (string[]) | |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

#### `family_member_consent`
Per-member consent flags controlling AI use of their data.

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL PK | |
| family_id | INTEGER FK → families | |
| member_id | INTEGER FK → family_members | |
| scope | ENUM | storytelling\|reconnection\|publication |
| granted | BOOLEAN | |
| granted_by | INTEGER FK → family_members | |
| granted_at | TIMESTAMPTZ | |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

### Legacy Engine Domain (new tables)

#### `family_knowledge_versions`
Snapshots of the family's vault at a point in time. The fingerprint hash
changes when ANY underlying data changes (not just counts).

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL PK | |
| family_id | INTEGER FK → families | |
| version | INTEGER | monotonically increasing per family |
| fingerprint | TEXT | sha256-like hash of canonical dataset |
| snapshot | JSONB | { member_ids, memory_ids, interview_ids, story_ids, place_ids, event_ids, asset_ids } |
| created_at | TIMESTAMPTZ | |

#### `legacy_worlds`
A generated game world for a family, tied to a knowledge version.

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL PK | |
| family_id | INTEGER FK → families | |
| knowledge_version_id | INTEGER FK → family_knowledge_versions | |
| status | ENUM | generating\|ready\|stale |
| world_data | JSONB | stages, NPCs, map data |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

#### `legacy_chapters`
Life chapters within a world. State machine: locked → unlocked → in_progress → completed/skipped.

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL PK | |
| world_id | INTEGER FK → legacy_worlds | |
| family_id | INTEGER FK → families | |
| ancestor_member_id | INTEGER FK → family_members | |
| chapter_number | INTEGER | |
| title | TEXT | |
| synopsis | TEXT | |
| status | ENUM | locked\|unlocked\|in_progress\|completed\|skipped |
| chapter_data | JSONB | references real vault IDs (events, places, memories) |
| unlocked_at | TIMESTAMPTZ | |
| completed_at | TIMESTAMPTZ | |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

#### `legacy_sessions`
A play session tracking current chapter and state.

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL PK | |
| family_id | INTEGER FK → families | |
| world_id | INTEGER FK → legacy_worlds | |
| user_id | INTEGER | |
| ancestor_member_id | INTEGER FK → family_members | |
| current_chapter_id | INTEGER FK → legacy_chapters | |
| status | ENUM | active\|paused\|completed\|abandoned |
| session_state | JSONB | |
| started_at | TIMESTAMPTZ | |
| ended_at | TIMESTAMPTZ | |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

#### `legacy_achievements`
Achievement records with categories.

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL PK | |
| family_id | INTEGER FK → families | |
| achievement_key | TEXT | "ancestor_walker", "voice_of_elders", etc. |
| category | ENUM | vault_prompt\|reconnection\|gameplay\|preservation |
| title | TEXT | |
| description | TEXT | |
| progress | INTEGER | |
| goal | INTEGER | |
| unlocked | BOOLEAN | |
| unlocked_at | TIMESTAMPTZ | |
| metadata | JSONB | |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

## OpenAPI Shapes

### GET /api/legacy/completeness/:familyId

```json
{
  "familyId": 12,
  "readinessScore": 65,
  "chapterUnlockReady": true,
  "threshold": 40,
  "dimensions": [
    { "key": "people", "label": "People", "score": 20, "max": 20, "count": 7, "hint": "Good coverage." },
    { "key": "relations", "label": "Relations", "score": 12, "max": 15, "count": 4, "hint": "Family tree is connected." },
    { "key": "events", "label": "Events", "score": 13, "max": 20, "count": 2, "hint": "Add life events." },
    { "key": "stories", "label": "Stories", "score": 16, "max": 20, "count": 4, "hint": "Rich narrative material." },
    { "key": "places", "label": "Places", "score": 8, "max": 15, "count": 1, "hint": "Add locations." },
    { "key": "consent", "label": "Consent", "score": 0, "max": 10, "count": 0, "hint": "Ask for consent." }
  ],
  "missingData": ["family_events", "family_places", "family_member_consent"],
  "suggestions": [
    "Add key life events to build the timeline.",
    "Add locations your family lived in to generate the world map.",
    "Ask relatives for storytelling consent."
  ]
}
```

### GET /api/legacy/ancestors/:familyId

```json
{
  "ancestors": [
    {
      "memberId": 5,
      "name": "Ama Serwaa",
      "role": "contributor",
      "relation": "Great-grandmother",
      "birthYear": "1898",
      "deathYear": null,
      "storyCount": 3,
      "eventCount": 2,
      "placeCount": 0,
      "memoryCount": 8,
      "interviewCount": 1,
      "photoCount": 2,
      "completenessScore": 75,
      "selectionReason": "3 recorded stories, 2 life events, 1 interview, born 1898"
    }
  ]
}
```

### POST /api/legacy/chapters/:familyId/init

```json
{
  "worldId": 1,
  "chapters": [
    {
      "id": 1,
      "world_id": 1,
      "family_id": 12,
      "ancestor_member_id": 5,
      "chapter_number": 1,
      "title": "Before the Journey",
      "synopsis": "Your family's story begins in Cape Coast.",
      "status": "unlocked",
      "chapter_data": {
        "historicalLayer": "verified",
        "eventIds": [1, 2, 3],
        "placeIds": [1, 2],
        "memoryIds": [1, 2],
        "era": "1898",
        "location": "Cape Coast"
      },
      "unlocked_at": "2026-07-31T12:00:00Z"
    }
  ],
  "alreadyInitialized": false,
  "readinessScore": 65
}
```

### PATCH /api/legacy/chapters/:chapterId/status

Request:
```json
{ "status": "in_progress" }
```

Response:
```json
{
  "chapter": {
    "id": 1,
    "status": "in_progress",
    "updated_at": "2026-07-31T12:05:00Z"
  }
}
```

## Readiness Score Rules

The readiness score is 0–100, weighted across six dimensions:

| Dimension | Weight | Calculation |
|-----------|--------|-------------|
| People | 20 | min(20, round(memberCount / 5 × 20)) |
| Relations | 15 | min(15, round(relationCount / (memberCount-1) × 15)) if memberCount > 1, else 0 |
| Events | 20 | min(20, round(eventCount / 3 × 20)) |
| Stories | 20 | min(20, round((memoryCount + storyCount) / 5 × 20)) |
| Places | 15 | min(15, round(placeCount / 2 × 15)) |
| Consent | 10 | min(10, round(consentCount / 2 × 10)) |

**Chapter unlock threshold: 40** — chapters only generate when readiness ≥ 40.

## Phase 1 Chapter State Machine

```
locked ──────► unlocked ──────► in_progress ──────► completed (terminal)
                   ▲                  │
                   │                  └──► skipped
                   │                        │
                   └────────────────────────┘ (retry)
```

Valid transitions:
- `locked → unlocked`: when readiness ≥ threshold
- `unlocked → in_progress`: player starts chapter
- `in_progress → completed`: player finishes all scenes
- `in_progress → skipped`: player chooses to skip
- `skipped → unlocked`: player can retry
- `completed → *`: NO transitions (history is immutable)

**Data honesty**: Chapter content references real vault IDs (events, places,
memories). Each scene is labeled with a `historicalLayer`:
- `verified` — from documented family history
- `narrative_interpretation` — AI-generated interpretation of unknown details

The AI must never silently turn narrative interpretation into verified history.

## Achievement Categories

Achievements only unlock through specific actions:

| Category | Unlocked by | Phase 1 wired? |
|----------|------------|----------------|
| `vault_prompt` | Adding data to the Family Vault | Yes |
| `reconnection` | Reconnecting with relatives | Yes |
| `gameplay` | Playing Legacy Mode chapters | No (Phase 2) |
| `preservation` | Preserving stories/interviews | No (Phase 3) |

## Strong Fingerprint

The old fingerprint was `${memberCount}:${memoryCount}:${interviewCount}` —
just counts. Editing a story from "We moved" to "We moved to Detroit in 1957"
would NOT change the fingerprint because counts stayed the same.

The new fingerprint hashes actual IDs + updated_at timestamps:
```json
{
  "m": ["5:2026-07-01T...", "6:2026-07-02T..."],
  "mem": ["1:2026-07-15T...", "2:2026-07-16T..."],
  "i": 3,
  "s": 2,
  "e": 5,
  "p": 4,
  "r": 6,
  "a": 8
}
```

This JSON is base64url-encoded and truncated to 64 chars. Any edit to any
vault item changes its `updated_at`, which changes the fingerprint, which
triggers quest/world regeneration.

## Ancestor Selection Engine

The old `pickAncestor()` returned `members[0]` — always the first member.

The new `selectAncestors()` evaluates each member across:
- Birth year (from events)
- Death year (from events)
- Story count (stories about them)
- Event count (events for them)
- Memory count
- Interview count
- Photo count
- Relation note

Each member gets a completeness score (0–100). Results are sorted by score
descending so the richest ancestor is selected first.

## Migration

`artifacts/nia-service/migrations/0033_family_vault_legacy_engine.sql` —
creates all 9 new tables with indexes. Idempotent (IF NOT EXISTS + DO $$ blocks
for enums). No destructive operations.
