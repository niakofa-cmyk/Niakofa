# Niakofa Circles ops reference — August 28, 2026

This directory preserves the complete diagnosis material supplied for the
Circles production-readiness pass. The source ZIP was inspected in an isolated
directory before any repository changes were made. Its seven files are copied
below as plain text so future work can search and review them without applying
an archive over the active source tree.

The two accompanying decision notes are also preserved here:

- `session-audit-notes.txt` — the audit and validation context supplied with the
  workspace snapshot.
- `realtime-media-decision.txt` — the recommendation to configure LiveKit and
  certify real devices rather than introduce a second media architecture.

## Canonical implementation boundary

- Active frontend: `artifacts/pay-it-forward/`
- Active API: `artifacts/api-server/`
- LiveKit is the sole Circle media transport.
- REST and WebSocket remain the Circle control plane.
- Camera and microphone are independent publications.
- Reconnect must reuse the Circle session without a full-page refresh.

## Release boundary

Automated route, health, readiness, type, and unit checks do not prove browser
permissions, WebRTC, TURN/NAT traversal, or physical-device behavior. The
two-device certification matrix in `FIX_CAMERA_AND_CONNECTIVITY_ERRORS.md`
remains required before calling live media fully certified.

## Files

- `CURRENT_STATE_AND_VISION.md`
- `FIX_CAMERA_AND_CONNECTIVITY_ERRORS.md`
- `FIX_LIVEKIT_NOT_CONFIGURED.md`
- `FIX_RATE_LIMIT_429.md`
- `README.md`
- `env.railway.livekit.snippet.md`
- `verify-livekit-env.sh`

Never copy real LiveKit keys into this repository. The checked-in snippet uses
placeholders only.