# Kwame Mensah Atlas — Source Notes

## What this is

330 individual PNG frames under `atlas/`, auto-extracted from the 10
reference/QA sheets in the uploaded "Kwame Mensah 32-frame hand-drawn atlas"
package, plus a manifest (`src/lib/kwame-sprite-atlas.ts`) wiring them into
47 named animation clips (idle/walk/run/hurt/interact/inspect/pick-up/talk,
all 4 directions and several diagonal variants).

## What this is NOT

These are **not** the final slice-ready production atlas the Visual +
Runtime Bible / Canonical Spec calls for. The source sheets are QA/reference
proofs — each one literally has caption text ("idle-right-1", etc.) and grid
border lines baked into the pixels, and the grid layout is **not consistent
across files** (column counts of 4, 6, 7, 8, or 9 depending on file, despite
every filename saying "32-Frame").

## How extraction worked

For each source sheet: detect the actual grid (column/row boundaries) by
scanning for uniform-gray border lines, crop each cell with an inset to
avoid the border, strip the top caption-text band, trim to the alpha
bounding box (removing transparent padding), then re-paste onto a
standardized 256×256 transparent canvas with the character's baseline
aligned to Y=224 and centered at X=128 — matching the Canonical Spec's
Character Master Sheet Format exactly, so these frames drop into the same
convention true production art will eventually use.

Two files (the base idle/walk sheet and the RIGHT/UP direction sheets) also
have a dedicated row-label column to their left (e.g. "IDLE-RIGHT" as a
banner, separate from the per-frame captions) — this was handled with a
manually-verified column offset per file rather than the generic detector,
after the generic pass initially mis-extracted them as label-text-only
frames. Verified visually afterward with a contact-sheet review.

## Known limitations, honestly

- Some frames retain a thin residual gridline fragment or a sliver of
  adjacent caption text — inherent to extracting from flattened, bordered
  reference art rather than clean per-frame layers. Cosmetic, not
  functional; worth a quick manual touch-up pass before shipping to
  production.
- Frame counts vary by clip (4–9 frames) because the source sheets
  themselves weren't consistent, despite the "32-Frame" filenames. See
  `kwame-sprite-atlas.ts` for the exact count per clip.
- `talk-*`, `run-*` clips have overlapping/duplicate-looking labels between
  files (e.g. both the base TALK file and the TALK DOWN LEFT file define a
  `talk-down`-ish row) — kept as separate clip names (`talk-down` vs.
  `talk-down-alt`) rather than silently merging them, since I can't verify
  which is the "correct" one without art-direction input.
- `run-down-left` sheet only had 3 usable rows detected (run-down, run-left,
  run-down-left) instead of 4 — likely a 4th row exists in the source but
  wasn't cleanly detected; not fabricated to fill the gap.

## Combat frames

None exist. No attack, dodge, guard, or jump-specific art was in the
uploaded package. `kwame-sprite-atlas.ts` names all 36 combat clip slots
(`KWAME_PENDING_ART_CLIPS`) so the runtime and sprite player already know
what to expect, but `KwameHeroSprite.tsx` renders a labeled placeholder box
for any of them until real frames exist. See the Canonical Spec's new
"Canonical Animation Set (Combat)" table for the exact commissioning spec —
same 256×256/baseline-Y=224/centered-X=128 contract as everything else here.

## If better source art arrives

Replace files under `atlas/` and regenerate `kwame-sprite-atlas.ts`'s frame
lists — every other module (`legacy-combat-system.ts`, `KwameHeroSprite.tsx`)
only depends on the manifest's shape (`Partial<Record<KwameClipName,
string[]>>`), not on these specific files, so nothing else needs to change.
