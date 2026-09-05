# Niakofa build reference

This file is the working index for the Niakofa production-readiness work
reviewed on 2026-09-05. The canonical application source is the root
`artifacts/` monorepo and the canonical product surface is **Niakofa
Spirals**.

## Product and migration rule

- Spirals is the user-facing product identity and the default navigation
  namespace.
- Circle-era URLs, API routes, realtime events, persisted records, database
  identifiers, and active sessions remain supported compatibility surfaces.
- Do not globally rename Circle-era storage or internal identifiers until a
  separately governed dual-read/backfill/sunset migration exists.
- The live-room hierarchy remains **Host → Co-Host → Speakers → Audience**.
- The live media production path is **LiveKit**. Legacy mesh code is
  compatibility infrastructure only and must not be selected as the production
  transport.

## Safety and data-scope contracts

- Nia is a separate service boundary. App-to-Nia calls use the authenticated
  Nia client and must remain kill-switchable and non-blocking to recording,
  moderation, and core Spirals availability.
- Recording finalization succeeds independently of AI summary availability.
- County identity is the normalized `(county, state)` jurisdiction key, not a
  display-name substring.
- Each verified county gets its own Community Pool. GPS travel can update the
  authenticated user's `community_id`; pool, civic-need, and civic-resource
  reads must use that resolved community and fail closed when local coverage is
  not verified.
- The provider-grade DNA boundary remains intentionally separate from the
  current derived-sketch discovery experience.

## Current verification commands

Run from the repository root after installing with the committed lockfile:

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm --filter @workspace/db run migrate
corepack pnpm run typecheck
corepack pnpm run build
corepack pnpm --filter @workspace/api-server run test
corepack pnpm run boundary-check
corepack pnpm run release-validate
```

For deployed acceptance, use a disposable Playwright storage-state file only
on the operator's machine. Never commit or paste that JSON:

```bash
BASE_URL=https://niakofa.com \
NIAKOFA_API_ORIGIN=https://niakofa.com \
EXPECTED_COMMIT=<served-commit> \
USER_A_STATE=/private/path/user-a-state.json \
ALLOW_MUTATING_E2E=1 \
CONFIRM_DISPOSABLE_ACCOUNT=1 \
ALLOW_COUNTY_TRAVEL_E2E=1 \
bash ops/run-deployed-acceptance.sh
```

Production certification still requires exact served-commit parity, readiness,
authenticated Chromium, county travel proving two distinct communities, and a
real Stripe test webhook walkthrough. A local preview with no production
credentials cannot certify those external gates.

## Reviewed source materials

The following uploaded materials remain available in the workspace under
`attached_assets/` for this session's reference:

- `Pasted-Replacing-Niakofa-Circles-Wth-Niakofa-Spirals-In-Africa_1788632810210.txt`
- `Pasted--GitHub-Verify-with-the-updated-repo-Change-and-Replace_1788632910172.txt`
- `Niakofa-Spirals-Migration-2026-09-05_1788632954683.zip`
- `niakofa-production-hardening-and-spirals-bundle_1788632954683.zip`
- `niakofa-cleanup-and-county-fix_1788632954683.zip`

The archives were inspected before implementation. Their actionable findings
were: preserve dual Circle/Spiral compatibility, keep LiveKit authoritative,
keep Nia non-blocking, prove county travel with a disposable account, use
canonical county/state matching for civic scope, and remove the stale nested
`niakofa-repo/` mirror.
