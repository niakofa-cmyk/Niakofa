---
name: LiveKit media boundary
description: The durable boundary between production Circle/Spiral media and the retired browser mesh.
---

Production Circle/Spiral rooms must use the LiveKit transport. The legacy TURN/ICE endpoint may remain mounted for older clients or deliberate transport experiments, but active room code must not import or instantiate the retired raw WebRTC mesh.

**Why:** The production architecture needs an SFU media plane for room scale and predictable reconnect behavior; leaving the mesh implementation reachable made it too easy for a future change to bypass that boundary.

**How to apply:** Keep capability/readiness helpers in LiveKit-adjacent modules, validate room transport selection with tests, and treat any new active import of the old mesh or ICE route as a compatibility review item.