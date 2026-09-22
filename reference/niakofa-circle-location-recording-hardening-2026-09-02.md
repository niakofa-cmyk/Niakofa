# Niakofa Circles — location and recording hardening

Date: 2026-09-02

## Source materials

The user-supplied hardening packet is preserved under
`reference/uploads/2026-09-02/`. The packet's README and migration-status note
are retained as provenance; the uploaded ZIP and Python patch were reviewed as
specification material rather than applied verbatim.

The live repository is the source of truth for paths and interfaces. Several
examples in the supplied patch referenced modules that do not exist in this
checkout, left playback authorization unfinished, used a different storage
helper signature, and described a retention worker that was not included.

## Security decisions

- Hosting a Circle requires a fresh, high-accuracy browser location. The
  server reverse-geocodes the submitted coordinates with Mapbox and compares a
  normalized city key against the Circle. Failure to obtain or verify a city
  fails closed.
- Joining a Circle does not require GPS. Location is a host-start policy, not a
  membership policy.
- New sessions default to recording disabled. The legacy direct “start
  recording” endpoint can stop an active session for compatibility, but cannot
  start one; starting uses the consent-aware lifecycle.
- Recording authorization, consent, active-state transitions, and finalization
  are server-side operations. Every active participant must acknowledge before
  the host can start recording.
- Recording objects use the private `circles/recordings/` namespace. Cloud
  playback uses short-lived signed URLs; local playback goes through an
  authenticated asset route. Archive listing and playback require a historical
  participant, host, or approved admin.
- Retention cleanup removes both expired storage objects and their database
  metadata. Cleanup failures are logged rather than silently treated as
  successful deletion.

## Implementation boundary

The new policy is intentionally additive:

- `circleLocationPolicy` and `circle-location` own server-authoritative
  location verification.
- `circleRecordingPolicy` and `circle-recordings` own authorization, consent,
  lifecycle, finalization, playback, and protected local assets.
- Existing Circle session, archive, WebSocket, and LiveKit behavior remains in
  place. The older upload path is retained as a compatibility path but now
  writes private recording objects and lifecycle metadata.
- The database migration creates recording and consent tables and changes the
  session default for future rows without rewriting explicit settings on
  existing sessions.

## Release checks

Before publishing, run the API and web type checks, the Circle/API test suites,
`git diff --check`, and a clean workflow restart. Verify that the API migration
runner reaches its database before treating readiness failures as application
regressions. Never place provider credentials in this document or in source
control.