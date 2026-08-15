---
name: Legacy NPC + HUD wiring
description: Prop contracts, state location, wiring status for NPC dialogue and game HUD in legacy-demo.tsx
---

## State location (legacy-demo.tsx)
- `gameHour` — local `useState(8)`, advanced by `advanceGameHour()` on each `handleMapMove`
- `activeNpcId` — local `useState<string | null>(null)`
- `npcInteractionCount` — local `useState(0)`, incremented in `handleNpcOutcome`
- `journalOpen` — local `useState(false)`, toggles Memory Journal overlay
- `journalEntries: DemoJournalEntry[]` — local `useState([])`, appended in `handleNpcOutcome`

These are NOT persisted to DemoState; they reset naturally each session.

## Wired as of commit 7167e4cd (Aug 2026)
- `activeQuest` → `getAvailableQuests(state.phase, []).at(0) ?? null` via `useMemo`
- `nearbyNpcs` → `getPhaseNpcs(state.phase, gameHour).filter(Manhattan ≤ 2)` via `useMemo`
- `playerMemoryTags` → derived from `journalEntries` (type=conversation), via `useMemo`
- `handleNpcOutcome` records `{ type:"conversation", tag, label: outcome, source: npcName }` into `journalEntries` (deduped by tag)
- "Journal" tray button toggles `LegacyDemoJournal` overlay; mutually exclusive with Satchel

## LegacyDemoJournal (`src/components/legacy-demo-journal.tsx`)
Props: `entries`, `traits`, `phase`, `onClose`
Sections: Life Skills bars · Available Quests · Memory Log · Discoveries

## LegacyGameHud prop contract
```typescript
interface LegacyGameHudProps {
  phase: DemoPhase; season: DemoSeason; worldVersion: number; gameHour: number;
  skills: LifeSkill[];  // deriveLifeSkills()
  traits: Record<string, number>;
  activeQuest: QuestDefinition | null;
  questObjectiveIdx: number;
  nearbyNpcs: Array<{ name: string; activity: string }>;
}
```

## LegacyNpcDialogue prop contract
```typescript
interface LegacyNpcDialogueProps {
  npc: NpcDefinition; season: DemoSeason; traits: Record<string, number>;
  playerMemoryTags: string[]; onClose: () => void;
  onOutcome: (outcome: string, memoryTag?: string, discoversId?: string, traitGain?: { trait: string; value: number }) => void;
}
```

## NpcScheduleEntry position type
- Uses `col: number, row: number` (not `column`)
- DemoMapPosition uses `row: number, column: number` (note: `column` not `col`)
- Proximity: `Math.abs(row - mapPosition.row) + Math.abs(col - mapPosition.column) <= 2`
