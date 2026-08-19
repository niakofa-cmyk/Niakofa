---
name: Legacy scene interaction runtime
description: Rule for connecting authored map interaction points to the live Legacy activity pipeline.
---

Authored `LegacyMapScene.interactionPoints` must be resolved by the same
`evaluateInteraction` and `WorldMutation` pipeline used by fishing and other
world activities; scene metadata alone is not playable behavior.

**Why:** The Mensah Compound initially rendered all 19 locations but most
Space interactions were inert because the evaluator only knew the older
starter location registry.

**How to apply:** Pass the active scene into interaction evaluation, synthesize
an inline activity for each scene trigger, and keep dialogue, memory, quest,
and world-evolution outcomes as journal/state mutations rather than creating a
second interaction system.