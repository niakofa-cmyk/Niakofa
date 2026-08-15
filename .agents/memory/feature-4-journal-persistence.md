---
name: Feature 4 — Journal + Quest Persistence
description: DemoJournalEntry and PersistedQuestProgress moved to DemoState; all journal writes now inside setState+persist.
---

## Rule
`DemoJournalEntry` is now defined in `src/lib/legacy-demo-state.ts` (canonical).
`src/components/legacy-demo-journal.tsx` re-exports it with `export type { DemoJournalEntry }` for backward compat.
Never define it in the journal component again.

`DemoState` now has `journalEntries: DemoJournalEntry[]` and `questProgress: PersistedQuestProgress[]`.
`DEFAULT_DEMO_STATE` initialises both to `[]`.

**Why:** Journal entries were volatile (lost on reload). Persisting them enables lorebook activation
to correctly reference past conversations after the player resumes.

## How to apply
- All writes to `journalEntries` go inside a **single** `setState(prev => persist({...prev, journalEntries: [...]}))` call.
  Never call `setJournalEntries` (local state) — that variable no longer exists.
- `handleNpcOutcome` and `handleLandmarkInspect` both follow this pattern now.
- `npcMemoryTags` and `completedNpcIds` memos derive from `state.journalEntries`, not local state.
- `readDemoState` sanitizer caps `journalEntries` at 200 (most recent kept); `questProgress` at 50.

## Storage key
`"niakofa:demo:v2"` — no key bump needed; sanitizer safely defaults missing fields to `[]`.
