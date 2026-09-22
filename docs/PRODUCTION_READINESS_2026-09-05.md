# Niakofa production-readiness review — 2026-09-05

## Verified repository state

GitHub `main` is the source of truth. The current application includes the requested Spirals migration, Diaspora Globe/Research/DNA work, county jurisdiction hardening, and payment-integrity changes.

### Spirals

- `/audio-spirals` and `/audio-spiral/:id` are canonical public paths.
- `/api/audio-spirals` and `/api/audio-spiral-sessions/*` are supported aliases.
- Circle-era routes and persisted identifiers remain compatibility surfaces.
- LiveKit remains the production media path; the forensic remediation keeps legacy transport from becoming an accidental production path.
- Existing route-contract tests exercise both Spiral and Circle aliases.

### Diaspora

- Globe uses live hub/story APIs, globe projection, migration arcs, story detail/audio, translation review, reporting, and record-story entry points.
- Research is a persistent workspace with family-scoped cases, six evidence types, confidence, notes, and Timeline handoff.
- DNA Connections are opt-in and revocable, bounded, symmetric, and explicitly described as derived-sketch similarity leads rather than provider shared-cM/IBD results.
- Preserve scan idempotency and recorder handoff are implemented and covered by contract/live acceptance suites.

### County-aware Community

County identity is normalized as `(county, state)`, not inferred from display-name substring matching. Verified GPS-driven communities use the resolved `community_id`; civic reads fail closed when a verified local jurisdiction is unavailable. This is the correct safety model for travel: when the user's resolved community changes, pool/civic reads follow that community rather than leaking another county's feed.

This does **not** justify claiming that every U.S. county has a fully populated, independently curated civic-resource catalog. Unverified local coverage must remain fail-closed or explicitly national/fallback.

### Payments

The current payment hardening covers idempotency, active PaymentIntent reservation, duplicate-intent cancellation, cumulative refund watermarking, and protection against double settlement between destination charges and wallet settlement. Production certification still needs a real Stripe test-mode webhook walkthrough against the deployed environment.

## Railway production configuration

The production `zesty-ambition` service is connected to `niakofa-cmyk/Niakofa:main` and has the required URL variables present. Safe non-secret URL values are maintained as:

- `NIAKOFA_API_ORIGIN=https://zesty-ambition-production-f6a1.up.railway.app`
- `NIAKOFA_API_URL=https://zesty-ambition-production-f6a1.up.railway.app`
- `NIAKOFA_WEB_URL=https://niakofa.com`
- `BASE_URL=https://zesty-ambition-production-f6a1.up.railway.app`
- `APP_URL=https://niakofa.com`

Secrets are not documented here.

## Acceptance boundary

A disposable Playwright storage-state file must stay on the operator's machine. It must never be committed, pasted into chat, or stored in Railway variables.

Production completion requires all of the following together:

1. exact deployed application commit is identified;
2. `/api/readiness` is ready;
3. authenticated Chromium passes against the deployed origin;
4. gated mutation acceptance passes for Research evidence, Preserve repeat scan, and DNA opt-in/revoke;
5. county-travel acceptance proves two distinct verified communities and restores the disposable account state;
6. Stripe test-mode webhook/settlement walkthrough passes;
7. no provider-grade DNA claims are introduced without provider/IBD provenance and a reviewed consent/retention contract.

A green Railway deployment alone is not equivalent to this certification.
