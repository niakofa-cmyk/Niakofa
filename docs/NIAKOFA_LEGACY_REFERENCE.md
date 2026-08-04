# Niakofa Legacy Mode — Living Family RPG Reference

> Reference document for the Niakofa Legacy experience.
> Keep this file: contains design decisions, component map, and feature status.
>
> Reference Images: `docs/legacy-mode-design/reference-images/`

---

## Design Vision

**The Living Family Legacy Experience**
> Your family. Your story. Your world. Play · Discover · Preserve · Honor.

**The One Loop:**
```
DISCOVER → PLAY → FEEL → CONTRIBUTE → WORLD EVOLVES → DISCOVER
```

**The Core Promise:**
Every family contribution (audio recording, ancestor added, place pinned) automatically regenerates:
- World map, quests, dialogue, timeline, journal, achievements, collectibles, NPC knowledge, relationship graph

---

## Chapter 0 — "Awaken the Legacy"

First-run experience. Route: `/legacy/onboarding`

| Quest | Action | API Call | Reward |
|-------|--------|----------|--------|
| Quest 1 | Add oldest relative | `POST /api/family/:id/members` | Character + Timeline unlocked |
| Quest 2 | Record 30s memory (real MediaRecorder → Nia Whisper STT) | `POST /api/family/:id/memories`, `/api/nia/voice/transcribe` | Dialogue + Journal unlocked |
| Quest 3 | Pin a family place | `POST /api/legacy/map/:id/places` | Map expansion unlocked |

After all 3: `POST /api/legacy/chapters/:familyId/init` → navigate to `/legacy/chapter/:id`

**Detection:** `localStorage.getItem("legacy:setupDone") === "1"` — set on completion
**Entry guard:** `legacy-home.tsx` line ~882: redirects to `/legacy/onboarding` if not done

---

## Route Map

| Route | Page | Purpose |
|-------|------|---------|
| `/legacy` | legacy-home.tsx | Hub — Continue Journey, quests, world state |
| `/legacy/onboarding` | legacy-onboarding.tsx | Chapter 0: Awaken the Legacy (first-run) |
| `/legacy/play` | **legacy-play.tsx** | **Continue Journey router — enters active RPG scene directly** |
| `/legacy/play/:sessionId` | **legacy-play.tsx** | Resume specific session → active chapter |
| `/legacy/start` | legacy-start.tsx | Cinematic ancestor selection + chapter init |
| `/legacy/chapter/:id` | legacy-chapter.tsx | **Living RPG gameplay scene** |
| `/legacy/map/:familyId` | legacy-map.tsx | World map with family migration routes |
| `/legacy/journal` | legacy-journal.tsx | Family journal — auto-written by play sessions |
| `/legacy/character/:memberId` | legacy-character.tsx | Ancestor character sheet |
| `/legacy/achievements` | legacy-achievements.tsx | Achievements tracking |
| `/legacy/mysteries` | legacy-memory-mysteries.tsx | Mystery quests from missing family data |
| `/legacy/characters` | legacy-character-evolution.tsx | All characters / family lineage |
| `/legacy/ai-director` | legacy-ai-director.tsx | Nia AI Director missions |
| `/legacy/world-evolution` | legacy-world-evolution.tsx | World version history |
| `/legacy/challenges` | legacy-challenges.tsx | Family challenges (co-op) |
| `/legacy/seasonal-events` | legacy-seasonal-events.tsx | Seasonal / emotional calendar events |

---

## Continue Journey — Full Flow

The `/legacy/play` page (`legacy-play.tsx`) routes the player into the living RPG scene:

```
/legacy/play
    │
    ├── GET /api/family/mine → familyId
    │
    ├── GET /api/legacy/sessions/active/:familyId
    │       ↓ session.current_chapter_id found?
    │       YES → /legacy/chapter/:chapterId   ← LIVE RPG SCENE
    │       NO ↓
    │
    ├── GET /api/legacy/chapters/:familyId
    │       ↓ in_progress chapter found?
    │       YES → /legacy/chapter/:chapterId   ← LIVE RPG SCENE
    │       ↓ unlocked chapter found?
    │       YES → /legacy/chapter/:chapterId   ← LIVE RPG SCENE
    │       ↓ chapters exist but all locked?
    │       YES → /legacy/start               ← ancestor selection
    │
    ├── completeness.chapterUnlockReady?
    │       YES → /legacy/start               ← ancestor selection
    │
    └── → /legacy/onboarding                  ← Chapter 0
```

**Legacy Home hero button** (line 1060):
```tsx
onClick={() => navigate(`/legacy/chapter/${activeSession.currentChapterId}`)}
```
When `activeSession` exists, Continue Journey goes directly to the live chapter.
When no active session, it goes to `/legacy/start` for ancestor selection → then chapter.

---

## API Backend Routes (api-server)

All routes registered in `artifacts/api-server/src/routes/index.ts`.

### Nia AI Routes
- `GET  /api/nia/voice/profiles` — List voice profiles with ElevenLabs availability
- `POST /api/nia/voice/transcribe` — Audio → text (Whisper STT via OpenAI)
- `POST /api/nia/voice/speak` — Text → audio (TTS via ElevenLabs or OpenAI nova)

### Legacy Engine Routes
- `GET  /api/legacy/chapters/:familyId` — List chapters for a family
- `POST /api/legacy/chapters/:familyId/init` — Initialize world + generate chapter seeds from vault data
- `PATCH /api/legacy/chapters/:chapterId/status` — Transition chapter status (locked→unlocked→in_progress→completed)
- `GET  /api/legacy/chapters/:chapterId/scenes` — Load scenes for a chapter
- `GET  /api/legacy/completeness/:familyId` — Readiness score + missing data suggestions
- `GET  /api/legacy/ancestors/:familyId` — Best ancestor candidates for gameplay
- `POST /api/legacy/map/:familyId/places` — Pin a new family landmark
- `GET  /api/legacy/game-master/:familyId/today` — Today's journey / emotional calendar
- `GET  /api/legacy/game-master/:familyId/daily-welcome` — Daily world changes
- `GET  /api/legacy/game-master/:familyId/narration` — Scene/chapter AI narration
- `GET  /api/legacy/sessions/active/:familyId` — Active play session (Continue Journey)
- `POST /api/legacy/sessions` — Create new play session
- `POST /api/legacy/sessions/progress` — Save scene progress + choice
- `POST /api/legacy/reservoir/:familyId/invalidate` — Force world cache invalidation

---

## Audio Recording — End-to-End Flow

### Legacy Onboarding (legacy-onboarding.tsx — Quest 2)
1. `MediaRecorder` captures real audio (getUserMedia)
2. Chunks collected into `audioChunksRef`
3. On stop: Blob → base64 → POST `/api/family/:id/memories` (create memory)
4. POST `/api/family/:id/memories/:id/assets/upload-direct` (base64 audio asset)
5. POST `/api/nia/voice/transcribe` (Whisper STT → transcript)
6. PATCH memory description with transcript text
7. POST `/api/legacy/reservoir/:familyId/invalidate` (world regeneration trigger)
8. World version increments; new quests/dialogue generated on next play

### Legacy Home (legacy-home.tsx)
- Same flow; separate MediaRecorder + upload logic in `startRealRecording()`

---

## Legacy Chapter Scene Engine

Route: `/legacy/chapter/:chapterId` (legacy-chapter.tsx)

### Session Stats (RPG character stats — affect dialogue & quests)
| Stat | Color | Effect |
|---|---|---|
| Knowledge | Sky blue | Unlocks historical clues |
| Relationships | Rose | Changes NPC responses + available quests |
| Cultural Wisdom | Amber | Unlocks traditions, languages, cultural content |
| Courage | Orange | Allows difficult historical challenges |
| Reputation | Cyan | Community NPC dialogue changes |
| Legacy | Amber | Cumulative family history built |
| Faith | Violet | Spiritual/community dialogue paths |

### Scene Types
- `narration` — Standard prose text + continue/reflect choices
- `dialogue` — **NPC portrait + speech bubble** layout + Listen/Ask/Reflect choices
- `reflection` — Record a memory / continue / sit with moment
- `context` — Historical context tags + continue

### Day-Cycle Progression
```
Morning → Dialogue → Choice → Travel → Discovery → Quest → Evening → Journal → Autosave
```

### Scene Footer Actions
- **Journal** → `/legacy/journal` (auto-written from session)
- **Scene progress dots** — visual progress through the day
- **Map** → `/legacy/map/:familyId`

### Completion Flow
1. All scenes done → `PATCH /api/legacy/chapters/:id/status` `{ status: "completed" }`
2. Backend unlocks next chapter; returns `nextChapterId`
3. World evolution log entry created
4. Completion screen with AI narrator message (Nia), session stats, and "Continue to Next Chapter"

---

## World Regeneration Rules

| Contribution | Automatically Regenerates |
|---|---|
| Oral Story / Audio | Dialogue, journal entries, side quests |
| New Ancestor | Character roster, chapters, relationship graph |
| Family Photo | Collectibles, locations, memories, NPC knowledge |
| Landmark | Exploration map, travel quests |
| Recipe | Cooking quests, cultural traditions, achievements |
| New Family Member | Co-op activities, shared missions, reunion events |

**Trigger:** `POST /api/legacy/reservoir/:familyId/invalidate` bumps `family_knowledge_versions` version.
The next quest generation call finds a changed fingerprint → regenerates all content.

---

## First-Run Detection

`legacy:setupDone` localStorage key:
- Not set → redirect to `/legacy/onboarding` (Chapter 0: Awaken the Legacy)
- Set to `"1"` → show normal Legacy Home experience
- `legacy-onboarding.tsx` sets this key at completion

---

## Railway Deployment

**Production URL:** `https://zesty-ambition-production-f6a1.up.railway.app`

**Healthcheck:** `GET /api/healthz` → 200 OK when DB is connected

**Database:** PostGIS at `reseau.proxy.rlwy.net:46078` (use PostGIS, NOT plain PostgreSQL)

**Key env vars required:**
- `DATABASE_URL` — PostGIS connection string
- `OPENAI_API_KEY` — Whisper STT + OpenAI TTS fallback
- `ANTHROPIC_API_KEY` — Claude AI for quest/dialogue generation
- `SESSION_SECRET` — Express session signing
- `ELEVENLABS_API_KEY` — (optional) ElevenLabs TTS regional voices

**Nia AI routes verified working on Railway:**
- `GET /api/nia/voice/profiles` → 200 ✅
- `POST /api/nia/voice/transcribe` → 200 ✅ (requires OPENAI_API_KEY)

**Recent deploy fixes (all merged to main):**
- `fix(build)`: GIT_COMMIT baked at Railway build time (resolves `unknown` commit hash)
- `fix(migrations)`: RECOVERY_CHECKs for Phase 5 tables (0093–0103) — idempotent migrations
- `fix(migrations)`: Legacy engine migration chain fixed for fresh PostgreSQL installs

---

## Reference Images

Stored in `docs/legacy-mode-design/reference-images/`:
- `game-modes-characters-oral-recording.png` — Game modes, characters, oral recording UI
- `legacy-dashboard-full.png` — Full Legacy Mode dashboard layout reference
- `12-screen-overview.png` — Complete 12-screen Legacy Mode overview

---

## Implementation Status

### ✅ Complete
- Chapter 0 onboarding (Quest 1: Add ancestor, Quest 2: Record audio (real MediaRecorder + Nia STT), Quest 3: Pin place)
- `legacy-chapter.tsx` — Full RPG scene engine (narration, dialogue, reflection, context scene types)
- Session stats (7 RPG stats: knowledge, relationships, culturalWisdom, courage, reputation, legacy, faith)
- Autosave after each scene choice
- AI narrator (Nia Game Master) per scene + chapter completion narration
- Mystery Quest creation from dialogue choices
- Memory recording from reflection choices (writes to Family Vault)
- World regeneration indicator on chapter completion
- `/legacy/play` → `legacy-play.tsx` — proper Continue Journey router (finds active chapter, enters RPG directly)
- `legacy-start.tsx` — cinematic ancestor selection with "You awaken…" reveal sequence
- Session restore (resume scene progress after browser close)
- Daily welcome / world evolution (Phase 5)
- Emotional calendar (family birthdays, anniversaries, migration dates)
- Co-op readiness (live family members online check)
- Reunion challenges
- Seasonal events

### ✅ Completed Aug 4, 2026
- **Geocoding for family places** — `artifacts/api-server/src/lib/geocode.ts` (Nominatim OSM + country centroid fallback for ~80 diaspora-relevant countries). Geocodes on save (non-blocking) + backfill endpoint `POST /api/legacy/map/:familyId/places/geocode-missing`. Frontend auto-triggers backfill on load when `placesWithoutCoordinates > 0`; shows "Locating places…" spinner.
- **Audio playback in RPG scenes** — `legacy-chapters.ts` now fetches audio assets from `family_memory_assets` and resolves presigned URLs; `legacy-chapter.tsx` shows a Play/Pause button with waveform animation for memory scenes with real recordings. Audio pauses automatically on scene navigation.

### 🔄 In Progress / Needs Verification
- Chapter 5+ generation (AI-generated from deeper vault data)
- Live video interview as a first-class Legacy quest (Phase 4)

### 📋 Future Phases
- AR real-world landmark visit mechanic
- Synchronous multiplayer "play the same ancestor session together"
- GPS-based location discovery
- Character skill tree (Historian, Explorer, Story Keeper, Photographer, etc.)
- Living AI Director — daily autonomous quest generation

---

## Reference Images (Aug 4, 2026)

Stored in `docs/legacy-mode-design/reference-images/`:
- `legacy-12-screen-overview-aug3.png` — 12-screen onboarding + gameplay overview (Chapter 0, legacy start, RPG scene, co-op, world map, Sunday dinner)
- `legacy-full-dashboard-aug3.png` — Full Legacy Mode dashboard: character card, family vault, RPG scene, dynamic world map, co-op quests, achievements, live video, journal, timeline
- `legacy-game-modes-overview-aug2.png` — Game modes (Legacy/Exploration/Family Quests/Reunion), characters (Ama Serwaa, Kofi Mensah, Abena Mensah, Nana Kwame), inventory, oral story recording, settings, progress dashboard, multiplayer reunion

_Last updated: 2026-08-04 — geocoding pipeline, audio playback in RPG scenes, new reference images added_
