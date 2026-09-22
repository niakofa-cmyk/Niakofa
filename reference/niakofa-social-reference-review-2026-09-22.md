# Niakofa social reference review

**Reviewed:** 2026-09-22
**Purpose:** Preserve the evaluation of the four uploaded social-app archives and the implementation boundaries used when improving Niakofa.

## Source material

The original evaluation is preserved at:

`attached_assets/Pasted-Evaluate-these-zips-can-we-use-them-for-the-Niakofa-app_1790117859079.txt`

The uploaded archives remain available in `attached_assets/` for this workspace session. They are reference material only and are intentionally not staged or copied into the Niakofa source tree:

| Archive | Technology | Extracted files | Text-like lines scanned | Role in Niakofa |
| --- | --- | ---: | ---: | --- |
| `InstagramClone-master_1790118010547.zip` | React Native / Expo / Firebase | 66 | 5,256 | Media, feed, Story, camera, chat, and profile interaction reference |
| `flutter-clean-architecture-instagram-main_1790118015584.zip` | Flutter / Firebase / BLoC | 505 | 34,457 | Story, messaging, calling, repository, and use-case behavior reference |
| `flutter-instagram-offline-first-clone-main_1790118019154.zip` | Flutter / Supabase / PowerSync / BLoC | 1,173 | 61,400 | Strongest architecture, offline-first, media UI, Story editor, and reusable social-component reference |
| `instagram-flutter-clone-master_1790118023108.zip` | Flutter / Firebase / Provider | 102 | 2,864 | Simple feed, profile, post, follow, comment, and upload reference |

The extracted copies used for review were temporary and outside the workspace source tree. The archives were inspected as source material; no wholesale merge was performed.

## Product decisions

Niakofa remains a web/TypeScript monorepo with its existing authentication, API server, PostgreSQL schema, Hub membership, Community moderation, realtime, Messages, Diaspora, Requests, Services, Spirals, and Nia boundaries.

Use the references to recreate interaction quality, not to import their implementations:

- Community feed: Stories rail, composer, media posts, comments, reactions, and continuous discovery.
- Stories: full-screen media, progression, previous/next, swipe, hold-to-pause, replies, reactions, sharing, creator navigation, camera/gallery selection, text, stickers, effects, mentions, and Hub audience scoping.
- Messages: conversation, attachment, context, reply, and shared-media behavior connected to Niakofa’s own message contracts.
- Architecture: repository/use-case separation and offline-aware interaction ideas can inform Niakofa code, but Firebase, Supabase, PowerSync, user models, routes, schemas, notification systems, and backend services remain excluded.

## License and security boundaries

- The React Native archive contains an Apache 2.0 license while its README shows an MIT badge. Treat the actual license file as governing unless the original author clarifies the discrepancy.
- The clean-architecture Flutter archive is AGPLv3. Reimplement behavior rather than copying source into this network application.
- The offline-first archive says MIT but includes an additional restriction about using the source in entirety. Review exact terms before any source reuse; the current policy is reference-only recreation.
- The simple Flutter archive includes Firebase configuration/API-key-shaped material. Do not copy its Firebase configuration, authentication code, credentials, or environment files.
- No reference archive may introduce a second authentication provider, database, storage provider, notification system, media pipeline, or routing architecture into Niakofa.

## Current Niakofa integration note

The current Community Stories surface already owns durable Stories, hub/community visibility, authenticated same-origin media streaming, media validation, moderation, replies through Messages, reactions, shares, mentions, and story playback. Notification and interaction links use `/community?storyId=<id>`. The Community route now parses that identifier and the Story rail opens the matching author/frame after the authenticated feed loads, preserving the normal first-Story behavior for ordinary navigation.

This file is a decision record and source map, not a license grant. Before copying any future asset or source fragment, recheck its archive license and keep the implementation independently authored.