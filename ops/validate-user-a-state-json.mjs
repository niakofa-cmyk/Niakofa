#!/usr/bin/env node

import { validateUserAStateJson } from "./user-a-state-json-validation.mjs";

const raw = process.env.USER_A_STATE_JSON;
const secretAvailable = typeof raw === "string" && raw.length > 0;
const result = validateUserAStateJson(secretAvailable ? raw : "");
const status = (passed) => passed ? "PASS:" : "FAIL:";
const checkedStatus = (checked, passed) =>
  checked ? status(passed) : "NOT CHECKED:";

process.stdout.write("USER_A_STATE_JSON local validation\n");
process.stdout.write(`${status(secretAvailable)} secret available to this runtime process\n`);
process.stdout.write(`${status(result.jsonValid)} valid JSON\n`);
process.stdout.write(`${status(result.storageStateValid)} Playwright storageState structure\n`);
process.stdout.write(`${status(result.originRestricted)} every origin is exactly https://niakofa.com\n`);
process.stdout.write(`${checkedStatus(result.authKeysChecked, result.authKeys.niakofa_token)} niakofa_token key present (presence only)\n`);
process.stdout.write(`${checkedStatus(result.authKeysChecked, result.authKeys.niakofa_user)} niakofa_user key present (presence only)\n`);
process.stdout.write(`${checkedStatus(result.authEntriesChecked, result.authEntriesValid)} auth-entry structure matches local Niakofa conventions\n`);
process.stdout.write("NOT CHECKED session freshness or server acceptance (offline; no request made)\n");
process.stdout.write(`${status(result.valid)} overall structural validation\n`);

if (!result.valid) process.exitCode = 1;
