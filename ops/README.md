# Deployed acceptance operations

Run deployed acceptance only through `ops/run-deployed-acceptance.sh`. It requires:

- `BASE_URL` and matching `NIAKOFA_API_ORIGIN` HTTPS origins;
- `EXPECTED_COMMIT`, `ALLOW_MUTATING_E2E=1`, and `CONFIRM_DISPOSABLE_ACCOUNT=1`;
- `ALLOW_COUNTY_TRAVEL_E2E=1` for the separately gated location-mutating test;
- approved, distinct authenticated User A and User B Playwright storage states.

Pass a pre-existing state with `USER_A_STATE` / `USER_B_STATE` only when each is
an untracked, non-symlink regular file outside the repository and mode `0600`.
For User A, deployment operators may instead place the JSON state in the
`USER_A_STATE_JSON` secret. The runner creates a `0600` file in a private
runtime temporary directory, exports its path only to its child processes, and
removes it on exit. Never echo, log, commit, or upload storage-state JSON.

Create disposable approved test state outside the checkout:

```sh
BASE_URL=https://staging.example DISPOSABLE_EMAIL=... DISPOSABLE_PASSWORD=... \
CONFIRM_DISPOSABLE_ACCOUNT=1 OUT="$(mktemp /tmp/niakofa-user-a.XXXXXX)" \
node ops/generate-user-a-state.mjs
```

The generator and validator deliberately avoid printing token or password
contents. `.auth/` and generated acceptance-state directories are ignored.