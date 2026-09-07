# Niakofa reference materials — 2026-09-07

This directory preserves the user-supplied Diaspora live-presence session note
verbatim in `diaspora-live-presence-session-reference.txt`.

The note describes the intended production contract:

- server-received GPS freshness is separate from profile `updated_at`;
- live presence expires after 10 minutes and never exposes raw coordinates;
- users resolve to one nearest approved Diaspora hub within its operational
  radius;
- neighborhood counts require reviewed geometry;
- stationary clients use a bounded heartbeat; and
- authenticated end-to-end acceptance is required before production claims.

The implementation was reviewed against the canonical `artifacts/` tree and
the committed reference packages before this session's changes. No uploaded
ZIP was applied over the current mainline because the archived packages are
older status/patch material, not a newer canonical source tree.