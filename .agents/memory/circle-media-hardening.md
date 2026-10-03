---
name: Circle media hardening
description: Durable architecture and certification constraints for Circle RTC reliability.
---

LiveKit is the sole Circle media transport. REST/WebSocket own membership, moderation, chat, presence, and recording state; microphone and camera lifecycles remain independent.

**Why:** Replacing LiveKit or coupling camera recovery to microphone teardown would reintroduce the continuity failures the Circle architecture was hardened to prevent.

**How to apply:** Keep recovery bounded and cleanup-safe, never reload the page or create a competing reconnect loop, and treat an intentional camera-off action as opt-out from automatic camera restart. Real-device certification remains a separate release gate.

## LiveKit publish-source grants
Pass `TrackSource.CAMERA`, `TrackSource.MICROPHONE`, and `TrackSource.SCREEN_SHARE` to `canPublishSources`; do not cast raw strings to the SDK grant type.

**Why:** The LiveKit SDK serializes protobuf `TrackSource` enum values when signing the JWT. Raw strings can reach runtime and make token creation fail.

**How to apply:** When changing allowed publish sources, test actual JWT creation and decoded claims with fake local credentials; no LiveKit connection is needed.