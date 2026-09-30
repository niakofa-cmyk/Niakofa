---
name: Community V4 visual evidence browser
description: Local Community V4 screenshots require the system Chromium binary and one shared authenticated storage state across viewport contexts.
---

For local authenticated visual evidence, use the installed system Chromium executable rather than assuming a Playwright-managed browser download is present. Save one temporary authenticated storage state after the normal login flow and reuse it for desktop and mobile contexts. To check client cache privacy across account switches, keep logout, login, and subsequent navigation inside one SPA page and QueryClient; a full page reload is not a valid isolation test.

**Why:** The workspace may have Playwright but no downloaded browser, and a fresh mobile context otherwise captures the sign-in page instead of the authenticated Community surface. A reload silently creates a new empty cache and can falsely pass a cross-account notification isolation check.

**How to apply:** Use the local preview’s assigned workflow port, launch Chromium with the system executable and `--no-sandbox`, capture desktop first, save temporary storage state outside the repository, then reuse it for mobile and interaction-state captures. For browser-only privacy checks, synthetic intercepted accounts avoid real credentials or database writes; navigate via the app without reloading between accounts.