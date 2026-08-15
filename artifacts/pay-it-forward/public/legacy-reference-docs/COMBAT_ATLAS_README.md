# Niakofa Legacy RPG — Combat Update + Kwame Atlas Integration

Two things in this pack, matching your two requests.

## 1. Real-time + aerial combat, documents updated

`docs/COMBAT_SYSTEM.md` — amends the `NIAKOFA_LEGACY_RPG_VISUAL_RUNTIME_BIBLE_v1`
you uploaded: combat moves from its old "P2 / deferred" status to P1, and the
Quality Bar now explicitly includes real-time action combat with aerial
capability. Includes a concrete LMBS → native-TypeScript mapping table (confirmed
against the actual 8-file `MOG_LMBS` plugin bundle's own parameters — dash,
guard, double jump, gravity, combo timing) and the full ground/aerial combat
design: light/heavy attacks, combo chaining, guard→parry timing window, dash
with i-frames, jump→double-jump, air dash, aerial juggle.

`scaffold/legacy-combat-fsm.ts` — a working `LegacyCombatController` class
implementing all of that, extending the `LegacyActorController` from the
previous rebuild pack. Same rule as before: **zero LMBS/RPG-Maker code**, a
from-scratch TypeScript state machine using LMBS only as a concept reference.

## 2. The Kwame 32-frame atlas — actually extracted and integration-mapped

Big update from last time: the atlas files you uploaded are **real, evenly
gridded, individually labeled animation frames** — not concept-board mockups
like the earlier uploads. That means they were genuinely sliceable, so I
sliced them.

`kwame-extracted-frames/` — 164 real transparent PNG frames auto-extracted
from 5 of the 11 atlas files (background removed via border-safe flood fill,
label column dropped), plus the other 6 files clearly flagged as needing a
manual regrid pass rather than shipped as guessed/likely-wrong slices. Read
`kwame-extracted-frames/README.md` first — it's honest about exactly what
worked, what didn't, and what's still missing (no down-facing frames at all
yet, no attack/jump/dash frames yet).

`docs/ATLAS_INTEGRATION_GUIDE.md` — the concrete step-by-step for wiring
these frames into `legacy-character-engine.ts`, the hand-drawn-only
enforcement gate from the last rebuild pack, and a real first playable scene
in `legacy-chapter.tsx` — plus how combat hooks up once attack/jump/dash art
exists.

## Still true from the last delivery, unchanged

- No GitHub write access in this session — this is inspection + ready-to-apply
  plan, not a live commit.
- The duplicate `niakofa-repo/` source tree bug from `BUGS_AND_FINDINGS.md`
  (previous pack) is still unfixed and still worth doing before this lands.
- I can't generate new production art (no image-gen tool here) — extraction
  and integration planning is the ceiling of what this session can do toward
  "more Kwame art."
