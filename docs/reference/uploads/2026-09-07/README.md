# Niakofa reference materials — 2026-09-07

This directory preserves the user-supplied Diaspora live-presence session note
verbatim in `diaspora-live-presence-session-reference.txt`.

It also preserves the verified local landing-page capture after the Nia
availability fix in `niakofa-preview-after-nia-fix.jpg`. The capture confirms
the public sign-in surface renders cleanly and no longer presents Nia as
resting when the service is healthy and the development kill-switch is enabled.

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

The Nia verification contract is:

- the API health probe reaches the co-located Nia service on port 3001;
- the API-to-Nia request boundary still requires `INTERNAL_SECRET`;
- a literal template value in `NIA_SERVICE_URL` is treated as unset and uses
  the documented co-located localhost service;
- production Nia remains explicitly kill-switchable and does not default on.