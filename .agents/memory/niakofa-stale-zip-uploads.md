---
name: Niakofa stale zip uploads
description: Attached "fix" zips can be full old repo snapshots, not targeted patches — verify direction before applying.
---

Users sometimes attach zips named like "Niakofa-main-<feature>-fix.zip" that are
**entire repo snapshots** (including their own nested `attached_assets/` full of
older uploads), not minimal diffs. Diffing the zip against the current repo
(excluding `attached_assets`, `node_modules`, `.git`) surfaces many changed
files, but most of that diff is just staleness — the snapshot was taken before
later unrelated work landed, not an intentional fix.

**Why:** Applying such a diff wholesale reintroduces regressions. Concrete
example: a `brazil-hubs` zip's `globe.tsx`/`useNiaStory.ts`/`voiceWakeWord.ts`
diffs looked like real changes but were actually reverting `attributionControl`,
`detectVoiceLocale()`, and `navigator.language` wake-word fixes that already
existed in the current, newer codebase.

**How to apply:** For every changed file in the diff, read both sides and
confirm which direction is newer/correct before copying anything over. Only
apply the specific files that match the described bug fix (cross-reference
against the accompanying text description of what was fixed). Genuinely new
files (e.g. a new migration, a new generated type) are safe to copy directly.
