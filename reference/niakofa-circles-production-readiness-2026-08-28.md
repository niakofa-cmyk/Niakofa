# Niakofa Circles — production-readiness handoff

Date: 2026-08-28

## Source materials

The complete user-supplied review and both reference ZIPs are preserved under
`reference/uploads/2026-08-28/`. The ZIPs are retained unchanged, alongside
their extracted text for quick review.

## Maintained implementation boundary

- LiveKit remains the only Circle media transport. Do not replace it with a
  mesh or add a second realtime media system.
- REST/WebSocket own authentication, membership, moderation, chat, presence,
  and recording state. LiveKit owns the media plane.
- Microphone and camera lifecycles remain independent. A camera permission,
  device, or publication failure must not tear down a working microphone.
- Recovery rejoins the same Circle without a page reload, using a fresh
  server-minted token, bounded backoff, and restoration of the media the user
  requested.
- Live media is never cached. Only Circle metadata may be cached.

## Changes applied from the supplied targeted-fixes pack

1. The manager unit test now uses the browser-shaped
   `DOMException("Permission denied", "NotAllowedError")` and asserts the
   production `permission_denied` classification.
2. `setVideoEnabled()` now returns a typed success/failure result instead of
   swallowing camera failures.
3. Media-token failures now expose stable UI-actionable codes for
   authentication, authorization, ended sessions, state conflicts, rate
   limiting, and server failures, while preserving HTTP status and
   `Retry-After` information.
4. Railway example configuration documents all three server-only LiveKit
   variables, and `scripts/verify-livekit-env.sh` checks their presence and
   production URL shape without printing secret values.
5. Production URL validation now rejects local `ws://` endpoints, and the
   media-token client surfaces the exact missing-LiveKit 503 without wasting
   retry attempts.
6. `/api/readiness` reports a redacted `livekit` dependency status so Railway
   operators can distinguish missing media configuration from a database outage.

## Remaining release gate

The automated tests use a deterministic in-process LiveKit-shaped transport.
They do not prove real WebRTC across a hosted SFU, TURN, NAT boundaries, or
physical phones. After the API service has `LIVEKIT_URL`,
`LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` configured, complete the real-device
matrix in the supplied operations docs before calling Circles certified:

- host/listener audio and video in both directions;
- camera denial while microphone remains live;
- Wi-Fi/cellular handoff and temporary network loss;
- background/foreground recovery;
- camera and microphone switching;
- TURN-only connectivity;
- multiple simultaneous publishers;
- a 30–60 minute Circle.

Never commit real LiveKit credentials. The verification script intentionally
reports only variable presence and URL shape.