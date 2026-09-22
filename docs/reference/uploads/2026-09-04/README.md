# Niakofa Diaspora journey reference pack

This directory records the uploaded Diaspora journey review received on
September 4, 2026. The source archives remain in `attached_assets/` for local
reference; they are intentionally not tracked as runtime code.

## Reviewed inputs

- `Niakofa-Diaspora-Journey-E2E-INTEGRATED_1788494486877.zip`
- `Niakofa-Diaspora-Journey-E2E-2026-09-04_1788494490728.zip`
- The two pasted continuation notes uploaded with them

The archives were extracted into an isolated temporary directory and every
text/code member was read before implementation. Credential-shaped content
scan: no matches. Do not copy credentials from future reference material into
this repository.

## Implemented from the review

- DNA Connections now makes Import the primary action until a ready profile
  exists, uses the server's provider allowlist, and sends raw bytes with the
  exact provider/family/file headers expected by the API.
- The sketch matcher has a stable engine port for a future reviewed engine;
  no IBD/shared-cM claims or unreviewed engine switch were introduced.
- All seven Diaspora source contract files run through one fail-fast command.
- Mocked and staging Playwright journey specs cover the Diaspora routes and
  DNA import/consent ordering.
- Existing Globe `?hub` and Family `?intent=oral-history` behavior, explicit
  Research status transitions, digest-only DNA ingestion, and Timeline
  handoff semantics were verified and retained.

## Deferred by design

- Provider-grade IBD/shared-cM matching requires stored genotype policy,
  partnership/licensing, consent review, and a versioned API response.
- Heritage moderation operations and deeper guide/story handoffs remain
  product follow-ups, not safe defaults for this release.