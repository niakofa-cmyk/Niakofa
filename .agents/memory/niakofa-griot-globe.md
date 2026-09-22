---
name: Niakofa Griot Globe feature
description: Diaspora Globe + Griot Stories system end to end — DB schema, API routes, frontend page, the A/B/C diaspora-hub integration patch, and the report/moderation pipeline.
---

# Griot Stories & Diaspora Globe

## Base feature (migration 0052)
- `griot_stories` + `story_translations` tables; enums: `griot_story_status` (recorded→transcribing→pending_review→ready→published), `griot_story_visibility` (public/diaspora_tag/private); unique index on `(story_id, language)`.
- API route `artifacts/api-server/src/routes/griot.ts`: GET /griot/stories (public, visibility=public only), GET /griot/stories/mine (auth), POST /griot/stories, GET/PATCH /griot/stories/:id, POST /griot/stories/:id/publish, GET/POST /griot/stories/:id/translations, PATCH /griot/stories/:id/translations/:lang/approve.
- `globe.tsx` — Mapbox globe projection, 10 diaspora hub cities, great-circle arcs, recording/playback UI, translation review inbox. Standalone route at `/globe`; also under Community → "🌍 Globe" tab (lazy-loaded).
- **Why:** `visibility='public'` enforced on both the public feed AND detail routes — a published-but-private/diaspora_tag story must never leak through either path (explicit security requirement).
- Story lifecycle: recorded → transcribing → pending_review → (recorder approves all translations) → ready → published, released via `release_at`. Translation approval also accepts `edited_text`, stored as `was_edited=true` for future Nia fine-tuning.

## A/B/C diaspora-hub integration (migration 0053)
- Merged as a full-file "drop-in patch" onto the already-built base feature — **always diff/merge patches like this rather than overwriting**, since prior sessions may have added moderation/reporting/audit logic the patch author didn't know about.
- `griot_stories` gained `story_type` enum (heritage_archive/gratitude/diaspora_social) + request_id/gratitude_post_id/community_id/hub_id.
- New `diaspora_hubs` table replaces globe.tsx's hardcoded 10-city array; `GET /griot/hubs` returns live active_helpers/requests_fulfilled/pool_balance/story_count per hub.
- New `griot_transcription_jobs` queue (worker polls every 2 min); `transcribeAudio()` is an intentional stub that fails loudly (no STT provider wired) — don't treat "transcribing" as reliable until a real provider (Whisper/AssemblyAI/Deepgram) is connected.
- `POST /gratitude/:id/promote-to-story` has a UNIQUE constraint on gratitude_post_id → 409 on duplicate promotion; author-only.
- Still NOT implemented (tracked as follow-ups, not built): cross-diaspora crisis pledges (hub_community_leaders permissions, crisis-lit hub UI, Stripe→pool sponsor_contribution scoped to a hub); hub member counts/localization wired to users.diaspora_tag (some hub cards still show non-query-backed stats).

## Report/moderation pipeline
- `reports` table has `reported_griot_story_id` (nullable, alongside `reported_user_id`/`reported_request_id`); at least one target required via Zod `.refine`.
- Users flag a story from its card (`GriotStoryCard` in `globe.tsx`, min-10-char reason) → `POST /reports`.
- `POST /griot/stories/:id/publish` is the real enforcement gate: re-runs the moderation heuristic on `text_content` at publish time (not just creation) and blocks (409) if flagged OR if there's an open (`pending`/`under_review`) report against the story.
- Admin resolving a report as `resolved_banned` auto-reverts the story's `status` to `pending_review` (no separate "banned" status — reuses the existing enum), and auto-dismisses every other still-open report against that same story (prevents duplicate lingering reports after the action was already taken).
- Dedicated admin queue: "Griot Globe" tab (`GriotReportsSection` in `admin.tsx`) backed by `GET /api/reports/griot-stories` — joins reports + stories + author so admins don't cross-reference the generic Reports tab.
- **Why:** the generic reports list has no story context (title/text/author), making story moderation slow from that view alone.
- **How to apply:** for any new reportable entity type, follow this same pattern — nullable FK column on `reports`, dedicated enriched GET endpoint, dedicated admin tab/section — rather than overloading generic report status fields.
- **Express route-order trap:** a static-segment route (e.g. `/reports/griot-stories`) must be registered BEFORE a sibling `/reports/:id` route in the same router, or Express matches the static segment as the `:id` param and the specific route is silently unreachable. Always grep the full route list in a file when adding a new static path next to an existing `:id` route.
