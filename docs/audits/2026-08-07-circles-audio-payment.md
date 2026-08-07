# Circles, Audio/Video, and Payment Audit — 2026-08-07

## Scope

This audit used the authenticated `origin/main` snapshot (`8268d8aa`) and cross-referenced:

- `.agents/memory/niakofa-circles-lifecycle.md`
- `.agents/memory/niakofa-audio-circles-feature.md`
- `.agents/memory/niakofa-audio-circles-testing.md`
- `attached_assets/Pasted-Assessed-scope-limitations-and-identified-feasible-vers_1786121574142.txt`

Real microphone, camera, and two-browser WebRTC calls cannot be exercised in this offline environment. The review covered the browser lifecycle/signaling code, REST/WS contracts, and offline regression tests.

## Findings addressed

### 1. Payment-intent approval gap — fixed

`POST /api/stripe/payment-intent` now runs `requireApproved` after authentication and before ownership, rate limiting, database reads, or Stripe calls. Suspended, banned, and unapproved users cannot create new charges.

### 2. Heartbeat speaker spoofing — fixed

`POST /api/audio-circle-sessions/:id/heartbeat` now validates `active_speaker_id` against active participants in that same session. Invalid IDs are ignored while the presence heartbeat still succeeds.

### 3. Stripe Connect stale status — made explicit

When live Stripe account retrieval fails, the endpoint still returns the last database state for UX continuity, but now includes:

```json
{
  "statusSource": "database",
  "statusStale": true
}
```

Successful live refreshes return `statusSource: "stripe"` and `statusStale: false`, so clients can distinguish a confirmed status from a cached fallback.

## Existing Circles safeguards verified

- `stopRecording()` waits for the asynchronous `MediaRecorder.onstop` final chunk.
- Disabling video stops tracks, removes them from the local stream, and replaces peer sender tracks with `null`; re-enable reacquires fresh media.
- Audio elements are removed when a remote stream gains video and when participants leave, preventing doubled audio.
- `circle_recording_available` is present in both frontend and server WS event unions.
- Authenticated unload cleanup uses keepalive `fetch`, not unauthenticated `sendBeacon`.
- Reconnect triggers room resynchronization.
- ICE candidates are queued until a remote description is available.
- Host grace-period failover promotes an active co-host before ending the room.

## Offline verification

| Check | Result |
|---|---|
| `pnpm install --frozen-lockfile` | Pass |
| `pnpm run typecheck` | Pass |
| API typecheck | Pass |
| Frontend typecheck | Pass |
| Circles/WebRTC API tests before changes | 65 passed |
| Circles/WebRTC + heartbeat + payment regressions | 69 passed |
| Frontend offline tests | 461 passed |
| Repository-wide lint | Existing baseline failure: 507 errors / 211 warnings outside this audit |

The repository-wide lint baseline is documented rather than masked; this audit did not make unrelated broad refactors.

## Reference assets

The maintained Legacy reference bundle remains:

- `docs/NIAKOFA_LEGACY_REFERENCE.md` — product/design/system index
- `NIAKOFA_LEGACY_SESSION_REF.md` — session decisions and asset provenance
- `docs/legacy-mode-design/reference-images/` — committed reference images
- `artifacts/pay-it-forward/public/niakofa-legacy-*.png` — live-demo reference assets

Uploaded assessment documents remain under `attached_assets/` as session evidence.