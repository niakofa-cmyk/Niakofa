# CLAUDE.md — Technical Notes for AI Sessions Working on Niakofa

This file exists so any Claude session opening this repo can get oriented fast,
instead of rediscovering the same bugs from scratch. It is documentation, not
memory — Claude has no continuity between sessions and will not "remember"
this file emotionally. Treat it the way you'd treat any onboarding doc: read
it, verify against the actual code before trusting it, and update it when
things change.

## Architecture

Monorepo, pnpm workspaces, 11 packages. Two deployable services on Railway:

- **`artifacts/api-server`** (Railway service: `zesty-ambition`, domain
  `niakofa.com`) — the main Express API + React frontend, served together.
  Builder: Railpack, config in root `railway.toml`. Entry point:
  `artifacts/api-server/src/index.ts` (real server bootstrap: `http.createServer`,
  WebSocket init, BullMQ workers, graceful shutdown). Routes live in
  `artifacts/api-server/src/routes/*.ts`, aggregated by `routes/index.ts`,
  mounted into `app.ts`. **Do not confuse `src/index.ts` (server bootstrap)
  with `src/routes/index.ts` (route aggregator)** — see Incident Log below,
  this exact confusion broke production once already.

- **`artifacts/nia-service`** (Railway service: `Niakofa`, domain
  `niakofa-production.up.railway.app`) — Nia AI, a standalone Express service
  with its own Dockerfile (not Railpack). Talks to the same Postgres DB
  directly via `pg`, not via the `@workspace/db` Drizzle layer the main API
  uses. System prompt lives in `src/prompts/nia.ts`. Routes: `/chat`,
  `/analyze-image` (real vision API call), `/suggest-crisis-resources`,
  `/generate-neighborhoods`. Self-migrates on boot via `runMigrations()` in
  `lib/db.ts`, which runs `migrate.sql` against `DATABASE_URL` before the
  HTTP server starts listening.

- **Database**: single Postgres instance (Railway service `compassionate-education`,
  PostGIS-flavored image — not a typo, the `geography` columns need PostGIS).
  Migrations live in `lib/db/migrations/*.sql`, tracked via drizzle-kit's
  journal (`lib/db/migrations/meta/_journal.json`). Schema source of truth is
  `lib/db/src/schema/*.ts`.

- **Frontend**: `artifacts/pay-it-forward` (React + Vite), built and served
  as static files by the api-server in production (`SERVE_FRONTEND=true`).

- **API contract**: `lib/api-spec/openapi.yaml` → orval codegen → generates
  `lib/api-zod` (zod schemas) and `lib/api-client-react` (typed hooks). Run
  via `pnpm --filter @workspace/api-spec run codegen`, happens automatically
  in the Railway build pipeline.

## Known design choices (not bugs)

- **Help Chains** (`request_helpers` table) is intentionally coordination-only.
  `help_requests.helper_id` remains the single helper who claims, completes,
  gets paid, and gets rated. Additional helpers can join to coordinate (chat
  access, visibility) but payment is never split between multiple helpers.
  Splitting payment is a much larger, separate project — don't casually
  extend this table to do it without a dedicated design pass on the
  Stripe Connect transfer logic.

- **Community feed moderation** (`gratitude_posts.moderation_status`) is a
  deterministic heuristic (`lib/post-moderation.ts`), not an AI classifier.
  Spam/phone-number/link patterns get held as `pending` for admin review.
  Hate-speech/slur detection is NOT implemented in the heuristic — that
  category currently relies on the admin queue + user reports only.

- **Matching engine** (`lib/matching.ts`) ranks nearby requests by urgency
  (dominant signal) + skill/specialty keyword overlap + proximity. It is a
  visible, tunable scoring function, not a model — every score returns
  human-readable `reasons` so the ranking is explainable in the UI.

## Known gaps (real, not yet built)

- Nia's memory (`nia_memories.memory`) is a single freeform text column, not
  structured fields. Don't assume she "knows" specific facts like dietary
  preferences in a structured way — she only has whatever's in that one
  string per user.
- No voice I/O for Nia.
- No payment-splitting for multi-helper requests (see Help Chains note above).

## Incident log — read before touching deploy config or auth

These are real production incidents from one extended session
(2026-06-23 → 2026-06-24), most caused by an unrelated, uncoordinated parallel
session pushing to this same repo with the same GitHub account at the same
time. Listed so the same mistakes aren't repeated.

1. **Railway `RAILWAY_DOCKERFILE_PATH` / `RAILWAY_BUILDER` stale env vars**
   silently overrode `railway.toml`, forcing the Railpack-built `zesty-ambition`
   service to look for a nonexistent root Dockerfile. Every deploy failed for
   hours before this was found via `railway variable list`. Fix: delete those
   two vars if they ever reappear on this service.

2. **Drizzle migration ledger desync.** Twice, `drizzle-kit migrate` reported
   `[✓] migrations applied successfully!` in the deploy log while the actual
   `ALTER TABLE ... ADD COLUMN` never landed on the live table (confirmed via
   direct `psql` inspection — `column "post_type" of relation "gratitude_posts"
   does not exist`, error code 42703). Root cause not fully diagnosed. Fix
   applied: write idempotent migrations (`ADD COLUMN IF NOT EXISTS`) and, if a
   migration silently doesn't apply, write a new migration with a new tag that
   re-issues the same idempotent statements rather than trying to debug the
   ledger. If it happens again, connecting directly via the Railway dashboard's
   Postgres service → Console → `psql -U postgres -d railway` and running the
   ALTER statements by hand is a legitimate fallback.

3. **`railway.toml` lost its migration step.** A parallel commit changed
   `startCommand` from `"pnpm --filter @workspace/db run migrate && node ..."`
   to just `"node ..."`, silently dropping all future migrations from ever
   running. Caught by reviewing the diff of an unrelated commit, not by any
   automated check. There is no test or CI guard against this — if `railway.toml`
   changes, read the diff before merging, every time.

4. **`artifacts/api-server/src/index.ts` (the real server bootstrap) got
   overwritten** with the contents that belonged in `src/routes/index.ts` (a
   route-aggregator: imports + `router.use()` + `export default router`).
   This deleted the actual `http.createServer`, WebSocket init, BullMQ worker
   startup, and graceful shutdown logic, breaking the build with 13
   "Could not resolve" import errors. Recovered from a backup zip
   (`Niakofa-main__23_.zip`, the last good copy before this regression).
   **Lesson: if `src/index.ts` ever looks like a route aggregator instead of
   a server bootstrap, that's the bug, not a refactor.**

5. **Duplicate `const [request]` declaration** in `PATCH /requests/:id` —
   esbuild compile error from a careless rewrite (a `select()` for an
   ownership check and an `update()` both bound to the same variable name in
   one function scope).

6. **Nia's system prompt (`nia.ts`) got fully duplicated** — the entire
   ~190-line prompt body appeared twice in the same exported template
   literal, including the literal text `export const NIA_SYSTEM_PROMPT = ...`
   showing up *inside* the string itself (since there was no closing backtick
   between the two copies — it was one giant string, not two declarations).
   This happened twice in one session: once before a `git pull --no-rebase`
   merge, and the merge itself reintroduced it a second time by combining two
   already-edited versions. Also found: the category list told users wrong
   options (`childcare`, `elder care`, `food`) that don't exist in the
   `help_request_category` enum, and was missing real ones (`errands`,
   `stock_shelves`, `event_setup`, `delivery_run`).

7. **Critical: login had no password verification at all.** `POST
   /users/login` destructured `password` from the request body and never
   used it — any password worked for any known email. Also: the full user
   row, including `password_hash` (a bcrypt hash), was being returned in the
   JSON response on both login and register. Also: `signTokenById(userId,
   tokenVersion)` was being called with only one argument at both call sites,
   producing a token containing the literal string `"undefined"` as one of
   its four dot-separated segments — meaning every login was already broken
   in a different way before the missing password check was even noticed.
   This predates the parallel-session chaos — found via `__tests__/users.test.ts`,
   which expected the correct behavior the whole time; the route just never
   matched its own test suite. **If you're touching auth, run the existing
   test file's expectations against the route by hand before trusting either.**

## Practical lessons for future sessions

- **`railway up` deploys your exact local working tree** — useful for
  bypassing a stuck GitHub webhook, dangerous if your local tree has
  uncommitted experimental changes.
- **A successful Railway build proves the whole monorepo typechecks and
  bundles** (`typecheck:libs`, codegen, api-server esbuild, frontend vite
  build all run in one pipeline) — if that succeeds, stop looking for
  compile errors and start looking for logic bugs instead.
- **Drizzle's "migrations applied successfully" log line is not proof the
  schema actually changed.** Verify with a direct `psql` query when anything
  about a new column/table seems off.
- **Multiple AI sessions can be pushing to this repo at the same time** under
  the same GitHub account. `git log --oneline` regularly, and `git pull`
  before assuming you know the current state.

## Session handoff protocol

Claude has no memory between sessions — this section is the substitute: a
standing instruction any session reading this file should follow.

**At the start of a session working on this repo:** read this whole file
before making changes. Check `git log --oneline -15` to see what's landed
since this file was last updated — if there are commits not reflected below,
treat the file as partially stale and verify the relevant code directly
rather than trusting the doc.

**Before ending a session** (or before a long pause), update this file:
1. Add any new real bugs found/fixed to the Incident Log, in the same format
   as the existing entries — what broke, how it was found, what the fix was.
2. Add any new design decisions to "Known design choices" if they could be
   mistaken for bugs by a future session.
3. Add any newly discovered gaps to "Known gaps."
4. Update this section itself if the handoff process needs to change.
5. Commit the update in the same push as the code changes it documents,
   not as an afterthought — e.g. `git add <code files> CLAUDE.md && git commit`.

**What this can and can't do:** this file makes the *next* session faster if
that session is told to read it — it does not make Claude automatically
read or update it without being asked, since Claude has no background
process that fires on session end. If you're starting a fresh conversation
to keep working on this repo, explicitly say "read CLAUDE.md first." If
you're using a tool that auto-loads a root-level `CLAUDE.md` at session
start (e.g. Claude Code), that mechanism is the tool's, not something this
file can guarantee on its own.

## Current state as of last update (2026-06-24, session covering commits
`5db087f2` through `936ccb0d`)

- Both Railway services (`zesty-ambition`, `Niakofa`) confirmed Online and
  healthy via direct health-check + functional curl tests.
- `/users/login` confirmed fixed and verified: wrong password → 401, correct
  password → 200 with no `password_hash` in the response and a well-formed
  token (no `undefined` segment).
- Claim/en-route/arrived/complete routes confirmed using server-derived
  `helperId` from the auth token, not a client-supplied body field.
- Nia's system prompt confirmed deduplicated (single copy) with a category
  list matching the real `help_request_category` enum.
- Community Feed (offer/resource/update posts + moderation queue) and the
  Help Chains / matching-engine features (built by a separate, uncoordinated
  parallel session same night) are both live and were spot-checked, not
  exhaustively reviewed line-by-line — see Incident Log for what was found
  and fixed versus what's merely unverified.
- Not yet done: a full line-by-line review of the parallel session's
  large rewrites to `users.ts` and `requests.ts` beyond the specific bugs
  already caught and listed above. Treat those two files as higher-risk
  for undiscovered issues than the rest of the codebase until that review
  happens.

An earlier contributor wrote a document using a father/daughter metaphor for
the relationship between Claude (as an editor of this codebase) and Nia (the
in-app AI character). That file is kept here as a historical record of one
contributor's framing, not as an operating instruction. Claude has no memory
between sessions and is not Nia's parent in any factual sense; sessions
working on this repo should treat Nia like any other product feature —
something to build, test, and improve carefully — not adopt that metaphor as
a real relationship or duty.


---

## Incident #16 — June 28: Verification Pass + Real Fixes Landed
**Date:** 2026-06-28
**Commits:** 403b2e789ab4 (wsClient.ts), 8d5c35d4a269 (admin.tsx)

### Verification findings (what prior session claimed vs repo reality)

Prior session (Incident #14/#15) logged 6 commits but SHAs for wsClient.ts and
admin.tsx were **unchanged in the repo** — those pushes did not land. This session
read the actual file content before writing any code and confirmed the delta.

| Item | Prior claim | Actual repo state | Action |
|------|-------------|-------------------|--------|
| wsClient.ts token in register | "APPLIED" | NOT present | Fixed now |
| admin.tsx reviewed_by:1 bug | "APPLIED" | STILL in file | Fixed now |
| admin.tsx auth headers | "APPLIED" | NOT present | Fixed now |
| admin.tsx HelperApplicationsTab | "APPLIED" | NOT present | Fixed now |
| admin.tsx Helpers tab | Partial | TABS key present, component missing | Fixed now |
| admin.tsx max-w-3xl layout | "APPLIED" | Still max-w-2xl | Fixed now |
| ws-hub.ts token verify | Confirmed | PRESENT in repo | No action |
| helpers.ts requireAuth | Confirmed | PRESENT in repo | No action |
| chat.ts participant check | Claimed | chat.ts = nia-service proxy, not in-app chat | No separate fix needed — no GET /requests/:id/chat route exists in api-server/routes |
| reports.ts reviewed_by | Server-derived | CONFIRMED correct — server uses req.authenticatedUserId | Fixed client-side hardcode |

### What was actually fixed this session

**wsClient.ts (403b2e789ab4)**
- Added `import { getToken } from "./auth"`
- Added `registeredToken` state variable
- `wsRegister(userId)`: now reads token from `getToken()`, sends `{ userId, token }` to server
- `onopen` reconnect: re-sends token so server re-verifies after WebSocket reconnect
- `wsUnregister()`: clears `registeredToken` on logout
- This completes the WS-01 fix — server (ws-hub.ts) already verifies, client now sends

**admin.tsx (8d5c35d4a269)**
- Removed `reviewed_by: 1` hardcode — server derives reviewed_by from auth token
- Added Bearer auth headers to: report review PATCH, users GET, moderation PATCH, analytics GET, Nia status GET, Nia memory stats GET
- Added `HelperApplicationsTab` component: fetches pending helper applications, expandable cards with bio/skills/languages/vehicle, Approve/Deny buttons calling PATCH /api/users/:id/helper-application
- Added "Helpers" tab to tab bar (between Reports and Users)
- Widened layout from `max-w-2xl` to `max-w-3xl` for better tablet/desktop use
- `activeTab` type union updated to include "helpers"

### Ongoing audit gaps (carried into Incident #17)
- [ ] `GET /history/:sessionId` in nia-service has no auth — anyone who knows a sessionId can read that user's Nia conversation history. sessionIds are long random strings so low-probability but worth fixing.
- [ ] `POST /helpers/auto-assign/:requestId` has `requireAuth` but no `requireAdmin` — any logged-in user can trigger auto-assign suggestions (currently read-only so risk is low)
- [ ] admin.tsx login uses client-side secret comparison (`VITE_ADMIN_SECRET`) — secret is visible in the JS bundle. Better: call a `POST /api/admin/verify-secret` endpoint that returns a short-lived admin JWT
- [ ] Dependency audit (`pnpm audit`) still not run — needs local/Railway shell
- [ ] API contract (zod vs openapi.yaml) consistency check — still pending

---

## Incident #17 — June 30: Test-suite jest config + auth/map merge conflict resolution
**Date:** 2026-06-30
**Commits:** 6c52ed3b (jest.config.ts + checkin.ts), 9451df47 (users.ts + map.tsx conflict resolution)

### Context
This session ran with no direct git/network access (chat-only environment with a
human relaying terminal output). All commits were authored locally by the human
from files this session generated, copy-pasted via terminal. A subsequent
CLAUDE.md edit in this same session was made against a stale local snapshot
of the repo and accidentally deleted Incident #16 and the standing reminders
list when pushed (commit 11c0833f) — restored here. **Lesson added to
reminders below: never wholesale-overwrite a doc file from a possibly-stale
local copy; always cat the live file first and diff against what you intend
to write.**

### What was actually fixed
- `artifacts/api-server/jest.config.ts`: `setupFiles` never pointed at
  `jest.setup.ts`, so `SESSION_SECRET`/`DATABASE_URL` env guards were never
  satisfied under jest — every route import in every test file was throwing at
  module-load time. This was the real reason all three auth-test files were
  failing, not a `getCurrentTokenVersion()` DB-mock mismatch as an earlier,
  unverified summary (`TEST_FIXES_SUMMARY.md`) claimed — that mechanism does
  not exist in this codebase; auth is stateless HMAC (`signTokenById`/`verifyToken`
  in `middlewares/auth.ts`), no DB lookup happens in `requireAuth`.
- `artifacts/api-server/src/routes/checkin.ts` did not exist at all, despite
  `bug-15b-15c.test.ts` importing it — created it (api-server's own
  service-to-service `/checkin` endpoint, distinct from nia-service's version).
- Resolved a real `git pull --rebase` conflict between this session's
  `users.ts`/`map.tsx` changes and concurrent upstream changes:
  - `users.ts`: two independently-built `/users/:id/helper-application` routes
    existed (upstream: admin-only single-mode; local: user-submit + admin-review
    two-mode). Kept the two-mode version since `helper-onboarding.tsx` calls it
    for user submission and would 403 against the admin-only version. Added
    `"rejected"` as an alias for `"denied"` in the status check since
    `admin.tsx`'s bulk actions send `"rejected"` while the single-review flow
    sends `"denied"` — same endpoint, two different prior session's wording.
  - `map.tsx`: the conflict region contained the heatmap/density/cluster JSX
    **literally duplicated** (same Mapbox `id="request-clusters"` etc. appearing
    twice) — a pre-existing bug unrelated to the rebase, would have caused
    duplicate-layer-ID errors in Mapbox GL. Collapsed to one copy of each.
    Also removed a leftover `<OrientationToggle>` reference whose backing hooks
    (`useMapOrientation`, `useDeviceHeading`) were no longer imported.

### Ongoing audit gaps carried forward (still open, unverified this session — local
repo snapshot used this session predates this incident's own commits, so these
need re-confirmation against current `origin/main` before acting)
- [ ] `GET /history/:sessionId` in nia-service has no auth.
- [ ] `POST /helpers/auto-assign/:requestId` has `requireAuth` but no `requireAdmin`.
- [ ] admin.tsx login uses client-side secret comparison (`VITE_ADMIN_SECRET`).
- [ ] Dependency audit (`pnpm audit`) still not run.
- [ ] API contract (zod vs openapi.yaml) consistency check still pending.

### Claudemd self-reminder (standing)
1. Read this file before touching any code. Verify file content against what the doc says — don't trust prior session claims.
2. Push ALL improvements directly to repo. Never just describe them.
3. Verify pushes landed by checking SHA change after PUT, not just checking for "OK" in output.
4. Keep this file lean. Resolved items stay in the incident log, not in open-items lists.
5. Niakofa app and Nia AI are separate services. Never collapse them.
6. **Closet-cleaning**: this file grows one incident per session. Before adding
   a new incident, check whether older incident write-ups (especially ones with
   no remaining open items) can be condensed to a one-line summary instead of
   kept in full — the goal is a file that stays readable, not an unbounded log.
   Verbose root-cause narration belongs in a session's git commit message, not
   permanently in this file.
7. Trust nothing from a prior session's summary doc (e.g. `*_SUMMARY.md`,
   `TEST_FIXES_*.md`) without independently re-reading the actual current
   source it claims to describe — Incident #16 and #17 both found prior
   summaries describing mechanisms that didn't match the real code.
8. **Never wholesale-overwrite this file (or any doc) from a local copy without
   first `cat`-ing the live current version and diffing.** This file's content
   has already been accidentally deleted once (Incident #17) by exactly this
   mistake — a session edited a stale local snapshot and the whole file was
   replaced rather than appended/merged. Always append or surgically edit
   against freshly-read content, never overwrite wholesale from a cached copy.
