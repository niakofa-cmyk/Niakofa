---
name: Legacy Demo State Rules
description: Idempotency contracts, trait validation, and storage sanitizer rules for the shared Legacy demo state engine.
---

# Legacy Demo State Engine — Durable Rules

## Idempotency contract (enforced as of Aug 2026)
Every mutation that awards `legacyPoints` MUST guard against duplicate calls:
- `unlockKitchenRecipe(id)` — no-op if recipe is already unlocked
- `advanceBusiness()` — no-op if `businessLevel >= 4`
- `revealMystery(id)` — no-op if mystery is already revealed; also sets `solved=true` when revealing
- `completeReunionDialogue(npcId)` — no-op if dialogue is already completed
- `completeDemoQuest(questId)` — already had idempotency guard; keep it

**Why:** Double-taps and React Strict Mode double-invocations were silently awarding double points.

## Trait validation
`chooseDemoTrait(state, trait, value)` only accepts traits in `KNOWN_TRAITS = ["Leadership", "Wisdom", "Courage", "Compassion"]`. Unknown trait strings return state unchanged.

**Why:** Arbitrary string keys were being written to the traits object, enabling injection of unlimited trait values.

## coopTasks storage sanitizer
`readDemoState` now matches saved coopTasks by `questId` (not by array index/length). A partial save (e.g. only 2 of 4 tasks saved) merges correctly instead of falling back to all-pending.

**Why:** The old guard `parsed.coopTasks.length === DEMO_COOP_QUEST_IDS.length` caused a full reset whenever localStorage had fewer entries than expected.

## Test journey pattern
To drive the demo through all 14 phases in tests, use `advanceDemo` for most phases and `chooseDemoTrait` only when you want to verify trait accumulation. The phase sequence has 9 hops from `chapter1` to `world-regen` — do NOT use 6 `chooseDemoTrait` calls expecting to reach `world-regen`.

## worldVersion increment trigger
`worldVersion` increments ONLY when advancing FROM `world-regen` AND all 4 artifacts are placed. Placing artifacts while at a later phase (e.g. `coop-quest`) does not retroactively trigger the increment.
