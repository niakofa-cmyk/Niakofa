---
name: Authenticated Admin browser checks
description: Durable rules for reliable authenticated Playwright checks against protected Admin APIs and dense operations UIs.
---

Authenticated Playwright storage state does not automatically add an Authorization header to raw fetch calls made inside page.evaluate. Dense Admin screens also require exact role/name locators instead of broad text regexes.

**Why:** The browser can be authenticated for navigation while an in-page fetch still receives 401, and repeated labels such as Reviewed appear in buttons, metric cards, and supporting text.

**How to apply:** Use the stored token explicitly for protected page.evaluate requests and prefer exact button/link roles for acceptance assertions; reserve broad text matching for unique static copy.