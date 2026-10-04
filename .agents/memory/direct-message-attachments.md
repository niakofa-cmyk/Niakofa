---
name: Authenticated media privacy
description: Bearer-protected media must stay same-origin and be fetched before browser rendering.
---

Private attachments, Family media, and Story-media URLs are protected API routes, not public browser media URLs. Renderers must fetch them with the app's authenticated headers and use short-lived object URLs for images, video, audio, and downloads. Cloud objects must stream through the same-origin API instead of redirecting to signed storage URLs. This applies to family-visible memories too; visibility does not make an authenticated cross-origin redirect usable.

**Why:** Native media elements cannot attach bearer headers, and authenticated browser fetches that follow signed-storage redirects can be blocked by the app's storage-host CSP or CORS. Family Story playback exposed that the transport requirement applies to family-visible media as well as private media. Same-origin streaming keeps authorization enforceable without weakening CSP or exposing signed locations.

**How to apply:** Keep storage keys server-only, authorize every media read against its owning resource and visibility rules, stream bytes from cloud storage through a same-origin private/no-store response without branching to redirects for broader visibility, and revoke object URLs when the renderer unmounts or changes media.