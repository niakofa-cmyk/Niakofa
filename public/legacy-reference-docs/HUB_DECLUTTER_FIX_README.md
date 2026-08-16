# Niakofa Legacy RPG — Hub Declutter Fix

Source: https://github.com/niakofa-cmyk/Niakofa (public repo)
Base commit verified against: `3a5829be351d8a13423d1138f86a821a8fdbe0c3`
Status: implemented, tested, verified — **not pushed** (see bottom).

## Scope note

Per instruction, this pass covered the Legacy RPG game specifically, not the
rest of the app, except where they share code (`legacy-start-visual.tsx` is
only used by `legacy-home.tsx`, confirmed — no cross-app impact).

## What was actually wrong, confirmed by reading the code

The repo already contains a document diagnosing the "doesn't play like a
real RPG" problem: `.agents/legacy-reference-docs/ROOT_CAUSE_TWO_GAMES.md`
(written by a prior agent pass). A commit landed **the same day**, before
this session started, that fixed part of it (made the chapter world persist
under scene overlays instead of being replaced by them, added weather, added
world map pins). I verified that fix is real and working — 628/628 tests
passing on the commit before I touched anything.

What I found and fixed is a different, more visible part of the same
"doesn't feel like a game" problem: the pre-game hub screen
(`legacy-home.tsx`) rendered `LegacyStartVisual`, which had:

1. A clean, correct hero section — "Continue Your Journey" (primary),
   "Start New Journey" (secondary), "Play Demo · House of Mensah" (outline).
   This part was already right.
2. Immediately below it: a **4-button "Mode selector grid"** (Legacy Mode /
   Exploration / Family Quests / Reunion) and a **6-icon "Bottom icon nav
   row"** (Inventory / Journal / Map / Family / Quests / Settings) — 10 extra
   buttons in a settings-menu layout, sitting directly between the real CTAs
   and the world-summary card below.
3. Then, at the very bottom, a **second, duplicate "Continue Journey" /
   "Begin Journey" button** — functionally identical to #1's primary CTA.

So a player pressing into Legacy mode saw: real CTA → 10-button settings
grid → world summary → a second copy of the same CTA. That's the literal,
visual, confirmed source of "a million settings on the Live Game runtime."

## The fix

- Removed the 10-button mode-selector grid and bottom icon nav entirely,
  with a code comment explaining why and pointing to
  `ROOT_CAUSE_TWO_GAMES.md` for where these destinations actually belong
  (in-world overlays during a live session — already true for Journal + Map
  in `legacy-chapter.tsx`, and Reunion inside `legacy-demo.tsx`).
- Removed the duplicate second CTA button.
- Removed all now-dead code this left behind: 4 unused SVG icon components
  (`MODE_ICON_LEGACY` etc.), unused `lucide-react` imports (`Users`,
  `Package`, `BookOpen`, `Map`, `ClipboardList`, `Settings`, `Play`,
  `ChevronRight`), and 10 now-unused props/callbacks removed from
  `LegacyStartVisualProps` and both call sites in `legacy-home.tsx`.
- Did **not** touch the underlying routes/pages those buttons pointed to
  (`/legacy/challenges`, `/legacy/achievements`, etc.) — they still exist
  and still work if reached another way. This fix only removes the
  redundant pre-game navigation grid that was creating the "settings
  screen" impression; it doesn't delete functionality.

## On Family Vault

Investigated specifically since it was named directly. It's legitimately
separate from the game session, not a bug: `family-vault.tsx` is a real
oral-history recording tool (audio, transcript editing) that feeds recorded
memories into Legacy's procedural quest generation via a
`fetch('/api/legacy/reservoir/.../invalidate')` call — recording audio
genuinely needs a dedicated full-screen UI. It already links back to
`/legacy` via a "Legacy Journey Banner." Not changed.

## On the pasted asset-pipeline document

Checked directly against the repo rather than assuming: the document is
already saved in the repo, nearly verbatim, as
`.agents/legacy-reference-docs/ASSET_PIPELINE_ANALYSIS.md`, and most of
what it asks for is **already implemented**, not just planned:

- Weather system (`legacy-weather-overlay.tsx`) — rain/fog/dust/golden,
  mapped to chapter/season, landed the same day as this session.
- Niakofa-specific stats in the game HUD — Storytelling, Farming,
  Leadership, Negotiation, Cultural Wisdom (`legacy-game-hud.tsx`) — not
  generic HP/MP/XP, and more specific than the document's own suggested
  HEALTH/KNOWLEDGE/COURAGE renaming.
- Living Baobab (`legacy-living-baobab.tsx`) — a real, working,
  branch-per-family-member interactive component, not a placeholder.
- Cinematic dialogue treatment (`legacy-cinematic-dialogue.tsx`) already
  exists, referenced by the document itself.

**What I could not do:** import the actual third-party asset packs the
document describes (Grass ~502MB, Ground ~433MB, Tree Bark ~289MB, Retro
Tree Pack ~21MB, Styloo packs, etc.). No files were uploaded to this
session — only the text description/analysis document — and there's no
tool available to me that fetches arbitrary large third-party binary
archives from the web. If those packs exist somewhere specific (a URL, or
files you can upload directly), that would need to happen in a follow-up
session with the actual files present.

## Verdict on "Recreate, Reasonable, or Remove Legacy Mode"

**Keep and continue improving — do not remove.** The real walkable engine
(`LegacyLivingWorld`) works, weather/skills/dialogue systems are genuinely
built (not stubs), and the specific problem investigated here was a fixable
UI/navigation bug, not evidence of a broken foundation.

## Still open, for awareness (not fixed in this pass)

- The stale duplicate source tree `niakofa-repo/artifacts/` — flagged by
  `ROOT_CAUSE_TWO_GAMES.md` itself ("Never edit niakofa-repo/artifacts"),
  and flagged in two earlier sessions of this conversation. Still present,
  still unaddressed. Worth a deliberate decision to delete it — 1,351
  tracked files, a real structural change I didn't want to bundle into an
  unrelated fix without your sign-off.
- Per `ROOT_CAUSE_TWO_GAMES.md`'s own table, `/legacy/challenges`,
  `/legacy/achievements`, `/legacy/ai-director`, `/legacy/mysteries`,
  `/legacy/characters`, `/legacy/world-evolution`, `/legacy/seasonal-events`
  are still separate full pages, marked "in-world overlay (future)" by the
  project's own docs. Not reachable mid-session currently (confirmed —
  `legacy-chapter.tsx` doesn't reference them at all), so they don't
  interrupt gameplay, but they also aren't part of the living world yet.
  Converting these to overlays is real, valuable follow-up work, each one
  roughly comparable in size to this session's fix.

## Verification performed

- `pnpm run typecheck` (the real script, builds `lib/*` project references
  first): clean, 0 errors.
- `eslint` on both changed files: 0 errors, 0 new warnings.
- `pnpm run test` in `pay-it-forward`: **628/628 passing** (matches the
  baseline from the commit immediately before this fix — nothing broken).
- Patch verified to apply cleanly against a **fresh clone** of current
  `origin/main` at commit `3a5829b`, checked moments before this delivery.

## What's in this package

- `01-hub-declutter-fix.patch` — git diff of the fix. Apply from a fresh
  clone with `git apply 01-hub-declutter-fix.patch`.
- `changed-files/` — the 2 modified files in full, at their real paths.

## Why this isn't pushed

Same reason as every prior delivery this session: the repo's own
`.agents/memory/niakofa-github-sync-boundary.md` requires the supported
GitHub connection for writes and explicitly disallows a token pasted into
chat, and no GitHub connector is available in this session.

```bash
git clone https://github.com/niakofa-cmyk/Niakofa.git
cd Niakofa
git apply /path/to/01-hub-declutter-fix.patch
git add -A
git commit -m "fix(legacy): remove redundant pre-game settings grid and duplicate CTA from hub"
git push origin main
git pull origin main   # confirm local == remote
```
