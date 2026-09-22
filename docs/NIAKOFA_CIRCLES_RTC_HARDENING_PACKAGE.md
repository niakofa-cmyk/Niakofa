# Niakofa Circles RTC hardening package

This file records the production boundary and provenance of the uploaded
`niakofa-circles-rtc-hardening` implementation package. The original archives
remain in `attached_assets/` for this work session; this reference keeps the
integration decision discoverable in the repository.

## Current production path

- Niakofa REST and WebSocket endpoints remain the control plane for rooms,
  membership, roles, moderation, recording metadata, and presence.
- The browser mesh remains the immediate media transport for small Circles.
- The mesh uses stable media paths, camera-only acquisition, `replaceTrack`,
  serialized negotiation, ICE queuing, bounded recovery, and audio-preserving
  camera failure fallback.
- A video-enabled open room allows every active participant to intentionally
  publish a camera without host promotion. Joining never silently enables a
  camera.
- Host and co-host moderation remains intact. A room can opt into
  `moderated` publishing when a future product flow requires stage approval.

## Scale boundary

The LiveKit/SFU adapter is intentionally an explicit future boundary, not a
fake fallback. It must only be enabled after the backend mints short-lived
room-scoped tokens, the client SDK is installed, and a real SFU deployment is
configured. Audio/video bytes must never be routed through the Node API.

## Required release evidence

Automated policy and transport contracts are necessary but cannot certify real
camera, microphone, NAT, or device behavior. Before calling Circles production
certified, run the two-device matrix from the uploaded integration guide:
audio-only join, host camera on without audio loss, listener camera publish
without approval, camera off with audio retained, permission denial with audio
retained, Wi-Fi/cellular recovery, refresh/rejoin, host failover, and endurance
sampling.

## Source references

- `docs/NIAKOFA_CIRCLES_RTC_FOUNDATION.md`
- `attached_assets/Pasted--One-very-important-distinction-The-package-contains-tw_1787696468659.txt`
- `attached_assets/niakofa-circles-video-fix.tar_1787696571686.gz`
- `attached_assets/niakofa-circles-rtc-hardening_1787696571686.zip`