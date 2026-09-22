# Niakofa Community social architecture references

This directory preserves the source material used for the Community social-shell redesign.

## Included references

- `community-assessment.txt` — the full product/architecture assessment supplied with the redesign request.
- `community-redesign-package/` — extracted README and design documentation from the Niakofa Community Social Architecture Redesign Package.
- `community-redesign-reference.png` — the supplied visual architecture reference.
- `attached_assets/` at the repository root — the original uploaded ZIP archives and source files are retained unchanged there:
  - Functional Next.js/Firebase/Tailwind Facebook clone
  - Smaller Next.js Facebook clone
  - Flask/SQLite Facebook clone

## How to use these references

The Facebook-clone archives are UI and interaction references only. They are not an architectural dependency of Niakofa. Niakofa remains the source of truth for:

- Postgres/PostGIS and Redis persistence
- existing authenticated sessions and unified Messages routes
- community posts, Hub feeds, Requests, Stories, media, moderation, realtime, and notifications
- existing diaspora, Circles, Skills, Civic, Pool, gratitude, and help-routing systems

The Community frontend should continue to compose those contracts rather than introducing Firebase, NextAuth, SQLite, Flask, a second messaging backend, or duplicate identity/storage systems.

## Current redesign direction

The Community entry point uses a responsive social shell with Home, People, Hubs, Stories, Circles, Requests, Services, and Media navigation. Existing Niakofa service surfaces remain available through that shell and the existing operational controls. Message actions continue to use `/messages` modes.

These files are reference material, not runtime input. Update this README when a future Community redesign adds a new source package or replaces one of these references.