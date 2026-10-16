---
name: Studio theme verification
description: Check the final CSS cascade in both unified Studio and legacy audience screens.
---

Verify the actual active Studio branch and any retained legacy audience branch separately. Source assertions that merely find the intended colors are not evidence of the final computed styles.

**Why:** Unified Studio's selected controls were correct while the legacy audience screen still combined a more-specific navy panel rule with dark text from its light editor theme. Later generic resets and token declarations did not override that rule.

**How to apply:** Inspect computed panel background and foreground together, including portal roots and phone-sized layouts. Confirm the final selector cascade after a CSS fix; preserve existing light editor and dark playback roles rather than overriding the global primary palette.
