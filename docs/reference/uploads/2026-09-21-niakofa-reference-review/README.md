# Niakofa reference review — 2026-09-21

This directory records the review of the three uploaded reference projects and
the implementation boundary used for Niakofa enhancements.

## Source material

- `Pasted-Evaluate-these-zip-files-can-we-use-them-for-the-Niakof_1790031405625.txt`
- `Pasted-What-I-would-actually-take-from-the-three-projects-From_1790031464790.txt`
- `fb-clone-main_1790031621743.zip`
- `sociobook-main_1790031632562.zip`
- `WigsStar-main_1790031636794.zip`

The uploaded source archives remain workspace reference material. They are not
copied into the application bundle or imported as application code.

## Reuse map

| Niakofa surface | Reference | Boundary |
| --- | --- | --- |
| Story rail, avatar treatment, simple feed density | `fb-clone-main` | Visual study only |
| Feed reactions, comments, notifications, relationship UX | `sociobook-main` | Interaction study only |
| Story creation, viewer, gallery, music picker, chat, group chat, call UI | `WigsStar-main` | Feature/state reference only |
| RTC signaling, database, authentication, storage, deployment | Niakofa | Keep the existing implementation |

Niakofa remains the source of truth for React/Vite, Express, OpenAPI, Drizzle
PostgreSQL, MediaAsset/Object Storage/FFmpeg, WebSocket replay, and LiveKit
RTC. The reference projects must not replace those boundaries.

## Explicit exclusions

Do not import Firebase, MongoDB, Prisma, Clerk, UploadThing, Supabase
migrations/RLS/auth/realtime signaling, Next.js routing, source project
credentials, production configuration, or the WigsStar Android release
keystore. The WigsStar archive contains project-specific Supabase artifacts and
`WigStar-release.keystore`; both remain isolated from Niakofa.

## Niakofa implementation notes

- Community Stories stay isolated from Community Feed through
  `CommunityStoriesExperience`.
- Story media is validated in the browser and again on the server.
- Story media remains behind authenticated access and the existing
  MediaAsset/processing pipeline.
- Music is curated metadata until a licensed catalog and composition pipeline
  are approved; the UI must not imply unrestricted commercial mixing rights.
- Story replies use the existing direct-message context system.
- Direct voice/video uses the existing LiveKit boundary; reference WebRTC
  signaling is not transplanted.
- The current Story creator's gallery selection is part of the publish
  contract, not just a visual state.

## Review status

The current remote `main` branch was reviewed before edits. The current
enhancement fixes the gallery-selection publish gap and adds keyboard-safe
Story viewer controls without changing Niakofa's backend architecture.