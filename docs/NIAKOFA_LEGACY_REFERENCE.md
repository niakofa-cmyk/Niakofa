# Niakofa Legacy Mode — Living Family RPG Reference

> Reference document for the Niakofa Legacy experience.
> Keep this file: contains design decisions, component map, and feature status.

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

---

## Route Map

| Route | Page | Purpose |
|-------|------|---------|
| `/legacy` | legacy-home.tsx | Hub — Continue Journey, quests, world state |
| `/legacy/onboarding` | legacy-onboarding.tsx | Chapter 0: Awaken the Legacy (first-run) |
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

---

## API Backend Routes (api-server)

All routes registered in `artifacts/api-server/src/routes/index.ts`.

### Nia AI Routes
- `GET  /api/nia/voice/profiles` — List voice profiles with ElevenLabs availability
- `POST /api/nia/voice/transcribe` — Audio → text (Whisper STT via OpenAI)
- `POST /api/nia/voice/speak` — Text → audio (TTS via ElevenLabs or OpenAI nova)

### Legacy Engine Routes
- `POST /api/legacy/chapters/:familyId/init` — Initialize world + generate chapter seeds from vault data
- `GET  /api/legacy/chapters/:chapterId/scenes` — Load scenes for a chapter
- `GET  /api/legacy/completeness/:familyId` — Readiness score + missing data suggestions
- `GET  /api/legacy/ancestors/:familyId` — Best ancestor candidates for gameplay
- `POST /api/legacy/map/:familyId/places` — Pin a new family landmark
- `GET  /api/legacy/game-master/:familyId/today` — Today's journey / emotional calendar
- `GET  /api/legacy/sessions/active/:familyId` — Active play session (Continue Journey)
- `POST /api/legacy/sessions` — Create new play session
- `POST /api/legacy/reservoir/:familyId/invalidate` — Force world cache invalidation

---

## Audio Recording — End-to-End Flow

### Family Vault (family-vault.tsx)
1. `MediaRecorder` captures audio with Web Audio API level meter
2. `stopAndUpload()` → POST `/api/family/:id/interviews` (create session)
3. POST `/api/family/:id/memories` (create memory record)
4. POST `/api/family/:id/memories/:id/assets/upload-direct` (base64 audio upload)
5. **NEW:** POST `/api/nia/voice/transcribe` (Whisper STT → transcript)
6. PATCH memory description with transcript (drives quest/dialogue generation)
7. POST `/api/legacy/reservoir/:familyId/invalidate` (regenerate world)

### Legacy Home (legacy-home.tsx)
- Same flow: MediaRecorder → vault → reservoir invalidate

### Legacy Onboarding (legacy-onboarding.tsx — Quest 2)
- MediaRecorder → vault → Nia voice transcribe → memory description update → invalidate

---

## Legacy Chapter Scene Engine

Route: `/legacy/chapter/:chapterId` (legacy-chapter.tsx)

### HUD Stats (colored progress bars)
- Health (relationships) — emerald
- Knowledge — sky blue
- Courage — orange
- Faith — violet
- Reputation — cyan
- Legacy — amber

### Scene Types
- `narration` — Standard prose text + continue/reflect choices
- `dialogue` — **NPC portrait + speech bubble** layout + Listen/Ask/Reflect choices
- `reflection` — Record a memory / continue / sit with moment
- `context` — Historical context tags + continue

### Scene Footer
- Journal button → `/legacy/journal`
- Scene progress dots
- Map button → `/legacy/map/:familyId`

### Day-Cycle Progression Bar
Morning → Dialogue → Choice → Travel → Discovery → Quest → Evening → Journal → Autosave

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

---

## First-Run Detection

`legacy:setupDone` localStorage key:
- Not set → redirect to `/legacy/onboarding` (Chapter 0)
- Set to `"1"` → show normal Legacy Home experience
- Onboarding completion sets this key

---

## Railway Deployment

**Production URL:** `https://zesty-ambition-production-f6a1.up.railway.app`

**Healthcheck:** `GET /api/healthz` → 200 OK when DB is connected

**Database:** PostGIS at `reseau.proxy.rlwy.net:46078` (use this, NOT the plain PostgreSQL)

**Key env vars required:**
- `DATABASE_URL` — PostGIS connection string
- `OPENAI_API_KEY` — Whisper STT + OpenAI TTS fallback
- `ANTHROPIC_API_KEY` — Claude AI for quest/dialogue generation
- `SESSION_SECRET` — Express session signing
- `ELEVENLABS_API_KEY` — (optional) ElevenLabs TTS regional voices

**Nia AI routes verified working on Railway:**
- `GET /api/nia/voice/profiles` → 200 ✅

---

## Reference Images

Stored in `attached_assets/`:
- `ChatGPT_Image_Aug_3,_2026,_04_53_21_PM_*.png` — 12-screen Legacy Mode overview
- `ChatGPT_Image_Aug_3,_2026,_10_54_14_PM_*.png` — Full Legacy Mode dashboard layout
- `ChatGPT_Image_Aug_2,_2026,_11_31_50_AM_*.png` — Game modes, characters, oral recording

---

## Session Storage Notes

- **Continue Journey:** `GET /api/legacy/sessions/active/:familyId` returns `{ session: { id, current_chapter_id, ancestor_member_id } }`
- `legacy-home.tsx` line ~1057: `navigate(\`/legacy/chapter/${activeSession.currentChapterId}\`)` ← correct
- When no active session but chapters exist: navigates to `/legacy/start` (which then goes to chapter)

---

_Last updated: 2026-08-04 — Chapter 0 onboarding, cinematic RPG scene, wired MediaRecorder + Nia voice transcript_
