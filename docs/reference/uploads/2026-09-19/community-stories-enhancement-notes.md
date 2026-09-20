# Community Stories reference review

Reviewed on 2026-09-19 against the current Niakofa `main` implementation.

## Reference decisions

- The Niakofa-specific enhancement archive is an integration reference, not a
  replacement snapshot. Its canonical boundary remains
  `/api/community/stories`.
- Story interactions remain durable through the existing interaction routes and
  Story context remains part of the existing Direct Messages `contexts` API.
- The archive explicitly leaves licensed audio mixing, baked media effects,
  global realtime state, Shared Media polish, and RTC integration as
  infrastructure-dependent work. The current app therefore keeps music as
  metadata and effects as client-side preview filters.
- The Facebook browser-extension archive and Messenger desktop archive are
  architecture references only. Their DOM assumptions, obsolete platform
  contracts, and licensing boundaries are not imported into Niakofa.

## Improvements applied

- Story composer validation now matches the server’s accepted image/video MIME
  types and checks video duration before base64 encoding and upload.
- Selecting multiple files now gives the creator a per-item preview strip while
  keeping object URLs revocable on replacement and unmount.
- The Story rail keeps the initial media preload bounded but loads the selected
  media item on demand, so Stories outside the first preload batch do not remain
  stuck in a loading state.
- Text-only Stories persist a safe background color and render the caption once
  through the persisted Story element layer.

## Intentionally not copied

- No `message_stories` table or `/api/messages/stories` endpoint.
- No direct copy of historical full-repository snapshots.
- No unlicensed audio files, transcoding pipeline, or server-side baked effects.

Raw uploaded archives remain workspace reference material and are not staged
into the public repository.