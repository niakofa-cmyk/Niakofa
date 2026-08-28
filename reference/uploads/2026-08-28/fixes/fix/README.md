# Niakofa Circles — targeted fixes

Verified against the live `niakofa-cmyk/Niakofa` repo (cloned and checked, not
just the write-up). Three real, narrow bugs — no rewrite, no new realtime
media system. Apply with:

```
cd Niakofa
git apply niakofa-circles-fixes.patch
```

## 1. Unit test didn't test the real failure path
`circleRealtimeSessionManager.test.ts` faked a camera permission failure with
`throw new Error("camera permission denied")`. `classifyMediaError()` only
recognizes browser `DOMException`s by `.name` (`NotAllowedError`, etc.), so a
plain `Error` always fell through to the `"unknown"` bucket — the test was
passing while asserting the *wrong* classification. Fixed to throw
`new DOMException("Permission denied", "NotAllowedError")`, matching what
`getUserMedia` actually rejects with, and updated the assertion to
`permission_denied`. The already-correct LiveKit integration test was the
reference here.

## 2. `setVideoEnabled()` silently swallowed camera failures
```ts
setVideoEnabled(enabled: boolean): void {
  if (enabled) void this.enableCamera().catch(() => {});
  ...
}
```
`enableCamera()` does classify the error and fire `onMediaError`, but the
method itself returned `void` and ate the rejection — so any caller that
awaits or checks the return value of `setVideoEnabled()` had no way to know
it failed. Changed to:
```ts
async setVideoEnabled(enabled: boolean):
  Promise<{ ok: true } | { ok: false; code: MediaReadinessCode; message: string }>
```
Same side-effect callback still fires; now the call site also gets a typed
result it can render directly, e.g.:
```ts
const result = await session.setVideoEnabled(true);
if (!result.ok) showCameraError(result.code, result.message);
```

## 3. Media-token failures were one generic `Error`
`fetchMediaToken()` already retried `429`/`5xx` with backoff and honored
`Retry-After` — that part was solid. But once retries were exhausted, or for
a non-retryable status, it threw a plain `Error` with only a string message.
The API can return `401` (session expired), `403` (removed from the Circle),
`404` (Circle ended), `409` (state changed), on top of `429`/`5xx` — and
those need different UI treatment (re-auth vs. "you're no longer in this
Circle" vs. "Circle ended" vs. back off). Added `MediaTokenError` (extends
`Error`, so nothing that already does `catch (error)` breaks) carrying a
`code: MediaTokenErrorCode`, the HTTP `status`, and `retryAfterSeconds`:

```ts
try {
  await session.start();
} catch (error) {
  if (error instanceof MediaTokenError) {
    switch (error.code) {
      case "reauthenticate": /* send to login */ break;
      case "not_authorized": /* "you're no longer allowed in this Circle" */ break;
      case "session_ended": /* "this Circle has ended" */ break;
      case "rate_limited": /* longer backoff, use error.retryAfterSeconds */ break;
      case "server_error": /* generic infra-recovery message */ break;
    }
  }
}
```

## What this does *not* change
- LiveKit stays the media transport. Correct call, matches how Zoom/Meet/
  Discord are built: SFU + STUN/TURN + short-lived server-minted JWTs, media
  plane separate from your control plane (REST/WS for membership, chat,
  moderation, presence).
- No caching added to the live media path. Cache Circle metadata, not video.
- The Redis-backed, user-scoped rate limiter is unchanged — it's already the
  right shape (see notes below).

## On the two recurring ops items (not code bugs, config/verification)

**"LiveKit is not configured on this environment" (503)** — the route
already checks for `LIVEKIT_URL` / `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET`
and fails closed with a 503 instead of minting a broken token, which is the
right behavior. Set those three on the API service in Railway and redeploy;
until then no camera/mic session can go live regardless of any client-side
fix.

**"Too many requests from this address" during login** — this exact message
belongs to `apiTrafficLimiter` (anonymous budget: 300 requests/15 min, keyed
by IP), not `authLimiter` (10 sign-in attempts/15 min, which has its own,
different message). If it's showing up during ordinary login, the likely
cause is many users sharing one IP (school/office Wi-Fi, carrier CGNAT, VPN)
exhausting that shared anonymous bucket — not a broken limiter. Options,
roughly in order of effort: raise the anonymous ceiling for read-only/public
endpoints specifically, move authenticated-adjacent calls to fire only after
token issuance so they land in the 2000/15min authenticated bucket sooner,
or add a distinct, more generous bucket for the pre-auth handshake sequence.
Don't remove the limiter — it's the thing standing between you and a much
worse day at real scale.

## Before "millions of simultaneous users"
The Redis-backed, user-scoped limiter and the LiveKit SFU media plane are the
right *shape* for scale, but neither has been load-tested here. Before
treating this as scale-ready: confirm LiveKit Cloud (or self-hosted cluster)
autoscaling and TURN capacity for your expected concurrent-Circle count, load
test the Redis rate-limit store under real concurrency, and run the real-device
certification pass below. That's a capacity-planning exercise, not a rewrite.

## Real-device certification (do this after the LiveKit env vars are set)
All of this is currently proven against a simulated in-process LiveKit-shaped
network, not a real SFU over the real internet. Before calling Circles
production-ready, run, on real devices over real networks (not the same
Wi-Fi/laptop):
- Host mic → listener, host mic+camera → listener, listener mic+camera → host
- Host camera denied → audio stays live
- Wi-Fi ↔ cellular handoff, brief total network loss → auto-recovery
- Background → foreground tab/app
- Camera/mic device switching mid-call
- TURN-only path (block direct UDP to force relay)
- Two or more simultaneous publishers
- One 30–60 minute long-running Circle
