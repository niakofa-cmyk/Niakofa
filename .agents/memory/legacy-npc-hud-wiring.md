---
name: Legacy NPC + HUD wiring
description: How the NPC system, Game HUD, and NPC dialogue are wired into the demo; key prop contracts and state location.
---

## What was built

- **LegacyNpcSystem** (`src/lib/legacy-npc-system.ts`): 4 NPCs with daily schedules on the 9×6 tile map. `getPhaseNpcs(phase, hour)` returns `{ npc, col, row, activity }[]`. `advanceGameHour(h)` cycles 6→20.
- **LegacyQuestSystem** (`src/lib/legacy-quest-system.ts`): 5 quest definitions; not yet wired to HUD `activeQuest` (currently `null` — next step).
- **LegacyGameHud** (`src/components/legacy-game-hud.tsx`): RPG overlay (`pointer-events-none absolute inset-x-0 top-0 z-20`). Needs `relative` parent. `deriveLifeSkills(traits, npcInteractionCount, questsCompleted, artifactsPlaced)` → `LifeSkills`.
- **LegacyNpcDialogue** (`src/components/legacy-npc-dialogue.tsx`): Fixed bottom-sheet `(fixed inset-x-0 bottom-0 z-50)`. `onOutcome(outcome, memoryTag?, discoversId?, traitGain?)`.

## State wiring (legacy-demo.tsx)

- `gameHour` — `useState(8)`, local (not persisted). Advances on every `handleMapMove` call via `advanceGameHour(h)`.
- `activeNpcId` — `useState<string | null>(null)`. Set by `handleNpcInteract(npcId)`, cleared by `handleNpcDialogueClose()`.
- `npcInteractionCount` — `useState(0)`. Incremented by every `handleNpcOutcome()` call.
- Trait gains from dialogue → `setState(prev => { traits = {...prev.traits, [trait]: prev+delta}; persist({...prev, traits}); })`.

## NPC rendering (legacy-living-world.tsx)

- `LegacyLivingWorld` has `gameHour?: number` and `onNpcInteract?: (npcId: string) => void` props — passes through to `HouseOfMensahMap`.
- `HouseOfMensahMap` computes `phaseNpcs = getPhaseNpcs(phase, gameHour)` and renders emoji avatar buttons in the tile grid at `z-[8]`, above echoes but below player.

## Known gaps (next steps)

1. `activeQuest` is hardcoded `null` in HUD — wire `LegacyQuestSystem` to show and track active quests.
2. `nearbyNpcs` is `[]` — compute proximity from `phaseNpcs` vs `state.mapPosition`.
3. `playerMemoryTags` is `[]` — wire to `state.npcMemory` for NPCs to reference past choices.
4. `npcInteractionCount` and `questsCompleted` are not persisted — add to `DemoState` if persistent skill tracking matters.

**Why:** gameHour is local (not persisted) because it resets naturally; the schedule loop is idempotent. Don't add it to DemoState without a reason.
