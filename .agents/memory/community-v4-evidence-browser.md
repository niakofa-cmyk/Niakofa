---
name: Community V4 visual evidence browser
description: Local Community V4 screenshots require the system Chromium binary and one shared authenticated storage state across viewport contexts.
---

For local authenticated visual evidence, use the installed system Chromium executable rather than assuming a Playwright-managed browser download is present. Save one temporary authenticated storage state after the normal login flow and reuse it for desktop and mobile contexts.

**Why:** The workspace may have Playwright but no downloaded browser, and a fresh mobile context otherwise captures the sign-in page instead of the authenticated Community surface.

**How to apply:** Use the local preview’s assigned workflow port, launch Chromium with the system executable and `--no-sandbox`, capture desktop first, save temporary storage state outside the repository, then reuse it for mobile and interaction-state captures.