---
name: Media Studio scope
description: Keep Niakofa Media Studio UX work isolated from production configuration and existing media.
---

Media Studio workflow and UX work stays within the existing Niakofa artifact. Preserve production settings and existing media; do not inspect or delete existing media, alter production configuration or V21, or manually deploy.

**Why:** The user scoped the Studio audit as product-flow work and explicitly required production settings and existing media to remain untouched.

**How to apply:** Use local previews and fixtures for Studio changes. Do not access production media or configuration, toggle V21, or manually deploy as part of this work.
