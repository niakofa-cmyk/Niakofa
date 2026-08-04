# AI Story Extraction — Design Doc

Status: **design only, not implemented.** Written 2026-08-01. No code in this
repo implements anything below yet.

## 1. Problem, grounded in what's actually in the codebase today

The Legacy Mode design docs describe a flywheel: a family records a story →
AI extracts structured facts (people, places, dates) → those facts populate
the Family Graph / Memory Graph → the game world grows. Today that loop is
broken at the extraction step. Concretely, as of commit `59cb5168`:

- `family_interviews` (migration `0082`) really does support the full
  `scheduled → recording → transcribing → review → published` lifecycle, and
  oral recording is real (`family-vault.tsx`, `MediaRecorder`, real
  `upload-direct` storage — verified in an earlier pass).
- `family_transcription_jobs` **exists as a real Postgres table** (created in
  the same `0082` migration) but has **no Drizzle schema export**
  (`lib/db/src/schema/` has no `family-transcription-jobs.ts`) and **no
  worker or route ever reads or writes it**. It's dead infrastructure — the
  table is there, nothing uses it.
- The one real Anthropic call in `family.ts` (`POST
  /family/:id/memories/:memoryId/translate`) does translation, not
  extraction.
- `family_events`, `family_places`, and `family_tree_relations` have **no
  provenance column** — no way to mark a row as AI-suggested vs.
  human-entered/verified. Every row in those tables today is implicitly
  "verified" because a human created it directly.
- There is a real, working, near-identical pattern to model this on:
  `artifacts/api-server/src/workers/griot-transcription-worker.ts` — a
  production Whisper-based transcription worker for a *different* feature
  (Griot stories), with atomic job claiming, retry limits, an SSRF-safe
  fetch, and a kill-switch via `system_settings`. It is registered in
  `index.ts` and polls every 2 minutes. This is the template.

So "AI story extraction" is really **two missing pieces**, not one:

1. **Transcription**: audio → text. Infrastructure (table) exists; nothing
   consumes it.
2. **Extraction**: text → structured facts (people/places/dates/events).
   Nothing exists for this at all — no table, no worker, no route.

## 2. Non-negotiable constraint: the trust model

Both design docs are explicit and consistent on this point, and it should
govern every implementation choice below:

> Verified family history = immutable. Unknown details = clearly labeled
> narrative interpretation. The AI must never silently turn the third
> category into the first.

Applied to this feature: **the AI never writes directly into
`family_events`, `family_places`, or `family_tree_relations`.** Those tables
are "verified" by construction today (a human typed it in). If extraction
wrote into them directly, that invariant breaks silently — a family notices
extraction gets scenes now enters as regular history.

Extraction output is **always a suggestion in a staging table**, surfaced to
a human curator, and only becomes a real graph row when a human accepts it.
Rejected/ignored suggestions never appear anywhere else in the app (not in
quests, not in chapter generation, not in the completeness score).

## 3. Proposed architecture

```
family_memories / family_interviews (existing)
        │  (memory has story/description text, OR interview has audio asset)
        ▼
┌─────────────────────────┐
│ Stage 1: Transcription   │  (only for interviews with audio, no text yet)
│ family-transcription-    │  — models griot-transcription-worker.ts
│ worker.ts                │  — Whisper via OPENAI_API_KEY, same as Griot
└───────────┬──────────────┘
            │ writes transcript into family_memories.story,
            │ advances family_interviews.status → 'review'
            ▼
┌─────────────────────────┐
│ Stage 2: Extraction      │  (any family_memory with story/description text,
│ family-extraction-       │   transcribed or typed directly — extraction
│ worker.ts                │   doesn't care which)
│ — Claude, strict JSON    │
└───────────┬──────────────┘
            │ writes rows to NEW table family_extracted_facts
            │ (status: pending)
            ▼
┌─────────────────────────┐
│ Curator review UI        │  human accepts/edits/rejects each suggestion
│ (new page in             │
│  pay-it-forward)         │
└───────────┬──────────────┘
            │ on accept only:
            ▼
family_events / family_places / family_tree_relations (existing, real)
```

## 4. New DB objects (migration, not yet written)

```sql
-- Drizzle schema export for the EXISTING family_transcription_jobs table
-- (no new migration needed for this part — table already exists from 0082).

-- NEW table + enum, next migration number (0096 as of this doc):
CREATE TYPE family_extracted_fact_type AS ENUM (
  'person',        -- a person mentioned who may not be in family_members yet
  'place',         -- a location mentioned
  'event',         -- a dated event (birth, migration, marriage, etc.)
  'relationship'   -- an implied parent/spouse edge between two known members
);

CREATE TYPE family_extracted_fact_status AS ENUM (
  'pending', 'accepted', 'edited_and_accepted', 'rejected'
);

CREATE TABLE family_extracted_facts (
  id              SERIAL PRIMARY KEY,
  family_id       INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  memory_id       INTEGER NOT NULL REFERENCES family_memories(id) ON DELETE CASCADE,
  fact_type       family_extracted_fact_type NOT NULL,
  -- Free-form structured payload, shape depends on fact_type — e.g. for
  -- 'event': { title, date_text, category, place_label, member_name }
  payload         JSONB NOT NULL,
  confidence      TEXT NOT NULL,  -- 'high' | 'medium' | 'low' — model self-reported
  source_excerpt  TEXT NOT NULL,  -- the sentence(s) the model based this on, for curator review
  status          family_extracted_fact_status NOT NULL DEFAULT 'pending',
  -- set only when status moves to accepted/edited_and_accepted
  resulting_event_id    INTEGER REFERENCES family_events(id) ON DELETE SET NULL,
  resulting_place_id    INTEGER REFERENCES family_places(id) ON DELETE SET NULL,
  resulting_relation_id INTEGER REFERENCES family_tree_relations(id) ON DELETE SET NULL,
  reviewed_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_family_extracted_facts_family ON family_extracted_facts(family_id);
CREATE INDEX idx_family_extracted_facts_memory ON family_extracted_facts(memory_id);
CREATE INDEX idx_family_extracted_facts_status ON family_extracted_facts(family_id, status);
```

Why a staging table instead of a `provenance` column on the real tables:
editing three existing, actively-queried tables to add nullable
"suggested-by-AI-not-yet-confirmed" rows means every existing read site
(completeness score, reservoir, timeline, map) would need to remember to
filter them out, and one missed filter site is a silent trust violation.
A separate table makes "not yet real" structurally impossible to
accidentally query as real.

## 5. New backend surface

**`artifacts/api-server/src/workers/family-transcription-worker.ts`**
(new file, closely modeled on `griot-transcription-worker.ts`):
- Polls `family_transcription_jobs` where `status = 'pending'`, claims
  atomically (`UPDATE ... WHERE status = 'pending'`, same pattern).
- Downloads the linked `family_memory_assets` audio via `safeFetch`
  (SSRF guard, matching the existing pattern), transcribes via Whisper
  (`OPENAI_API_KEY`, same provider already in use).
- Writes the transcript into the linked `family_memories.story`, advances
  `family_interviews.status` to `'review'` (human still confirms it's
  accurate/publishable — matches the existing state machine, doesn't skip
  it).
- Same fail-loud-not-fabricated behavior as the Griot worker: no key
  configured → job errors out, never invents a transcript.

**`artifacts/api-server/src/workers/family-extraction-worker.ts`** (new file):
- Polls `family_memories` that have `story` or `description` text and no
  existing `family_extracted_facts` row yet (or a new `extraction_status`
  column on `family_memories` — simpler: check for absence of rows, add a
  small index).
- Calls Claude with a **strict, narrow extraction prompt** (see §6), one
  memory at a time, capped input length.
- Inserts `family_extracted_facts` rows with `status: 'pending'`.
- Gated by `ANTHROPIC_API_KEY` presence, same fail-loud pattern.
- Should only ever process memories from **consented members**
  (`getConsentedMemberIds`, already used in `legacy.ts` and
  `legacy-consent.ts`) — extraction must not run on a story where the
  subject hasn't agreed to have their story processed by AI at all.

**New routes**, `artifacts/api-server/src/routes/legacy-extraction.ts`
(or `family-extraction.ts`):
- `GET /api/legacy/extracted-facts/:familyId` — pending suggestions for
  curator review (role-gated, `CAN_WRITE_ROLES` same as other family
  mutations).
- `POST /api/legacy/extracted-facts/:factId/accept` — body may include
  edits to the payload before it's committed; creates the real
  `family_events`/`family_places`/`family_tree_relations` row, sets
  `resulting_*_id` + `status: 'edited_and_accepted'` or `'accepted'`,
  `reviewed_by`/`reviewed_at`.
- `POST /api/legacy/extracted-facts/:factId/reject` — sets `status:
  'rejected'`, `reviewed_by`/`reviewed_at`. No further trace in gameplay.

## 6. Extraction prompt spec (draft)

Key constraints, matching the trust model and the existing prompt style in
`legacy.ts`:

- Input: one memory's `title` + `description`/`story` text, capped (e.g.
  4000 chars, matching the `translate` route's `.slice(0, 8000)` pattern).
- Output: **strict JSON array only**, one object per candidate fact, same
  "no preamble, no markdown fences" instruction already used successfully
  in `generateAiQuests`.
- Each fact must carry `confidence` and `source_excerpt` (the literal
  sentence it came from) so a curator can verify it against the original
  text without re-reading the whole memory.
- System prompt must explicitly forbid inference beyond the text — e.g.
  "If the story says 'we moved when I was young' with no year, do NOT
  invent a year. Extract 'migration, date unknown' rather than guessing
  a date." This is the direct code-level enforcement of the "narrative
  interpretation must never be presented as verified fact" rule — the
  model should mark uncertain items `confidence: 'low'` and leave fields
  blank rather than fill gaps.
- `relationship` facts should only propose edges between people already
  in `family_members` for that family (matched by name) — never invent a
  new person as a relationship endpoint; that goes through the `person`
  fact type instead, which becomes a "possible new family member" prompt
  for the curator, not an automatic member creation.

## 7. Frontend

New page (or a tab on `family-vault.tsx`), e.g. `/legacy/review` or a
"Suggestions" panel in the vault: lists pending
`family_extracted_facts` grouped by memory, each showing the
`source_excerpt`, the proposed fact, and Accept / Edit & Accept / Reject
actions. This is squarely a Phase 2 "Story Intelligence" UI, same tier as
the achievements work just shipped.

## 8. Consent & rollout

- Same fail-closed environment-variable gating already used everywhere
  else in this codebase (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`,
  `nia_enabled` system setting) — extraction and transcription should
  both check `isNiaEnabled()`-equivalent kill switches before running,
  matching `griot-transcription-worker.ts`.
- Consent-gated: only process memories belonging to consented members.
- Recommended phased rollout:
  - **P0**: extraction worker only, operating on memories that already
    have text (typed stories, or interviews already manually
    transcribed by a human today). No transcription worker yet. Ships
    the curator review UI. This is the safely-scoped version discussed
    earlier as an alternative to building everything at once.
  - **P1**: add the transcription worker so audio interviews feed P0
    automatically instead of requiring a human to type the transcript
    first.
  - **P2**: extraction also proposes achievement-relevant tags (e.g.
    flag a memory as relevant to "Voice of the Elders") — lower
    priority, deferred.

## 9. Open questions for a decision before implementation starts

1. Confirm P0 scope (text-only extraction + review UI) is the right
   first slice, or whether transcription should ship in the same pass.
2. Where should the review UI live — a new route, or folded into
   `family-vault.tsx`? (Affects nav/IA more than backend.)
3. Should a `person` fact (a mentioned relative not yet in
   `family_members`) auto-open the "add member" flow pre-filled from the
   extraction, or just be a plain suggestion the curator manually acts
   on? Auto-opening is more convenient; a plain suggestion keeps the
   extraction worker fully decoupled from the tree-editing flow.
