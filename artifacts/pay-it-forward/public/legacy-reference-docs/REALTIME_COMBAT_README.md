# Niakofa Legacy — Real-Time Combat System + Kwame Mensah Atlas

Source: https://github.com/niakofa-cmyk/Niakofa (public repo)
Base commit verified against: `66555466280ea6c0a1cb44cdde89d982cc11803a`
Status: implemented, tested, verified — **not pushed** (see bottom).

## Scope note

Per instruction, this covers the app plus the Legacy game's combat system —
not the rest of the Legacy game. Where the two interact (shared
`tsconfig`/test suite in `artifacts/pay-it-forward`), verification covered
the whole package to make sure nothing broke.

## What you asked for, and what's actually here

1. **"Change documents to allow real-time combat"** — done. The Canonical
   Spec doc (`public/NIAKOFA_CANONICAL_SPEC.md`) previously listed combat as
   an "eventual"/deferred item with no detail. It now has a full
   "Canonical Animation Set (Combat)" spec table and a "Real-Time & Aerial
   Combat — System Design" section explaining exactly how it works.
2. **"Give characters real-time combat and aerial combat"** — done. See
   `legacy-combat-system.ts` below.
3. **"Add the limbs as a real-time action combat system"** — done, read as
   a limb-based hit system (named hitboxes per limb, not one whole-body
   box). Flag me if "lmbs" meant something else.
4. **"How do we implement the Kwame Mensah atlas into the game and demo"**
   — the atlas is extracted, wired into a manifest, rendered by a real
   component, and there's a working interactive demo (shown inline in
   chat during this session — see note below on what it actually included).

## New files

- `src/lib/legacy-combat-system.ts` — the combat state machine. Pure
  TypeScript, no rendering/DOM dependency, so it can be unit tested and
  plugged into any future game loop.
- `src/lib/__tests__/legacy-combat-system.test.ts` — 24 tests, all passing.
  Also registered in `package.json`'s `test` script so `pnpm run test`
  picks it up automatically going forward.
- `src/lib/kwame-sprite-atlas.ts` — manifest wiring 47 real extracted
  animation clips + 36 named-but-pending combat clip slots.
- `src/components/KwameHeroSprite.tsx` — frame-stepping React renderer for
  Kwame specifically (distinct from the generator library's 48px NPC
  sprite system — Kwame is hand-finished canonical art at a different
  scale, per the Bible's own distinction).
- `public/legacy-character-assets/kwame-mensah/` — 330 extracted PNG
  frames + `ATLAS_SOURCE_NOTES.md` documenting exactly how they were
  extracted and their known limitations, honestly.

## Modified files

- `public/NIAKOFA_CANONICAL_SPEC.md` — new combat sections (see above).
- `src/pages/request-active.tsx`, `src/pages/request-track.tsx` — two bug
  fixes from earlier in this session (stale safety-check-in interval;
  map auto-zoom missing longitude). Included here because they were still
  uncommitted; see prior conversation turns for detail if you only want
  the combat/atlas work — they're independent and safe to apply or skip.
- `package.json` — registers the new test file.

## The atlas: what's real, what's not

I did not treat the 10 uploaded PNGs as if they were ready to ship. They're
QA/reference proof sheets — confirmed by pixel analysis (inconsistent grids:
4, 6, 7, 8, or 9 columns depending on file, despite every filename saying
"32-Frame") and confirmed by the production spec's own wording, which calls
itself *"source-art contract for the **slice-ready** runtime atlas"* — i.e.
the real slice-ready atlas doesn't exist yet; these are what an artist
should work from to produce it.

I extracted them anyway, as a demo-quality stand-in: detected each file's
actual grid, stripped baked-in captions and borders, trimmed to alpha
bounding box, and re-centered every frame on the documented baseline
(Y=224, X=128 in a 256×256 cell) so they already match the convention true
production art will use. Full details, including two extraction bugs I
caught and fixed via visual contact-sheet review (a mis-detected label
column that briefly turned the first frame of 2 files into pure caption
text), are in `ATLAS_SOURCE_NOTES.md`.

**No combat frames exist in the art** — no attack, dodge, guard, or jump
poses were in the uploaded package. I did not fabricate any. They're named
in the manifest (`KWAME_PENDING_ART_CLIPS`) and `KwameHeroSprite.tsx`
renders a clearly-labeled placeholder box for any of them until real frames
exist. The Canonical Spec's new combat table is the exact commissioning
spec for whoever draws them next.

## The interactive demo

I built and ran a real, playable demo inline in this chat — real Kwame
sprite art, live keyboard input, real gravity/jump physics, and real
limb-based hit resolution (a guard blocks a ground attack but not an aerial
one, matching the design doc). To keep the in-chat payload small, the final
version I actually sent embedded only a single idle frame rather than the
full walk/run/hurt animation set — so what rendered moved and fought
correctly, just held one static pose instead of animating through a walk
cycle. The real code (`legacy-combat-system.ts` + `KwameHeroSprite.tsx` +
the full `kwame-sprite-atlas.ts` manifest) does not have that limitation —
that trim only applied to the disposable chat preview, not to anything in
this package.

## Verification performed

- `pnpm run typecheck` (the real script — builds `lib/*` project references
  first via `tsc --build`, then typechecks every package): clean, 0 errors,
  run from a fully cold build cache.
- `pnpm run test` in `pay-it-forward`: **545/545 passing** (521 pre-existing
  + 24 new combat tests).
- Found and fixed one real bug via testing, not just added tests around
  existing behavior: the `invulnerable` flag (used for dodge i-frames) was
  computed from the combatant's *pre-transition* action instead of the
  resulting one, so it was always one frame stale. Test caught it, fixed
  in the module, re-verified.
- Patch verified to apply cleanly against a **fresh clone** of current
  `origin/main` at commit `6655546`, checked moments before this delivery.

## Design decisions worth knowing about

- **Guard blocks ground attacks, not aerial ones, and not leg sweeps.**
  Deliberate, not an oversight — documented in the Canonical Spec. Gives
  aerial combat and low attacks a real tactical reason to exist instead of
  guard being a universal "safe" button.
- **Dodge grants full invulnerability for its duration** rather than
  directional blocking — a timing-based counter, distinct from guard.
- **Light attacks are fast and cancelable; heavy attacks are slow with more
  commitment and more reward** (higher damage/knockback) — encoded once
  per action in `GROUND_ACTIONS`/`AERIAL_ACTIONS`, not scattered across
  callbacks, so tuning combat feel later means editing numbers in one
  place.
- **No real-time game loop exists yet anywhere in the codebase** — confirmed
  by reading `legacy-core-loop.tsx` (a narrative toast component, not
  physics) and the Bible's own "What Is Still Missing" list, which names
  "Real playable runtime" first. This combat system is built ready to plug
  into one; it doesn't pretend one exists.

## Why this isn't pushed

Same reason as every other delivery this session: the repo's own
`.agents/memory/niakofa-github-sync-boundary.md` requires the supported
GitHub connection for writes and explicitly disallows a token pasted into
chat, and no GitHub connector is available in this session.

```bash
git clone https://github.com/niakofa-cmyk/Niakofa.git
cd Niakofa
git apply /path/to/01-fixes-and-docs.patch
cp -r /path/to/new-files/* artifacts/pay-it-forward/
git add -A
git commit -m "feat(legacy): real-time + aerial combat system, limb-based hit resolution, Kwame Mensah atlas integration"
git push origin main
git pull origin main   # confirm local == remote
```
