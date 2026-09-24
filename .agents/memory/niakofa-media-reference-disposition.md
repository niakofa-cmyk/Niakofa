---
name: Pixora, Postnisin, and Photobooth reference disposition
description: Durable guidance for using the three uploaded media and social archives as behavior references without importing their code or infrastructure.
---

The Pixora, Postnisin Social Media, and Photobooth archives are reference-only inputs for Niakofa. Pixora is the primary reference for media discovery, upload/publishing steps, collections, metadata, and image-card behavior. Postnisin is the primary reference for social composition, masonry presentation, post detail, comments, profiles, and related-content flow. Photobooth is a lower-priority visual reference for masonry galleries, search, quick viewing, and progressive discovery.

**Why:** Niakofa already has the authoritative React/Vite, Express/OpenAPI/Zod, PostgreSQL/Drizzle, object-storage, Redis/BullMQ, authenticated media, and LiveKit boundaries. Pixora uses MongoDB/Cloudinary/JWT/NextAuth, Postnisin uses Sanity and includes credential-shaped setup examples, and Photobooth depends on Pexels; importing any of those would fragment the product and create licensing, privacy, and operational risk. Postnisin includes an Apache-2.0 license, but Photobooth's archive has no license file despite its README claim, Pixora has no clear repository-wide reuse license, and bundled assets are not cleared for Niakofa use.

**How to apply:** Recreate only behavior and interaction ideas in Niakofa's own source, naming, styles, API contracts, authorization, media lifecycle, and storage pipeline. Do not copy source files, assets, schemas, credentials, provider configuration, auth, databases, realtime signaling, or deployment files. Keep the ZIPs outside GitHub, Railway, and the Niakofa codebase.