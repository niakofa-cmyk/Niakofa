---
name: Direct-message attachment privacy
description: Private Direct-message media must be fetched with bearer authentication before browser rendering.
---

Direct-message attachment URLs are protected API routes, not public browser media URLs. Renderers must fetch them with the app's authenticated headers and use short-lived object URLs for images, video, audio, and downloads.

**Why:** The Messages frontend authenticates API calls with bearer headers; native `img`, `video`, `audio`, and download navigation cannot attach those headers, so direct `src` links would fail or require weakening media privacy.

**How to apply:** Keep storage keys server-only, authorize attachment reads through conversation membership, send private/no-store responses, and revoke object URLs when the renderer unmounts or changes media.