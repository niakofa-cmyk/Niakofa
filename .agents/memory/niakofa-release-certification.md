---
name: Niakofa release certification
description: Circles release evidence must separate automated boundary checks from real-browser media certification.
---

The Circles release gate has two distinct parts: automated build/type/route checks
and recorded real-browser tests over a real TURN/NAT path. A passing build or
unauthenticated API smoke run proves the first part only.

**Why:** WebRTC media, permissions, device lifecycles, and network recovery
cannot be proven by server route tests or a SPA shell response.

**How to apply:** Keep the certification matrix current, run the release smoke
gate with both workflows available, and use “implemented and awaiting
certification” until each applicable browser row has evidence.