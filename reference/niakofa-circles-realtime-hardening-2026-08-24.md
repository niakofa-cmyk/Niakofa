# Niakofa Circles — real-time hardening reference

This reference records the implementation direction from the August 24, 2026
handoff brief. The original full brief remains available in
`attached_assets/` during the build session.

## Product boundary

Niakofa Circles owns community audio/video conversation. Its REST lifecycle,
WebSocket signaling, and WebRTC media transport are separate concerns:

- REST/WebSocket: membership, roles, moderation, presence, and signaling.
- WebRTC: microphone/camera tracks, peer connections, remote streams, and ICE.

Retired gameplay artifacts remain outside this runtime.

## Reliability contract

The room must not call itself media-connected merely because the Circle REST
request succeeded. A media session owns its tracks and peer connections for the
whole join, while React only subscribes to session events.

The session exposes explicit connection outcomes:

- `connecting` while peers negotiate;
- `connected` only after at least one peer is connected;
- `reconnecting` during bounded ICE recovery;
- `lost` after recovery is exhausted or a local track ends.

ICE recovery uses four attempts with 1s, 2s, 4s, and 8s delays. A temporary
network transition should therefore recover without forcing a leave/rejoin;
permanent failure is visible and actionable.

## Certification matrix

Before calling Circles production-ready, verify with two real browsers:

1. Host and participant join the same Circle and hear each other.
2. Mute/unmute, camera toggle, leave/rejoin, and refresh behave deterministically.
3. A Wi-Fi/cellular or temporary network interruption recovers or shows `lost`.
4. Switching microphone/camera preserves the room and replaces only the track.
5. Permission denial gives an actionable preflight message.
6. Host moderation, recording consent, and host failover remain server-enforced.

The full source notes and supplied visual references are preserved under
`attached_assets/` and `public/`; do not promote retired-gameplay assets or runtime
code into the platform.