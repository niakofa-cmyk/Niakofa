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

### 2. Nia Supervisor Exit Code Masking
**File:** `scripts/start.sh`
**Issue:** `wait "$NIA_PID" 2>/dev/null || true` always returns 0, so `EXIT_CODE` was always 0. The supervisor could never detect a crash — every crash was recorded as a clean exit and nia-service was never restarted.
**Fix:** Replaced `|| true` with `set +e; wait ...; EXIT_CODE=$?; set -e` to capture the real exit status while preventing `set -e` from aborting the subshell on non-zero child exit.

### 3. GIT_COMMIT Not Embedded in Production Build
**File:** `railpack.json`
**Issue:** The `.dockerignore` excludes `.git` from the build context, so `git rev-parse HEAD` fails during the Railpack build and `GIT_COMMIT` falls back to "unknown" in production health checks.
**Fix:** Use `RAILWAY_GIT_COMMIT_SHA` (injected by Railway during builds) as the primary source, falling back to `git rev-parse HEAD` for local builds.

## Architecture Summary

- **Monorepo** with pnpm workspaces, 11 packages
- **Single Railway service** (`zesty-ambition`, domain `niakofa.com`)
- Both `api-server` and `nia-service` run inside the same container, supervised by `scripts/start.sh`
- `artifacts/api-server` — Express API + React frontend (Railpack builder)
- `artifacts/nia-service` — Nia AI service (port 3001, supervised restart loop)
- `artifacts/pay-it-forward` — React frontend SPA
- `artifacts/db` — Database migrations (Drizzle ORM)
- Railway healthcheck: `/api/healthz` (120s timeout, ON_FAILURE restart, max 3 retries)
