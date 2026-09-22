---
name: Niakofa Audio Circles — design decisions
description: Live voice/video rooms feature — durable architectural decisions, not implementation detail (see code for current specifics).
---
- Built on the pre-existing (previously unwired) `city_neighborhoods` system instead of a new `neighborhoods` table scoped by county — keeps circles scoped by `city_key` so any city works, not just counties that already have a `communities` row.
- WebRTC mesh (peer-to-peer) chosen over an SFU deliberately: connection count grows as speakers × participants, which is fine for the enforced speaker cap + a reasonable listener count. If large listener counts are ever needed, swap the mesh client for a real SFU (e.g. self-hosted LiveKit) — the REST/WS lifecycle doesn't need to change since the server never touches media, only signaling relay.
- **Signaling gotcha:** a peer connection created lazily on receiving an incoming offer never gets an outgoing-offer path wired up. So for any pair where only one side explicitly initiates the connection (e.g. listener → speaker), that side must ALWAYS be the offer-sender — you cannot rely on a userId-based tiebreak unless BOTH sides in the pair explicitly call connect-to-peer for each other.
- **Leave/unload gotcha:** `navigator.sendBeacon` cannot carry an Authorization header. If a leave/cleanup route requires auth, don't gate on `sendBeacon() || fetch(...)` — sendBeacon "succeeding" will skip the authenticated call and the server-side state never updates. Use an authenticated `fetch(..., { keepalive: true })` on unload instead.
- No dedicated test suite for the audio-circles routes yet — real gap, not a regression.
