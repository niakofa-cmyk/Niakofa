---
name: Studio focus ownership
description: Keep the legacy composer and Media Studio from competing for keyboard focus and dismissal.
---

Only the active Studio implementation should own focus trapping and Escape handling. Fullscreen feed shortcuts must not act while Studio is open.

**Why:** The legacy composer effect depends on draft text; refocusing its first button on every effect run interrupts ordinary typing. Two Escape handlers can also skip editing steps or close the editor unexpectedly.

**How to apply:** Preserve typing focus when draft state changes, initialize focus on entry rather than every keystroke, and check sequential keyboard typing and nested dismissal when modifying composer integrations. Keep full-screen Studio outside feed layout containers so their clipping and stacking do not constrain editing.
