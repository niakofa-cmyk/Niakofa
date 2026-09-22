---
name: Circle media hardening
description: Durable architecture and certification constraints for Circle RTC reliability.
---

LiveKit is the sole Circle media transport. REST/WebSocket own membership, moderation, chat, presence, and recording state; microphone and camera lifecycles remain independent.

**Why:** Replacing LiveKit or coupling camera recovery to microphone teardown would reintroduce the continuity failures the Circle architecture was hardened to prevent.

**How to apply:** Keep recovery bounded and cleanup-safe, never reload the page or create a competing reconnect loop, and treat an intentional camera-off action as opt-out from automatic camera restart. Real-device certification remains a separate release gate.