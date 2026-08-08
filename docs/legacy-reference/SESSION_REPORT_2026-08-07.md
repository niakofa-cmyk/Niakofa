# Niakofa Legacy Reference — Session Archive

> Keep until session is declared complete.
> This file preserves the record of reference assets, audit documents, and
> session reports for the Niakofa project across sessions.

---

## Session Date: August 7–8, 2026

## Reference Documents in Repository

| File | Location | Purpose |
|------|----------|---------|
| `NIAKOFA_LEGACY_SESSION_REF.md` | Root | Session decisions, asset provenance, API contract verification |
| `docs/NIAKOFA_LEGACY_REFERENCE.md` | docs/ | Product/design/system index, component map, feature status |
| `docs/audits/2026-08-07-circles-audio-payment.md` | docs/audits/ | Circles audio/video and payment flow audit results |
| `docs/legacy-mode-design/ARCHITECTURE.md` | docs/legacy-mode-design/ | Legacy mode architecture specification |
| `docs/legacy-mode-design/LEGACY-DESIGN-REFERENCE.md` | docs/legacy-mode-design/ | Design reference for the Living Family RPG experience |
| `docs/legacy-mode-design/README.md` | docs/legacy-mode-design/ | Legacy mode design overview |
| `docs/reference-images/DIASPORA_REFERENCE.md` | docs/reference-images/ | Diaspora platform reference images index |
| `docs/family-vault-legacy-engine-spec.md` | docs/ | Family vault legacy engine specification |
| `docs/diaspora-platform-design.md` | docs/ | Diaspora platform design document |
| `docs/diaspora-ui-reference.md` | docs/ | Diaspora UI reference |
| `docs/LETTER_TO_NIA.md` | docs/ | Letter to Nia |

## Reference Images

| Asset | Live Path | Use |
|------|-----------|-----|
| Legacy panel overview | `artifacts/pay-it-forward/public/niakofa-legacy-live-demo.png` | House of Mensah live-demo visual |
| Family tree reference | `artifacts/pay-it-forward/public/niakofa-legacy-family-tree-reference.png` | Family Tree / world reference |
| RPG screens reference | `artifacts/pay-it-forward/public/niakofa-legacy-rpg-reference.png` | Onboarding and chapter reference |
| Cinematic background | `artifacts/pay-it-forward/public/legacy-living-family-reference.png` | Baobab tree sunset scene |
| Design reference images | `docs/legacy-mode-design/reference-images/` | Committed reference images |

## Session Report — August 7, 2026

### Scope
- Verified archived code and offline tests
- Cross-referenced agent memory files for Circles, audio, and payment flows
- Audited browser lifecycle/signaling code, REST/WS contracts, and offline regression tests

### Issues Found and Fixed

1. **Payment-intent approval gap** — `POST /api/stripe/payment-intent` now runs `requireApproved` after authentication and before ownership, rate limiting, database reads, or Stripe calls. Suspended, banned, and unapproved users cannot create new charges.

2. **Heartbeat speaker spoofing** — `POST /api/audio-circle-sessions/:id/heartbeat` now validates `active_speaker_id` against active participants in that same session. Invalid IDs are ignored while the presence heartbeat still succeeds.

3. **Stripe Connect stale status** — When live Stripe account retrieval fails, the endpoint returns last database state with `statusSource: "database"` and `statusStale: true`. Successful live refreshes return `statusSource: "stripe"` and `statusStale: false`.

### Circles Safeguards Verified
- `stopRecording()` waits for the asynchronous `MediaRecorder.onstop` final chunk
- Disabling video stops tracks, removes them from the local stream, and replaces peer sender tracks with `null`; re-enable reacquires fresh media
- Audio elements are removed when a remote stream gains video and when participants leave
- `circle_recording_available` is present in both frontend and server WS event unions
- Authenticated unload cleanup uses keepalive `fetch`, not unauthenticated `sendBeacon`
- Reconnect triggers room resynchronization
- ICE candidates are queued until a remote description is available
- Host grace-period failover promotes an active co-host before ending the room

### Offline Verification Results

| Check | Result |
|---|---|
| `pnpm install --frozen-lockfile` | Pass |
| `pnpm run typecheck` | Pass |
| API typecheck | Pass |
| Frontend typecheck | Pass |
| Circles/WebRTC API tests before changes | 65 passed |
| Circles/WebRTC + heartbeat + payment regressions | 69 passed |
| Frontend offline tests | 461 passed |
| Repository-wide lint | Existing baseline: 507 errors / 211 warnings |

### Limitations
- Real microphone, camera, and two-browser WebRTC calls cannot be exercised in offline environment
- Live GitHub/Railway access was not available during this audit session

## Fixes Applied This Session (August 8, 2026)

### 1. Deploy Verification CI — Missing checkout step
**File:** `.github/workflows/deploy-verify.yml`
**Issue:** The workflow ran `node scripts/src/verify-legacy-demo-deployment.mjs` but never checked out the repository, so the script file didn't exist on the GitHub Actions runner.
**Fix:** Added `actions/checkout@v4` and `actions/setup-node@v4` steps. Also added bounded retries (6 attempts, 10s apart) to the legacy demo asset-graph verification step for Railway rollout convergence.
**Commit:** `a6ae90b2`

### 2. Nia Supervisor Exit Code Masking
**File:** `scripts/start.sh`
**Issue:** `wait "$NIA_PID" 2>/dev/null || true` always returns 0, so `EXIT_CODE` was always 0. The supervisor could never detect a crash — every crash was recorded as a clean exit and nia-service was never restarted.
**Fix:** Replaced `|| true` with `set +e; wait ...; EXIT_CODE=$?; set -e` to capture the real exit status while preventing `set -e` from aborting the subshell on non-zero child exit. Also moved nia-service spawn inside the supervisor subshell so `wait` operates on a direct child PID.
**Commit:** `47f3df91`

### 3. GIT_COMMIT Not Embedded in Production Build
**File:** `railpack.json`
**Issue:** The `.dockerignore` excludes `.git` from the build context, so `git rev-parse HEAD` fails during the Railpack build and `GIT_COMMIT` falls back to "unknown" in production health checks.
**Fix:** Use `RAILWAY_GIT_COMMIT_SHA` (injected by Railway during builds) as the primary source, falling back to `git rev-parse HEAD` for local builds.
**Commit:** `061497d3`
**Verified in production:** `/api/healthz` now reports the correct commit SHA.

### 4. Nia Service Missing /health Endpoint
**File:** `artifacts/nia-service/src/index.ts`
**Issue:** The api-server health route probes `http://localhost:3001/health` to determine Nia availability, but nia-service never exposed a `/health` route. Every probe got a 404, so `/api/health` always reported `nia_service: unavailable` and returned HTTP 503. This was the root cause of the persistent "degraded" health status on production.
**Fix:** Added a simple JSON `/health` endpoint that returns `{ status: "ok", service: "nia-service" }` before the route mounts.
**Commit:** `3ce911d3`

### 5. Nia Service Dockerfile Node Version Mismatch
**File:** `Dockerfile.nia-service`
**Issue:** The root `package.json` requires Node >=22 and the Railpack build uses Node 22, but the standalone nia-service Dockerfile still used `node:20-alpine`. This could cause runtime behavior differences if the Dockerfile is used instead of Railpack.
**Fix:** Updated both builder and runtime stages from `node:20-alpine` to `node:22-alpine` for consistency.
**Commit:** `7d9f274b`

### 6. Legacy Session Reference Archive
**File:** `docs/legacy-reference/SESSION_REPORT_2026-08-07.md`
**Issue:** No centralized reference file preserving session reports, audit findings, and reference asset catalog across sessions.
**Fix:** Created comprehensive session archive documenting all reference documents, images, audit results, and fixes applied across both sessions.
**Commit:** `eb229597`

### 7. Nia Service Health Probe Timeout During Startup
**File:** `artifacts/nia-service/src/index.ts`
**Issue:** `await runMigrations()` blocked `app.listen()` — nia-service didn't start listening until all migration SQL statements completed. The api-server health probe has a 2-second timeout, so if migrations took longer than 2s, nia-service appeared "unavailable" during startup even though it was still initializing normally. This was the remaining root cause of the persistent 503 on `/api/health`.
**Fix:** Call `app.listen()` first, then run migrations in the background (`.then()/.catch()`). Migrations are already non-fatal and only create optional tables (nia_knowledge, push_notification_queue, nia_cost_log) — core chat works without them, so background execution is safe.
**Commit:** `d9eb0333`

## Production Verification (August 8, 2026)

| Endpoint | HTTP Status | Notes |
|----------|-------------|-------|
| `/` (landing) | 200 | HTML served correctly |
| `/api/healthz` | 200 | DB connected, commit SHA embedded, circuit breaker closed |
| `/api/status` | 200 | Operational — database, nia_ai (disabled), map all ok |
| `/api/health` | 503 → 200 | Was 503 due to missing /health endpoint + startup blocking. Fixed in commits `3ce911d3` + `d9eb0333`. Will return 200 after Railway redeploys. |
| `/legacy/demo` | 200 | Legacy demo SPA loads correctly |

## Architecture Summary

- **Monorepo** with pnpm workspaces, 11 packages
- **Single Railway service** (`zesty-ambition`, domain `niakofa.com`)
- Both `api-server` and `nia-service` run inside the same container, supervised by `scripts/start.sh`
- `artifacts/api-server` — Express API + React frontend (Railpack builder)
- `artifacts/nia-service` — Nia AI service (port 3001, supervised restart loop)
- `artifacts/pay-it-forward` — React frontend SPA
- `artifacts/db` — Database migrations (Drizzle ORM)
- Railway healthcheck: `/api/healthz` (120s timeout, ON_FAILURE restart, max 3 retries)

## All Commits This Session

| SHA | Message |
|-----|---------|
| `a6ae90b2` | fix(ci): add missing checkout step and retry logic to deploy verification |
| `47f3df91` | fix(start.sh): capture actual nia-service exit code instead of masking with \|\| true |
| `061497d3` | fix(railpack): use RAILWAY_GIT_COMMIT_SHA for GIT_COMMIT when git is unavailable |
| `eb229597` | docs: add Niakofa Legacy session reference archive |
| `3ce911d3` | fix(nia-service): add /health endpoint so api-server health probe succeeds |
| `7d9f274b` | fix(dockerfile): update nia-service Dockerfile from Node 20 to Node 22 |
| `f9b66dc3` | docs: update session report with all August 8 fixes and production verification |
| `d9eb0333` | fix(nia-service): start listening before migrations so health probe succeeds during startup |

## Remaining Items

- [ ] Embed the actual uploaded PNG images (panel, bg, logo) to `public/` once available on disk
- [ ] Repository-wide lint baseline (507 errors) — documented, not addressed this session
- [x] `/api/health` will return 200 after Railway redeploys with the nia-service `/health` endpoint fix — fixed in commits `3ce911d3` + `d9eb0333`
- [x] Nia service supervisor crash detection — fixed in commit `47f3df91`
- [x] GIT_COMMIT embedding in production — fixed in commit `061497d3`, verified live
- [x] Deploy Verification CI — fixed in commit `a6ae90b2`
- [x] Nia service Dockerfile Node version — fixed in commit `7d9f274b`
