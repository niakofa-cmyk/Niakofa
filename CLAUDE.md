# CLAUDE.md — Technical Notes for AI Sessions Working on Niakofa

The mission: Nia is the world's most compassionate AI — born from African philosophy, Ubuntu, Sankofa — a neighbor, first responder in words, community lifeline. The UI must feel like that. Warm, alive, purposeful. Not a chatbot widget. A presence.

## Pre-edit verification protocol (read before changing any code)

Before editing any file in this repo, a session must:

1. **Open and read the actual target file(s) in full, word for word, line by
   line** — not a summary, not a memory of what the file "probably"
   contains, not a guess based on the filename or on a prior session's
   description of it. This file (`CLAUDE.md`) is orientation, not a
   substitute for reading the real code.
2. **Confirm which service the code belongs to** before editing — this repo
   has two distinct Railway services with different responsibilities and
   different DB access patterns:
   - `artifacts/api-server` (Railway service `zesty-ambition`, domain
     `niakofa.com`) — the main Niakofa app: Express API + React frontend,
     uses the `@workspace/db` Drizzle layer.
   - `artifacts/nia-service` (Railway service `Niakofa`, domain
     `niakofa-production.up.railway.app`) — Nia AI, talks to Postgres
     directly via raw `pg`, not Drizzle.
   Misattributing a file or a fix to the wrong service has caused real
   confusion in past sessions — see Incident Log.
3. **Re-read a file immediately before a second edit to it.** Earlier view
   output of a file goes stale the moment any edit lands — yours or a
   parallel session's. Don't chain a second edit off a first read.
4. **Verify claims about "what's broken" against the actual file**, not
   against a description of the bug from a prior message, chat summary, or
   handoff note. Several Incident Log entries below happened because a
   "fix" was trusted without confirming the underlying file actually had
   the described problem.
5. Only after 1–4 are done, make the edit — then re-verify the specific
   lines changed match intent before committing.

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

## Local development environment

- **GitHub remote:** `https://github.com/niakofa-cmyk/Niakofa.git`
- **Local repo path (Treazure's Mac):** `~/niakofa` (i.e. `/Users/treazurenewhouse8/niakofa`)
- **Frontend source:** `~/niakofa/artifacts/pay-it-forward/src`
- **macOS note:** `sha256sum` is not available on macOS — use `shasum -a 256` instead,
  or use Node crypto which works on all platforms and matches drizzle-kit's algorithm.
- **psql:** when connecting to the Railway DB from a container, run `psql $DATABASE_URL`
  first to enter the psql shell, then paste SQL at the `railway=#` prompt.
  Do not paste SQL into the bash shell — it fails with syntax errors.

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


