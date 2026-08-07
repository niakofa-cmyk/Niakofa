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

## The Core Loop (Aug 2026 Design Document)

> "Right now, Legacy still appears to behave like: Feature → Feature → Feature → Feature.
> Instead it needs to become: Memory → AI → World Changes → Player Notices → New Gameplay → New Memory.
> That loop should drive every play session."

**Wired Status:**
- ✅ `logWorldEvolution()` called on every vault mutation (member, memory, story, interview, place, event, relation)
- ✅ `bumpKnowledgeVersionIfChanged()` called after every evolution log entry
- ✅ Cache busted on every vault write so AI sees fresh data immediately
- ✅ `LegacyCoreLoop` component shows the loop steps to the player after chapter completion
- ✅ Auto-journal generated after every play session

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

## AI World Regeneration — Contribution → Gameplay Changes Table

| Contribution | Gameplay Changes |
|---|---|
| New ancestor | Character, quests, timeline, chapters unlocked |
| Oral story (interview) | Dialogue, journal, side quests regenerated |
| Photo | Collectibles, memories, relationships updated |
| Landmark (place) | Map expansion, exploration quests unlocked |
| Letter / document | Historical context, mysteries, collectibles |
| Family recipe | Cultural traditions, cooking quests, achievements |
| New relative (family member) | Co-op content, reunion events, shared missions |

All of the above are wired via `logWorldEvolution()` in `artifacts/api-server/src/lib/legacy-world-evolution.ts`.

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
| `/legacy/interview-quest` | legacy-interview-quest.tsx | Microphone as gameplay |

---

## Continue Journey — Full Flow

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

---

## Feature Inventory — Backend Routes

| Route File | Purpose | Status |
|---|---|---|
| legacy.ts | Family reservoir + AI quest generation (cached) | ✅ |
| legacy-completeness.ts | Vault readiness scoring | ✅ |
| legacy-chapters.ts | Chapter state machine (locked→unlocked→in_progress→completed) | ✅ |
| legacy-game-master.ts | AI narration + rich character profiles | ✅ |
| legacy-ai-director.ts | AI-driven mission generation from vault gap analysis | ✅ |
| legacy-world-evolution.ts | World change log GET/POST | ✅ |
| legacy-interview-quest.ts | Interview quest (microphone as gameplay) | ✅ |
| legacy-auto-journal.ts | Auto-generated journal entries after sessions | ✅ |
| legacy-achievements.ts | Achievement tracking | ✅ |
| legacy-map.ts | Family map + GPS check-in + place add | ✅ |
| legacy-challenges.ts | Family challenges (co-op) | ✅ |
| legacy-seasonal-events.ts | Seasonal events | ✅ |
| legacy-memory-mysteries.ts | Mystery quest system | ✅ |
| legacy-character-evolution.ts | Character evolution tracking | ✅ |
| legacy-reunion.ts | Reunion events + leaderboard | ✅ |
| legacy-family-quests.ts | Cooperative family quests | ✅ |
| legacy-coop.ts | Live co-op readiness (WebSocket presence) | ✅ |

---

## Feature Inventory — Backend Libs

| Lib File | Purpose |
|---|---|
| legacy-ai-gateway.ts | AI model gateway |
| legacy-ai-director-enhanced.ts | Vault gap analysis |
| legacy-character-profile.ts | Rich AI-generated character profiles |
| legacy-consent.ts | Consent management |
| legacy-knowledge-version.ts | Knowledge versioning + world regeneration |
| legacy-world-evolution.ts | Evolution logging (wired to all vault mutations) |
| historical-context.ts | Historical context generation |

---

## Feature Inventory — Frontend Pages

| Page | Route | Purpose | Status |
|---|---|---|---|
| legacy-home.tsx | /legacy | Hub with Progress Dashboard, chapters, quests | ✅ |
| legacy-onboarding.tsx | /legacy/onboarding | Chapter 0: Awaken the Legacy | ✅ |
| legacy-chapter.tsx | /legacy/chapter/:id | Interactive scene viewer with choices | ✅ |
| legacy-play.tsx | /legacy/play | Continue Journey router | ✅ |
| legacy-character.tsx | /legacy/character/:id | Rich character biography with AI traits | ✅ |
| legacy-journal.tsx | /legacy/journal | Auto-journal reader | ✅ |
| legacy-map.tsx | /legacy/map | World map with GPS check-in | ✅ |
| legacy-achievements.tsx | /legacy/achievements | Achievement gallery | ✅ |
| legacy-ai-director.tsx | /legacy/ai-director | AI Director missions | ✅ |
| legacy-world-evolution.tsx | /legacy/world-evolution | World evolution log | ✅ |
| legacy-interview-quest.tsx | /legacy/interview-quest | Microphone as gameplay | ✅ |
| legacy-start.tsx | /legacy/start | Ancestor selection | ✅ |
| legacy-challenges.tsx | /legacy/challenges | Challenge list | ✅ |
| legacy-seasonal-events.tsx | /legacy/seasonal-events | Seasonal events | ✅ |
| legacy-memory-mysteries.tsx | /legacy/mysteries | Memory mystery quests | ✅ |
| legacy-character-evolution.tsx | /legacy/characters | All characters / family lineage | ✅ |

---

## Character System

Every ancestor contains (or can contain via AI generation):
- Personality traits (archetype, description, trait list)
- Skills (occupation, known skills, craft level)
- Beliefs (spiritual, values, speech style)
- Memories (life events, stories, places)
- Historical knowledge (from vault + historical context API)
- Emotional profile
- Reputation score
- Legacy score

Wired via `legacy-character-profile.ts` → called from `legacy-game-master.ts` → displayed in `legacy-character.tsx`.

---

## Interview Quest Pipeline

```
Interview Quest → Record Audio (MediaRecorder)
    → POST /api/legacy/interview-quests/:questId/submit
        → AI Transcribes (Nia Whisper STT)
        → AI Extracts Facts (people, places, events, emotional themes)
        → Saves to vault (family_memories, family_places, family_events, family_stories)
        → logWorldEvolution(familyId, "interview_added")
    → POST /api/legacy/interview-quests/:questId/complete
        → syncAchievements()
        → World regeneration triggered
        → Chapter unlock checked
    → GET /api/legacy/interview-quests/:questId/result
        → Show extracted facts, new places, dialogue snippet
```

---

## Known Gaps & Future Work

| Gap | Priority | Notes |
|---|---|---|
| Live Video Interview | High | Needs WebRTC/video infra. UI stub added (Aug 2026). |
| SMS/offline onboarding | Low | Architecture planned, not implemented |
| Email/SMS notifications | Low | Stored but only push delivered |
| Civic Portal Stripe wiring | Low | Separate from Legacy Mode |
| Helper Reliability Scoring | Low | Schema exists, no scoring logic |

---

## Reference Images (Aug 2026)

All reference images live in `docs/legacy-mode-design/reference-images/`:

| File | Contents |
|---|---|
| `legacy-ui-reference-aug1-fullscreen.png` | Full UI dashboard — game modes, live gameplay, world map, in-game characters, family vault, oral recording, settings, progress dashboard, multiplayer panel |
| `legacy-ui-reference-aug1-rpg-session.png` | RPG gameplay session — the living world map, character progression panel, skills, dynamic chapters, actual game session scene, living map, journey progress, timeline of legacy |
| `legacy-ui-reference-aug3-onboarding-detail.png` | Detailed onboarding screens — Chapter 0 Awaken the Legacy, legacy start screen, live RPG story scene, dynamic world map, chapter select, family vault, character progression, co-op family quest, achievements, live video interview, journal, timeline, legacy continues |
| `legacy-ui-reference-aug3-screens-grid.png` | 12-screen grid — onboarding (Ch.0), legacy start, onboarding quests 1/2/3, world regeneration, dynamic chapters, live RPG gameplay, character progression, co-op family quest, living world map, legacy continues |
| `legacy-full-dashboard-aug3.png` | Full dashboard view |
| `legacy-12-screen-overview-aug3.png` | Earlier 12-screen overview |

---

## Session Notes

### August 7, 2026 — Cross-feature audit reference

The current audit and verification record is maintained at
`docs/audits/2026-08-07-circles-audio-payment.md`. It covers Circles
presence/signaling/media lifecycle, the payment-intent approval gate, Stripe
Connect stale-state signaling, offline test evidence, and the committed Legacy
reference assets. Keep the audit beside this document rather than duplicating
the findings across individual feature notes.

### Aug 2026 Session

**Design document added:** "Biggest missing piece — right now Legacy still appears to behave like Feature→Feature→Feature instead of Memory→AI→World Changes→Player Notices→New Gameplay→New Memory."

**Key decisions made:**
1. Progress Dashboard upgraded to circular SVG ring (matching reference images)
2. Progress Dashboard "View Full Progress" now routes to `/legacy/world-evolution` (was `/diaspora/timeline`)
3. Live Video Interview stub added to interview-quest page
4. Reference images (Aug 1 + Aug 3, 2026) committed to `docs/legacy-mode-design/reference-images/`
5. All vault mutation paths confirmed wired to `logWorldEvolution()`

**Confirmed wired (vault → world regen):**
- `POST /family/:id/members` → `logWorldEvolution(familyId, "member_added")`
- `POST /family/:id/memories` → `logWorldEvolution(familyId, "memory_added")`
- `POST /family/:id/memories/:id/assets` (upload-direct) → `logWorldEvolution(familyId, "memory_added")`
- `POST /family/:id/interviews` → `logWorldEvolution(familyId, "interview_added")`
- `POST /family/:id/stories` → `logWorldEvolution(familyId, "story_added")`
- `POST /legacy/map/:id/places` → `logWorldEvolution(familyId, "place_added")`
- `POST /diaspora/family-events` → `logWorldEvolution(familyId, "event_added")`
- `POST /diaspora/family-relations` → `logWorldEvolution(familyId, "relation_added")`
- Interview quest complete → `logWorldEvolution(familyId, "interview_added")`
- Chapter complete → `logWorldEvolution(familyId, "world_regenerated")`

**Emotional pacing rhythm (from design document):**
> "The experience should alternate between: discovery, conversation, exploration, reflection, contribution."
> This rhythm keeps the experience engaging without overwhelming the player.
