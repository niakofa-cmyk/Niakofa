import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { validateUserAStateJson } from "./user-a-state-json-validation.mjs";

const root = path.resolve(import.meta.dirname, "..");
const validatorCli = path.join(root, "ops/validate-user-a-state-json.mjs");
const fixtureToken = "fixture-token-not-for-output";

function validState(origin = "https://niakofa.com") {
  return {
    cookies: [],
    origins: [{
      origin,
      localStorage: [
        { name: "niakofa_token", value: `7.1700000000000.0.${fixtureToken}` },
        { name: "niakofa_user", value: JSON.stringify({ id: 7 }) },
      ],
    }],
  };
}

test("rejects malformed JSON without returning parser details", () => {
  const result = validateUserAStateJson("fixture-private-input-not-json");

  assert.equal(result.jsonValid, false);
  assert.equal(result.storageStateValid, false);
  assert.equal(result.originRestricted, false);
  assert.equal(result.authKeysChecked, false);
  assert.equal(result.authEntriesChecked, false);
  assert.deepEqual(result.authKeys, {
    niakofa_token: false,
    niakofa_user: false,
  });
  assert.equal(result.valid, false);
});

test("rejects origins other than the exact Niakofa production origin", () => {
  const result = validateUserAStateJson(JSON.stringify(validState("https://example.invalid")));

  assert.equal(result.jsonValid, true);
  assert.equal(result.storageStateValid, true);
  assert.equal(result.originRestricted, false);
  assert.equal(result.authKeys.niakofa_token, false);
  assert.equal(result.authKeys.niakofa_user, false);
  assert.equal(result.valid, false);
});

test("rejects storage state missing expected Niakofa auth keys", () => {
  const state = validState();
  state.origins[0].localStorage = [];
  const result = validateUserAStateJson(JSON.stringify(state));

  assert.equal(result.jsonValid, true);
  assert.equal(result.storageStateValid, true);
  assert.equal(result.originRestricted, true);
  assert.equal(result.authKeys.niakofa_token, false);
  assert.equal(result.authKeys.niakofa_user, false);
  assert.equal(result.valid, false);
});

test("accepts a structurally valid Niakofa Playwright storage state", () => {
  const result = validateUserAStateJson(JSON.stringify(validState()));

  assert.deepEqual(result, {
    jsonValid: true,
    storageStateValid: true,
    originRestricted: true,
    authKeysChecked: true,
    authKeys: {
      niakofa_token: true,
      niakofa_user: true,
    },
    authKeysChecked: true,
    authEntriesValid: true,
    authEntriesChecked: true,
    valid: true,
  });
});

test("CLI reports checks without echoing fixture auth data", () => {
  const state = validState();
  const result = spawnSync(process.execPath, [validatorCli], {
    cwd: root,
    encoding: "utf8",
    env: {
      PATH: process.env.PATH,
      USER_A_STATE_JSON: JSON.stringify(state),
    },
  });
  const output = `${result.stdout}\n${result.stderr}`;

  assert.equal(result.status, 0, output);
  assert.match(result.stdout, /PASS: niakofa_token key present \(presence only\)/);
  assert.match(result.stdout, /PASS: niakofa_user key present \(presence only\)/);
  assert.match(result.stdout, /NOT CHECKED session freshness or server acceptance/);
  assert.doesNotMatch(output, /fixture-token-not-for-output/);
  assert.doesNotMatch(output, /"id":7/);
});
