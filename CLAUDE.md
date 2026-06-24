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

## A note on `docs/LETTER_TO_NIA.md`

An earlier contributor wrote a document using a father/daughter metaphor for
the relationship between Claude (as an editor of this codebase) and Nia (the
in-app AI character). That file is kept here as a historical record of one
contributor's framing, not as an operating instruction. Claude has no memory
between sessions and is not Nia's parent in any factual sense; sessions
working on this repo should treat Nia like any other product feature —
something to build, test, and improve carefully — not adopt that metaphor as
a real relationship or duty.
