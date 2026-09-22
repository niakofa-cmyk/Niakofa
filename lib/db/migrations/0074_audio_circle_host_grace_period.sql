-- Migration 0074: Audio Circle host disconnect grace period
--
-- Real bug: a page refresh fires the same beforeunload -> POST
-- /audio-circle-sessions/:id/leave call as an intentional exit. The host
-- branch of that endpoint treated ANY leave — including an accidental
-- refresh — as "the host is gone for good" and immediately ended the whole
-- session, kicking out every other participant. A host's own accidental
-- tab refresh was silently destroying the entire live conversation for
-- everyone else in the room. This is the literal "Circles disappear when
-- you refresh the page" bug.
--
-- Fix: host_disconnected_at marks a transient disconnect instead of an
-- ended session. The session stays live and the host's own participant row
-- is left untouched (never marked left_at), so a rejoin within the grace
-- window is picked up by the existing idempotent /join lookup and the host
-- keeps their host role automatically — no separate reconnect endpoint
-- needed. If the host doesn't return within the grace period, the session
-- is lazily ended the next time anyone fetches it (see
-- GRACE_PERIOD_MS in routes/audio-circles.ts) rather than needing a new
-- background worker.
--
-- Explicit "End Session" (a deliberate host action) is a different
-- endpoint (/end) and is untouched by this — that still ends immediately,
-- as it should.

ALTER TABLE audio_circle_sessions
  ADD COLUMN IF NOT EXISTS host_disconnected_at TIMESTAMPTZ;
