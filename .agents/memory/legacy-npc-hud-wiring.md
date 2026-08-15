---
name: Legacy NPC + HUD wiring
description: Prop contracts, state location, wiring status, journal outcome logic, lorebook system for NPC dialogue and game HUD in legacy-demo.tsx
---

## State location (legacy-demo.tsx)
- `gameHour` — local `useState(8)`, advanced by `advanceGameHour()` on each `handleMapMove`
- `activeNpcId` — local `useState<string | null>(null)`
- `npcInteractionCount` — local `useState(0)`, incremented in `handleNpcOutcome`
- `journalOpen` — local `useState(false)`, toggles Memory Journal overlay
- `journalEntries: DemoJournalEntry[]` — local `useState([])`, appended by handleNpcOutcome + handleLandmarkInspect

None persisted to DemoState; all reset naturally each session.

## Wired as of commit fbb02bc2 (Aug 2026)
- `activeQuest` → `getAvailableQuests(state.phase, []).at(0) ?? null` via `useMemo`
- `nearbyNpcs` → `getPhaseNpcs(state.phase, gameHour).filter(Manhattan ≤ 2)` via `useMemo`
- `playerMemoryTags` → derived from `journalEntries` (type=conversation) via `useMemo`
- `completedNpcIds` → `Set<string>` of npcIds from conversation journal entries
- `questObjectiveIdx` → dynamically computed: first objective where requiresNpcInteraction/requiresArtifact is unmet
- "Journal" tray button toggles `LegacyDemoJournal` overlay; mutually exclusive with Satchel
- `handleLandmarkInspect` adds `{ type:'discovery' }` entries for map landmarks

## handleNpcOutcome outcome labelling rules (IMPORTANT)
The dialogue sends system flag strings as `outcome`. These must NOT appear verbatim in the journal:
- `outcome === "trait-gained"` → add trait-gain entry only; skip conversation entry
- `outcome === "memory-tagged"` + `memoryTag` → convert kebab tag to Title Case for the label
- `outcome === real narrative text` + `memoryTag` → use outcome text as label
- `outcome === real narrative text` + no `memoryTag` → auto-tag from first 32 chars; add conversation entry
**Why:** The NPC dialogue calls `onOutcome("trait-gained", tag, ...)` and `onOutcome("memory-tagged", tag)` as
internal signals. Terminal endings call `onOutcome(narrativeText, undefined, ...)`. All three paths now produce
meaningful journal entries.

## DemoJournalEntry type (src/components/legacy-demo-journal.tsx)
```typescript
interface DemoJournalEntry {
  type: "conversation" | "trait-gain" | "discovery";
  tag: string;
  label: string;
  source: string;       // NPC name or landmark source
  npcId?: string;       // NPC ID — enables quest objective matching
  timestamp: number;
}
```

## LegacyGameHud prop contract
```typescript
interface LegacyGameHudProps {
  phase: DemoPhase; season: DemoSeason; worldVersion: number; gameHour: number;
  skills: LifeSkill[];  // deriveLifeSkills()
  traits: Record<string, number>;
  activeQuest: QuestDefinition | null;
  questObjectiveIdx: number;  // computed dynamically, NOT hardcoded 0
  nearbyNpcs: Array<{ name: string; activity: string }>;
}
```

## NpcScheduleEntry position type
- Uses `col: number, row: number`
- DemoMapPosition uses `row: number, column: number` (note: `column` not `col`)
- Proximity: `Math.abs(row - mapPosition.row) + Math.abs(col - mapPosition.column) <= 2`

## NpcDefinition — Character Card V3 fields (added fbb02bc2)
- `openingLine?: string` — first_mes equivalent; opening line on first encounter
- `exampleDialogue?: string` — mes_example equivalent; tone/vocabulary reference  
- `systemPrompt?: string` — NPC behavioral identity for future AI generation
- `creatorNotes?: string` — internal design notes, not shown in-game
- `lorebook?: NpcLorebookEntry[]` — character_book equivalent; keyword-activated memory context

## NpcLorebookEntry — lorebook keyword activation
```typescript
interface NpcLorebookEntry {
  keys: string[];           // memory tags that activate this entry
  content: string;          // context surfaced when a key matches
  insertionOrder?: number;  // lower = higher priority (default 10)
  constant?: boolean;       // if true, always active regardless of keys
  unlocksDialogueIds?: string[];  // dialogue nodes that become available
}
```
Usage: `getActiveLorebook(npc, playerMemoryTags)` → `NpcLorebookEntry[]`

## DialogueOption — lorebook gate (added fbb02bc2)
- `requiresMemoryTag?: string` — option only shown if player holds this memory tag
- `filterAvailableOptions(options, traits, memoryTags)` now actually uses memoryTags
  (previously `_memoryTags` was a dead parameter — this was a bug, now fixed)
