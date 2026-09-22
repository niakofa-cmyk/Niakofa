---
name: Niakofa env var override
description: Placeholder vars in [userenv.shared] silently override real Replit secrets — must delete them.
---

# Problem
`.replit` had `[userenv.shared]` entries like `VITE_MAPBOX_TOKEN = "your_mapbox_token_here"`. Replit evaluates shared env vars before secrets, so the placeholder overrides the real secret. The map rendered a blank black screen.

# Fix
Delete the placeholder via `deleteEnvVars({ keys: [...], environment: "shared" })` in code_execution. Then restart the affected workflow so Vite picks up the real value.

**Why:** Replit shared env vars in `.replit` take precedence over secrets of the same name.

**How to apply:** Any time a secret seems to be ignored, check `[userenv.shared]` in `.replit` for a colliding key.
