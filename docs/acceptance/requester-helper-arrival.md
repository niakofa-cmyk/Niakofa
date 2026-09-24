# Requester/Helper Arrival Acceptance

## Purpose

This is a permanent, deliberately opt-in acceptance test for the real request
lifecycle:

`open → claimed → en_route → arrived`

It uses two approved disposable accounts:

- User A is the requester.
- User B is the helper.

Both authenticated browser sessions open the request page before the helper
marks arrival. The test then verifies the requester and helper see their
role-specific arrived state and both authenticated API reads report the same
durable result.

## Safety gates

The dedicated runner refuses to start unless all three mutation gates are set:

```sh
ALLOW_MUTATING_E2E=1
CONFIRM_DISPOSABLE_ACCOUNT=1
ALLOW_REQUEST_ARRIVAL_E2E=1
```

It also requires:

- `BASE_URL` and `NIAKOFA_API_ORIGIN` to be the same credential-free HTTP(S)
  origin.
- A full 40-character `EXPECTED_COMMIT` matching `/api/version`.
- `USER_A_STATE` and `USER_B_STATE`, or their corresponding `*_STATE_JSON`
  values.
- Distinct approved requester/helper accounts whose storage state matches
  `BASE_URL`.
- A ready deployment.

Storage-state files must be regular, untracked files outside the checkout with
mode `0600`. The existing `ops/validate-user-a-state.mjs` validates both files.
JSON state supplied through environment variables is materialized in a private
temporary directory and removed when the runner exits. Never commit or log
storage state, bearer tokens, or account passwords.

## Run the focused acceptance

Use the exact commit served by the target deployment:

```sh
BASE_URL=https://niakofa.com \
NIAKOFA_API_ORIGIN=https://niakofa.com \
EXPECTED_COMMIT=<full-40-character-served-commit> \
USER_A_STATE="$HOME/private/niakofa-requester-state.json" \
USER_B_STATE="$HOME/private/niakofa-helper-state.json" \
ALLOW_MUTATING_E2E=1 \
CONFIRM_DISPOSABLE_ACCOUNT=1 \
ALLOW_REQUEST_ARRIVAL_E2E=1 \
corepack pnpm test:request-arrival-acceptance
```

`test:request-arrival-live` is retained as a compatibility alias to the same
guarded runner. The broader `ops/run-deployed-acceptance.sh` also invokes this
spec only when `ALLOW_REQUEST_ARRIVAL_E2E=1`; use the focused runner when the
arrival lifecycle is the only scenario being certified.

Optional location overrides:

```sh
REQUEST_ARRIVAL_TEST_LAT=32.7555
REQUEST_ARRIVAL_TEST_LNG=-97.3308
REQUEST_ARRIVAL_TEST_NEIGHBORHOOD="Fort Worth"
```

## What is verified

1. The served commit, readiness state, and both approved account identities.
2. User A creates one disposable goodwill request.
3. User B claims it and advances it to `en_route`.
4. Both authenticated browser contexts load the request before arrival.
5. Neither role-specific arrived selector exists before the transition.
6. User B performs the real arrival mutation.
7. The API returns `arrived` with a valid `arrived_at` timestamp.
8. The requester sees `Your helper has arrived`.
9. The helper sees `You’ve arrived`.
10. Both authenticated API reads report the same arrived state and identities.
11. The requester cancels the disposable request in cleanup.

The test does not run by default and does not use account passwords. It creates
one production request only after all gates and preflight checks pass.