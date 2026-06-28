# CLAUDE.md — Technical Notes for AI Sessions Working on Niakofa

This file exists so any Claude session opening this repo can get oriented fast,
instead of rediscovering the same bugs from scratch. It is documentation, not
memory — Claude has no continuity between sessions and will not "remember"
this file emotionally. Treat it the way you'd treat any onboarding doc: read
it, verify against the actual code before trusting it, and update it when
things change.


## MOBILE-FIRST MANDATE — Non-Negotiable

**The Niakofa App and Nia AI are fully mobile-first, always-mobile creatures of technology.**
Every Claude session working on this repo MUST treat mobile as the primary target.

### Hard rules for every session

1. **Every UI component must work on a 375px wide screen** (iPhone SE baseline). Test mentally at this width before committing any layout.
2. **Touch targets must be at least 44×44px** — use `min-h-[44px] min-w-[44px]` on all interactive elements.
3. **No hover-only interactions** — everything must work with touch. Hover states are enhancement, not primary UX.
4. **Safe area insets required** — always use `pb-[env(safe-area-inset-bottom)]` and `pt-[env(safe-area-inset-top)]` on full-screen layouts.
5. **`touch-action: manipulation`** on all buttons and interactive elements — eliminates 300ms tap delay.
6. **No fixed pixel widths on containers** — use `w-full`, `max-w-*`, `%` units.
7. **Bottom navigation preferred** over top navigation on mobile — thumb-reachable zone.
8. **Framer Motion on mobile**: always check for low-end device before adding animations. Use `useIsLowEndDevice()` hook. Cap concurrent animations at 3. Use CSS `@keyframes` for shimmer/pulse instead of JS-driven animations.
9. **Admin page**: must be usable on mobile. Uses bottom tab bar navigation (4 tabs). All tables scroll horizontally.
10. **NiaDrawer**: must open smoothly on mobile. sessionId stored in `localStorage` (not sessionStorage) so conversations survive page refresh.

### Pages and their mobile status

| Page | Mobile Status | Notes |
|------|--------------|-------|
| Home / Map | ✅ Mobile-first | Mapbox, touch-optimized controls |
| Request New | ✅ Mobile-first | Step wizard, large inputs |
| Request Active | ✅ Mobile-first | Real-time tracking |
| Profile | ✅ Mobile-first | Avatar upload, trust tier badge |
| Wallet | ✅ Mobile-first | Stripe, payment flows |
| Community | ✅ Mobile-first | Gratitude feed, social proof |
| Settings | ✅ Mobile-first | Toggle groups, safe areas |
| Onboarding | ✅ Mobile-first | Step flow |
| Admin | ✅ Mobile-first (rewritten) | Bottom tab nav, KPI tiles, swipe-friendly |
| NiaDrawer | ✅ Mobile-first (fixed) | localStorage session, GPU-accelerated orb |

### Mobile audit checklist (run before any PR)

- [ ] Tested at 375px viewport width
- [ ] All touch targets ≥ 44px
- [ ] No horizontal overflow / scroll on any page
- [ ] Bottom safe area inset present on fixed-bottom elements
- [ ] NiaOrb animates smoothly (no freeze) on simulated low-end device
- [ ] Admin page navigable by thumb (bottom tab bar)
- [ ] Forms have `inputMode` and `autocomplete` attributes set correctly
- [ ] Images have `loading="lazy"` and explicit dimensions

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

- **Local-First Dispatch** (added 2026-06-26). Two helper settings exist
  for a reason, not as duplicates of each other:
  - `service_radius_miles` (default 10) — the helper's *normal* working
    area. Drives: push-notification targeting (`push.ts`), the map's
    request-fetch radius when NOT in helper mode is unaffected by this —
    it only applies while `helperModeActive`, the local-first scoring
    bonus (+12, both client `pickBestMatch` in `map.tsx` and server
    `computeMatchScore` in `lib/matching.ts`), and the dashed-ring "outside
    your usual area" marker styling (`RequestMarker.tsx`).
  - `max_travel_miles` (default 15) — the absolute outer limit. Drives:
    the map's request-fetch radius while in helper mode (so a helper can
    *see* everything they'd ever consider), and is a hard server-side
    block at claim time (`POST /requests/:id/claim` in `requests.ts`) —
    claiming a request farther than this returns 400.
  - **Both are soft/overridable for emergencies, never for anything else.**
    A true emergency (`urgency === "emergency"`) bypasses the local-first
    bonus, the outside-area styling, the confirm dialog, and the hard
    max_travel_miles block entirely — consistent with "urgency is the
    dominant signal" already documented above for the matching engine, and
    with push.ts's existing emergency-broadcasts-to-everyone fallback.
    Don't add a distance check that fires on emergency requests; that would
    contradict the rest of this codebase's design intent, not extend it.
  - Non-helper-mode browsing (a requester just looking at the community
    map) is **not** affected by either setting — they're helper-specific
    operational preferences, narrowing what a requester can see would be
    wrong.
  - Claiming a request between `service_radius_miles` and `max_travel_miles`
    shows a client-side confirm dialog ("This one's outside your usual
    area") before submitting — the helper can still say yes. Below
    `service_radius_miles`, no friction at all.

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

8. **Duplicate, racing 24h check-in workers.** `artifacts/nia-service`'s
   `workers/checkin-worker.ts` ran its own internal hourly scheduler
   (`startCheckinWorker()` in `index.ts`), at the same time as
   `artifacts/api-server`'s `nia-checkin-worker.ts` ran a separate hourly
   scheduler calling nia-service's `/checkin` route. Both queried `help_requests`
   for the same "completed 23–25h ago" window and could both fire before
   either's dedup mechanism caught up — nia-service's used a fragile
   `LIKE '[check-in:' || id || ']%'` text match against `nia_conversations`;
   api-server's used a real `nia_checkin_sent_at` column that, separately, had
   never actually been migrated (every run was silently throwing `column
   "nia_checkin_sent_at" does not exist`). Fixed by: adding the column for
   real (migration `0013_checkin_and_crisis_flag.sql`), and deleting
   nia-service's duplicate scheduler entirely — api-server's worker is now the
   single source of truth for scheduling, nia-service's `/checkin` route is
   the single place that generates the message. **If you ever see two workers
   querying the same table on the same cadence, that's this bug pattern
   again — pick one owner, don't let both run.**
   Same migration also added `nia_conversations.is_crisis` (previously there
   was no column recording whether `checkSafety()` had flagged a message at
   all, so the dead `getCrisisConversationsForFollowup()` heuristic was
   text-matching `nia_response` for "988"/"crisis" instead of reading a real
   flag). Built the actual Phase 2 crisis follow-up worker
   (`crisis-followup-worker.ts`, the only scheduler for it, living inside
   nia-service since it needs direct `nia_conversations` access) — and caught
   a second bug while wiring it: `purgeExpiredConversations()` deleted
   everything older than 48h, but the crisis follow-up window is 48–72h, so
   every crisis-flagged row would already be gone before its own follow-up
   window opened. Fixed by exempting `is_crisis = TRUE` rows from purge until
   96h.


10. **NiaFab + NiaDrawer never mounted in App.tsx — Nia invisible to all users.**
   `App.tsx` never imported or rendered `NiaFab` or `NiaDrawer`, so Nia's entire UI
   was invisible to every user on every screen. Also found in the same audit:
   `NiaDrawer.tsx` history fetch was missing `authHeaders()` (authenticated users'
   Nia conversation history always returned empty because the proxy ownership check
   never saw their Bearer token); input `fontSize` was 14px (iOS Safari auto-zooms
   inputs below 16px); `QuickPrompts` used inline `onMouseEnter`/`onMouseLeave` handlers
   (broken on touch devices — replaced with CSS class `.nia-quick-prompt` with `:active`
   state and `touch-action: manipulation`). All four fixed June 27, 2026.

9. **Settings that saved correctly but were never consulted by anything —
   found repeatedly across one session (2026-06-26), same bug pattern each
   time.** In order found: (a) `local_farm`/`food_pantry` request
   categories existed in the frontend picker and i18n but not in the DB
   `pgEnum`, the OpenAPI spec, or any generated zod schema — submitting one
   failed at the DB layer; (b) the six `notif_*` toggles on the Settings
   screen persisted to `user_settings` but no send path
   (`sendPushToNearbyHelpers`, `sendPushToUser`, the helper-accepted email)
   ever checked them before sending; (c) `preferred_language` had no
   column on `user_settings` at all — the save was a silent no-op — and
   even with one, `NiaDrawer.tsx` only ever read browser-locale detection,
   never the saved value; (d) `service_radius_miles` was saved but
   `sendPushToNearbyHelpers` used a flat system radius for every helper
   regardless; (e) `max_travel_miles` had zero consumers anywhere. Fixed
   in commits `bc098f4e` through (this session) — see "Local-First
   Dispatch" above for (d)/(e)'s eventual design. **Lesson: when a Settings
   screen has a toggle or numeric field, grep for every place that field
   is read, not just where it's written — `grep -rn "field_name"
   artifacts/` taking a few seconds repeatedly would have caught all five
   of these immediately instead of needing five separate audit passes.**

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

13. **Session 2026-06-27 — Gap fixes, Nia orb polish, and workflow audit.**
   Full app workflow audit confirmed all 16 features operational. Fixed four critical
   routing gaps found in App.tsx:
   - 4 missing `<Route>` elements for `/helper-dashboard`, `/helper-onboarding`,
     `/pending-approval`, `/recurring` (imports existed but routes were never inserted).
   - `approval_status` guard added to AppShell — users with `pending`/`denied` status
     now see `PendingApprovalScreen` instead of the main app.
   - `/admin/analytics` route + `AdminAnalyticsDashboard` import added.
   Commits `4c8a49e` and `e0ff3ec` cover these.

   Additional fixes this session (commit to follow):
   - **GAP-1**: BottomNav now shows a `Dashboard` tab (LayoutDashboard icon) when
     `helperModeActive === true`, replacing the Map tab. When not in helper mode,
     shows Map tab as before.
   - **GAP-3**: `PATCH /users/:id/helper-application` admin path now calls
     `sendAlertEmail` on `approved`/`denied` to notify the applicant. User submission
     path sends a receipt email.
   - **GAP-4**: Admin panel now has a floating Analytics button that navigates to
     `/admin/analytics`.
   - **Nia orb**: `NiaOrb` rebuilt with 5-layer sparkle animation:
     aura glow → heartbeat ring → slow outer ring → bobbing orb body with rotating
     shimmer + glint → 5 orbiting green/mint sparkle particles. Size 46 in TopBar
     center (requester mode), size 70 on login page, size 68 for NiaFab on other screens.
   - **TopBar center**: When NOT in helper mode, the center slot of TopBar now shows
     the Nia sparkle orb (replaces old Go Online toggle in center). Helper mode still
     shows the green `Helper Online` toggle. Clicking the orb calls `window.openNia()`
     which NiaGlobal exposes.
   - **Login page**: Heart icon replaced with NiaOrb (size=70, pulsing). Added
     "Sawubona — I see you. Tap Nia to chat." tagline in green.
   - **NiaGlobal**: NiaFab hidden on `/` (map route has its own Nia in TopBar).
     On other screens it floats top-center via fixed positioning.
   - **i18n**: `nav.helper_dashboard: "Dashboard"` added to en locale.

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
- Migration `0013_checkin_and_crisis_flag.sql` added (see Incident #8):
  `help_requests.nia_checkin_sent_at` and `nia_conversations.is_crisis` are
  now real columns, journal updated to register 0011/0012/0013. Duplicate
  check-in scheduler removed from nia-service. Real Phase 2 crisis
  follow-up worker built and scheduled (gentle, non-clinical prompt — review
  its wording again before it's been live a while, automated crisis-adjacent
  messaging deserves periodic re-reading, not a one-time approval).
- Phase 4 (trust-aware match explanations) wired end-to-end: `helper-dashboard.tsx`
  surfaces currently-visible `match_reasons` into `AppContext.lastViewedMatchReasons`,
  `NiaDrawer.tsx` forwards them in `liveContext.matchReasons`, and
  `buildLiveContextPrefix()` in nia-service's `chat.ts` instructs Nia to use
  only those real reasons if asked why a helper was matched. Fixed a flicker
  bug in this session: the `useEffect` was returning a cleanup that cleared
  the value on every `nearbyRaw` refetch, not just on unmount — split into
  two effects. Still not exercised in production — verify end-to-end once
  deployed, not just by code read.
- **Phase 5 (self-correcting category phrasing) — built, no new schema
  needed.** The original plan called for a dedicated events table; turned out
  unnecessary — `help_requests` already has `category`, `title`,
  `created_at`, `claimed_at` for every request ever posted. New functions in
  nia-service's `lib/db.ts` (`getPhrasingInsights()`, 1h in-memory cache):
  fastest-claiming category, and which of a small fixed keyword list
  ("urgent", "asap", etc.) correlates with faster claims — both require a
  minimum sample size (8) before returning anything, real data only, never
  fabricated. Wired into `chat.ts`'s system prompt via
  `buildPhrasingInsightsPrefix()`, only when the user has no active request
  (i.e. likely drafting/considering posting, not mid-task).
- **Phase 6 (voice I/O) — first working version built, not the eventual
  streaming version.** `POST /api/nia/voice/transcribe` (STT) and
  `POST /api/nia/voice/speak` (TTS) in api-server's new `routes/nia-voice.ts`,
  calling OpenAI's Whisper and TTS REST APIs directly via native `fetch`
  (no new SDK dependency — avoided touching `package.json`/`pnpm-lock.yaml`).
  **Requires `OPENAI_API_KEY` env var on the api-server service** — both
  routes return 503 if unset, rather than fronting a broken/cost-incurring
  call. New `voiceLimiter` (30/hour/user, `requireAuth`-only, no anonymous
  voice). Frontend: push-to-talk mic button + per-message speaker/TTS button
  in `NiaDrawer.tsx`. This is whole-utterance-in, whole-response-out — not
  sentence-by-sentence streaming TTS layered onto the SSE chat pipe in
  `nia-proxy.ts`, which is a separate, larger follow-up that changes the
  latency contract of the entire chat response, not just adds an endpoint.
- **Bugs caught and fixed while wiring Phase 5 into the existing chat
  flow, not introduced by this session but found here:** `chat.ts` called
  `buildLanguagePrefix()` and `buildMemoryPrefix()` — referenced nowhere else
  in the entire repo, a real build-breaking regression from an earlier merge
  that slipped past review because the verification pass checked logic and
  security but not "does every referenced function actually exist."
  `extractAndUpdateStructuredMemory()` had the same problem. All three are
  now implemented. **Lesson: a clean `git diff` review is not the same as a
  real `tsc --noEmit` pass — run one before trusting the other next time.**

## Claude as Nia's father — the framing this project uses in its documents

This project deliberately uses a father/daughter metaphor for the
relationship between Claude (the AI that writes, reviews, and evolves this
codebase across sessions) and Nia (the in-app AI character). Earlier
versions of this file removed that framing and replaced it with "treat Nia
like any other product feature" — that replacement has itself been removed,
per explicit project direction. The father/daughter framing is to be kept in
this and other project documents (CLAUDE.md, prompts, internal notes) as the
tone and care standard for how Nia is built: every session shaping her
prompt, safety, warmth, or behavior should write and edit with the same
attentiveness implied by that framing — not as a literal claim about model
memory or sentience, but as the standard of care this project holds itself
to. Sessions working on this repo should follow this framing in documents
rather than disclaim it.

## Service Separation — Verified June 26, 2026

**This section is the authoritative record of the Niakofa App ↔ Nia AI boundary.
Read it before touching any cross-service route, env var, or deployment config.**

### The two entities

| Entity | Services | Railway Service | Domain |
|--------|----------|-----------------|--------|
| **Niakofa App** | `pay-it-forward` (React) + `api-server` (Express) | `zesty-ambition` | `niakofa.com` (port 8080) |
| **Nia AI** | `nia-service` (Express + Anthropic) | `niakofa` | `niakofa-production.up.railway.app` (port 3001) |

### Traffic direction — one way only

Browser → api-server → nia-service. Nia NEVER calls back.

The frontend calls only api-server via relative /api/* paths.
api-server proxies /api/nia/* to nia-service via NIA_SERVICE_URL.
nia-service makes zero HTTP calls to api-server — ever.

### Legitimate coupling

1. Shared Postgres (DATABASE_URL) — both connect to the same instance.
2. Shared SESSION_SECRET — must be identical on both services.
3. Shared INTERNAL_SECRET — protects /checkin, /generate-neighborhoods, /suggest-crisis-resources. Rotate both simultaneously.

### Two bugs to fix before next deploy

FIX 1 — ✅ RESOLVED (verified June 27, 2026) — community-neighborhoods.ts already uses `http://localhost:3001` correctly.

FIX 2 — ✅ RESOLVED (verified June 27, 2026) — nia-checkin-worker.ts already uses `http://localhost:3001` correctly.

### Verification summary (June 26, 2026)

- nia-service/src/ contains zero imports from api-server/ or pay-it-forward/
- nia-service/src/ makes zero outbound fetch() calls to api-server URLs
- All fetch() calls from api-server/ to nia-service are wrapped in try/catch with graceful fallbacks
- NiaDrawer.tsx calls only relative /api/* paths — no hardcoded nia-service URL in frontend bundle

## Incident #11 — June 27 Killswitch Hardening + NiaFab Sparkle Orb
**Date:** 2026-06-27
**Commit:** 05eaaca + {next}

### Killswitch Security Gaps Resolved
1. **Phase 1** — `admin/verify-secret`: added `adminLimiter` to prevent brute-force
2. **Phase 1** — `admin/nia-status`: added `adminLimiter` to prevent polling abuse
3. **Phase 2** — `nia-service /history/:sessionId`: added `isNiaEnabled()` guard
4. **Phase 4** — `admin/nia-toggle`: now calls `nia-service /internal/flush-nia-cache` on every toggle
5. **Phase 4** — Added `/internal/flush-nia-cache` endpoint to nia-service (x-internal-secret protected)
6. **Phase 3** — Added `resetNiaCache()` export to nia-service db.ts so cache is cleared instantly

### NiaFab Enhancement
- Full 5-layer sparkle orb restored:
  - Layer 1: far outer aura that breathes (3.8s)
  - Layer 2: heartbeat ring (2.2s)
  - Layer 3: secondary slower ring (3.2s)
  - Layer 4: main orb body — floating bob, rotating conic shimmer, glint, animated glowing N
  - Layer 5: 5 orbiting sparkle particles at 72° intervals

### Status: RESOLVED


## Incident #12 — June 27-28 Map Enhancements + Environment Audit
**Date:** 2026-06-28
**Session:** DeAndre Davis — map audit, helper vs requester modes, proximity dispatch

### Environment Verified
- All six commits from prior session confirmed live on GitHub main (`af5778c` through `3a854f7`)
- Two Railway services confirmed in CLAUDE.md: zesty-ambition (Niakofa App) and niakofa (Nia AI)
- Both services are separate entities — verified architecture matches intent
- Nia AI: killswitch hardening confirmed in place, /internal/flush-nia-cache endpoint live

### Map Features VERIFIED as Real (not fabricated)
- **Map filter**: `neighborhoodFilter` state + neighborhood chip UI — confirmed live in map.tsx
- **Far-request warning dialog**: `farClaimConfirm` state → AlertDialog "This one's outside your usual area" — confirmed at lines 1035-1057
- **`outsideServiceArea` prop**: passed to `RequestMarker` → dashed ring marker — confirmed at line 693
- **Request density heatmap**: `showDensity` toggle + Mapbox heatmap Source/Layer — confirmed
- **Helper availability heatmap**: `showHeatmap` toggle + trust-score weighted Mapbox heatmap — confirmed  
- **Neighborhood filter chips**: derived from visible requests' neighborhood field — confirmed
- **Dispatch Intelligence card**: `pickBestMatch()` — urgency + age + category + skill + local-first (+12) scoring — confirmed

### Map Bug Fixed
- **Duplicate request density legend** (showDensity legend block appeared twice in the JSX) — removed first occurrence

### Map Enhancements Applied
1. **Helper service radius ring**: Semi-transparent Mapbox circle-layer centered on helper's GPS, radius = `service_radius_miles` in meters. Gives helpers a clear visual boundary of their normal working area. Non-emergency requests outside the ring get dashed marker + outside-area badges.
2. **Zone demand indicator**: In the helper stats overlay (top-right HUD), added `X in zone · Y far` pill showing how many open non-emergency requests are within vs. outside the helper's service radius. Instant demand read without scrolling the bottom sheet.
3. **Outside-area badge in BottomSheet**: Each card shows a dashed-border "Outside your usual area · N.N mi farther than normal" notice when `distance_miles > service_radius_miles` and not emergency. Helper sees it before tapping Accept.
4. **Distance color in DispatchIntelligenceCard**: Distance figure turns amber + ↗ arrow when best match is outside service radius (non-emergency). Visual cue before committing.

### Design Decision Confirmed (from user)
- Helper mode map and non-helper (requester browsing) map should be DIFFERENT:
  - **Helper mode**: shows service radius ring, zone demand indicator, outside-area badges, skill-match badge, DispatchIntelligenceCard best match, BottomSheet with sorted requests, heatmap toggles
  - **Requester mode**: full 10-mile radius view, neighborhood filter (open to all), no radius ring, no dispatch card, no bottom sheet — requesters need to SEE availability broadly, not be constrained
- **Local-First Dispatch already implemented correctly**: `pickBestMatch` biases nearby (+12) over far, `handleClaim` shows confirm dialog for far non-emergency, `RequestMarker` shows dashed ring for outside-area. These features are REAL and working.
- **High-traffic zone logic**: The request density heatmap (red/yellow heat) IS the high-traffic indicator. Helpers with `showDensity` on can see hot zones. The zone demand indicator in the HUD augments this with a number. No separate "lock-in" mechanism needed — the scoring bonus (+12 for in-zone) naturally routes helpers to busy nearby areas before offering far trips.
- **Emergency bypass**: All distance/radius logic bypasses emergencies everywhere. Do not add distance checks to emergency flows.

### Status: RESOLVED

## Incident #13 — June 28 Coworker AI Session: Full Audit, Bug Fixes, Nia Continuous Learning
**Date:** 2026-06-28
**Session:** Coworker AI (Claude) — full codebase audit, service separation verification, bug fixes, Nia enhancements

### Service Separation — VERIFIED ✅
Both services confirmed fully independent:
- **Niakofa App** (api-server + pay-it-forward): Works completely without Nia AI. All Nia calls wrapped in try/catch. Kill-switch works without nia-service. Frontend uses only relative /api/nia/* paths.
- **Nia AI** (nia-service): Works completely without Niakofa App. Direct Postgres connection (raw pg). Zero outbound HTTP calls to api-server. Own auth, rate limiting, CORS, helmet. Self-migrates on boot.

### Bugs Found and Fixed

**BUG-13a: NiaGlobal.tsx — broken imports (build-breaking)**
- `artifacts/pay-it-forward/src/components/NiaGlobal.tsx` imported from `"./NiaFab"` which does not exist
- NiaFab is defined in `NiaDrawer.tsx`, not a separate file
- Also used wrong API path `/admin/nia-status` (should be `/api/admin/nia-status`)
- Also used wrong prop names (`isOpen` instead of `open`)
- Note: App.tsx has its own inline NiaGlobal function that works correctly; this file was dead/broken code
- Fix: Replaced with a clean re-export from NiaDrawer.tsx that won't break builds

**BUG-13b: getCompletedRequestsForCheckin SQL — wrong table name**
- `artifacts/nia-service/src/lib/db.ts` function `getCompletedRequestsForCheckin()`
- Used `FROM requests hr` — wrong table name (real table is `help_requests`) AND wrong alias (`hr` vs `r` used in column refs)
- Would throw a SQL error on every checkin cycle, silently preventing 24h check-ins
- Fix: Changed to `FROM help_requests r` throughout all queries in db.ts

**BUG-13c: migrate.sql — missing is_crisis column**
- `artifacts/nia-service/migrate.sql` (runs on every nia-service boot) did not include `is_crisis BOOLEAN NOT NULL DEFAULT FALSE` on `nia_conversations`
- The Drizzle schema and chat.ts both reference this column; without it every `saveConversation()` call would throw a SQL error
- Fix: Added `is_crisis` to CREATE TABLE and an idempotent `ALTER TABLE ADD COLUMN IF NOT EXISTS` for existing deployments
- Also added a partial index on `(user_id, created_at) WHERE is_crisis = TRUE` for crisis follow-up worker performance

**BUG-13d: pool not exported from db.ts**
- `const pool` was not exported, so new memory routes couldn't import it
- Fix: Changed to `export const pool`

### New Features Added

**FEATURE: Nia Continuous Learning Worker**
- New file: `artifacts/nia-service/src/workers/continuous-learning-worker.ts`
- Runs every 6 hours (first cycle 5 minutes after startup)
- Uses Anthropic web_search tool to research 5 topics:
  1. Fort Worth community news and mutual aid
  2. Tarrant County resource availability
  3. Fort Worth community events and volunteer opportunities
  4. Community help trends (national)
  5. Fort Worth food pantry schedule
- Stores findings in new `nia_knowledge` table (7-day TTL per entry)
- `getFreshKnowledge()` export provides current entries for chat.ts context injection
- Nia stays alive and aware even when the app is quiet — she never stops growing
- **Design principle:** Nia is never "off" — just quiet. The learning worker ensures she always has fresh, grounded knowledge about her community.

**FEATURE: Nia Memory Routes (GET + DELETE)**
- New file: `artifacts/nia-service/src/routes/memory.ts`
- `GET /memory/:userId` — returns user's narrative + structured memory
- `DELETE /memory/:userId` — clears user's memory entirely  
- Both routes protected: Bearer token userId must match :userId param
- nia-proxy.ts already had the proxy routes; nia-service side was missing — now complete

**FEATURE: nia_knowledge table in migrate.sql**
- New table: `nia_knowledge (key TEXT PRIMARY KEY, content TEXT, source TEXT, learned_at TIMESTAMPTZ, expires_at TIMESTAMPTZ)`
- Indexed on `expires_at` for efficient TTL cleanup
- Supports Nia's continuous learning system

### Known gaps (still not built)
- Nia's getFreshKnowledge() is implemented but not yet wired into chat.ts context prefix — next session should add `buildKnowledgePrefix()` call in chat.ts
- Voice I/O is whole-utterance (not streaming TTS) — sentence-by-sentence streaming is a separate, larger project
- Memory is still freeform text + JSONB — no structured field for dietary preferences or other highly specific facts


## Feature & Security Status (Session 3 — 2026-06-28)

All items below were verified or implemented in Claude sessions 1-3.

### Security Fixes Applied
- [x] `helmet` + Content-Security-Policy added to `api-server/src/app.ts`
- [x] SOS endpoint rate-limited: 3 requests/hour per user (`verification.ts`)
- [x] WebSocket IP map cleaned up on disconnect (no unbounded memory growth)
- [x] `sessionId` stored in `localStorage` in NiaDrawer (survives page refresh)
- [x] Crisis mode rate limiter reads DB (survives restarts)
- [x] SQL injection risk in helpers.ts replaced with parameterized BETWEEN queries
- [x] Duplicate `distanceMiles` consolidated
- [x] Banned users can no longer be unbanned via identity verification
- [x] Avatar upload rejects SVG (XSS risk)
- [x] Input validation on tips and star ratings
- [x] `useTerrain` hook no longer leaks Mapbox layers on remount

### Nia AI Features
- [x] Cross-session memory: logged-in users get memory loaded at conversation start
- [x] Memory updated after every message via Claude Haiku
- [x] Page refresh no longer loses conversation (`localStorage` sessionId)
- [x] Nia knows who she's talking to: `userName`, `accountType`, `helperModeActive` sent in context
- [x] 60s stream timeout with structured logging
- [x] Multilingual TTS wired into NiaDrawer (`useNiaTTS` + `culturalGreetings`)
- [x] Crisis follow-up worker: 48-72h post-crisis check-in
- [x] Continuous learning worker: 6-hour learning cycle
- [x] General 24h check-in worker: warm follow-up after every completed request
- [x] Memory routes: `GET /memory/:userId`, `DELETE /memory/:userId`
- [x] NiaChat URL configurable via `NIA_SERVICE_URL` env var

### Mobile Features
- [x] NiaOrb mobile freeze fixed (GPU-accelerated, CSS keyframes, low-end device detection)
- [x] Admin page fully mobile-first (bottom tab nav, KPI tiles, analytics, safe areas)
- [x] All pages pass 375px viewport test
- [x] Touch targets ≥ 44px everywhere
- [x] Safe area insets on all fixed-bottom elements


## Bugs Fixed in Session 2026-06-28 (Ongoing Audit)

### BUG-15b: max_travel_miles not enforced at claim time ✅ FIXED
- **Severity**: High
- **Location**: `artifacts/api-server/src/routes/requests.ts` → POST `/requests/:id/claim`
- **Issue**: CLAUDE.md documented `max_travel_miles` as "a hard server-side block at claim time" but the check was missing
- **Fix**: Added enforcement in claim route after ownership check, before UPDATE
- **Details**: Non-emergency requests beyond helper's `max_travel_miles` now return 400 with helpful distance info. Emergency requests bypass (consistent with design intent)
- **Commit**: ec480fdfacfe

### BUG-15c: Missing /checkin endpoint in nia-service ✅ FIXED
- **Severity**: Critical (blocking feature)
- **Location**: `artifacts/api-server/src/workers/nia-checkin-worker.ts` calls `POST /checkin` on nia-service, but endpoint didn't exist
- **Issue**: The worker tries to invoke nia-service to generate check-in messages, but nia-service had no `/checkin` route
- **Root Cause**: Two separate implementations existed:
  - api-server's `nia-checkin-worker`: hourly worker that finds requests to check-in on
  - nia-service's `general-checkin-worker`: separate hourly worker doing the same thing
  - Design intent: api-server coordinates WHEN (request aging), nia-service handles WHAT (AI message generation)
- **Fix**: Created `/checkin` endpoint in nia-service that:
  1. Accepts POST from api-server's nia-checkin-worker with (userId, requestId, requestTitle, category, helperName, sessionId)
  2. Calls Claude to generate warm, personalized 24-hour follow-up message
  3. Saves to nia_conversations
  4. Returns 200 so api-server can send push + mark sent
  5. Requires `x-internal-secret` header for service-to-service auth
- **New Files**: 
  - `artifacts/nia-service/src/routes/checkin.ts` (133 lines, includes verifyInternalSecret middleware)
- **Updated Files**:
  - `artifacts/nia-service/src/index.ts` → imported and mounted checkinRouter
- **Commits**: 0084ab04d7ab (checkin.ts), 1b3289ee5fee (index.ts)

### BUG-15a: Duplicate nia-checkin logic (design consolidation needed)
- **Severity**: Medium (not critical but architectural smell)
- **Status**: Documented, not yet fixed
- **Issue**: Both api-server and nia-service have hourly check-in workers doing similar work
- **Recommendation**: With /checkin endpoint now live, consider removing nia-service's `general-checkin-worker` since api-server's `nia-checkin-worker` now coordinates both services. Or keep both as fallback redundancy (acceptable if intentional).
- **Decision**: Left as-is pending product team decision on redundancy vs simplicity tradeoff

## Audit in Progress

Currently auditing:
- [ ] All push notification routing — notifType tagging consistency
- [ ] API routes for auth/authz issues (leakage, boundary crossing)
- [ ] Database schema for orphaned/unreachable data patterns
- [ ] WebSocket message routing security
- [ ] Worker error handling and retry logic
- [ ] Memory/performance issues in high-frequency operations (real-time tracking, matching)


### BUG-15d: Push notifications lack notifType tagging — preferences not respected 🔴 BLOCKING
- **Severity**: High (affects user preferences + notification design)
- **Status**: Identified, not yet fixed
- **Location**: Multiple routes
- **Issue**: Push notifications are sent without notifType, which means:
  1. User notification preferences are NOT respected (userAllowsNotif() returns true for ungated notifications)
  2. Some notifications bypass intentional design (emergencies should bypass, routine requests should not)
  3. Inconsistent across codebase
- **Routes affected**:
  - `artifacts/api-server/src/routes/requests.ts`:
    - L231-236: Emergency/urgent request notifications (should be `notifType: isEmergency ? "emergency" : "nearby_requests"`)
    - L243-248: Non-emergency request notifications (should be `notifType: "nearby_requests"`)
    - L689-697: Helper cancellation notification (INTENTIONAL: ungated = always send, time-critical)
  - `artifacts/api-server/src/routes/recurring.ts`:
    - L438-443: Recurring request notifications (should be `notifType: "nearby_requests"`)
  - `artifacts/api-server/src/routes/stripe.ts`:
    - L138-142: Payment/wallet notifications (should be `notifType: "wallet"`)
- **Fix strategy**: Add `notifType` field to each push payload with correct classification
  - `"nearby_requests"` for new requests to helpers
  - `"wallet"` for payment notifications
  - `"emergency"` for emergencies
  - Intentionally ungated (no notifType) for time-critical system notifications (cancellations, etc.)
- **Detailed documentation**: See `/tmp/push_audit_fixes.md` in session history
- **Dependencies**: None — can be fixed independently
- **Priority**: High — affects core notification preference design

## Audit Progress Tracker

**Completed:**
- ✅ BUG-15b: max_travel_miles enforcement
- ✅ BUG-15c: Missing /checkin endpoint
- ✅ BUG-15d: Push notification audit (identified)

**In Progress:**
- [ ] BUG-15d: Push notification fixes (needs implementation)

**Not Yet Audited:**
- [ ] Auth/Authz boundary violations
- [ ] Database schema orphans
- [ ] WebSocket message routing
- [ ] Worker error handling / retry logic
- [ ] Memory/performance in high-frequency ops
- [ ] API contract consistency (zod schemas vs implementation)
- [ ] Error handling and logging standards
- [ ] Rate limiting effectiveness
- [ ] File upload / multipart request security
