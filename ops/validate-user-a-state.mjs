#!/usr/bin/env node

import fs from "node:fs";

const statePath = process.argv[2] || process.env.USER_A_STATE;

function fail(message) {
  console.error(`USER_A_STATE validation failed: ${message}`);
  process.exit(1);
}

if (!statePath) fail("provide a storage-state path as the first argument or USER_A_STATE.");

let state;
try {
  state = JSON.parse(fs.readFileSync(statePath, "utf8"));
} catch {
  fail("the file is missing or is not valid JSON.");
}

if (!state || typeof state !== "object" || Array.isArray(state)) {
  fail("the root must be an object.");
}
if (!Array.isArray(state.cookies) || !Array.isArray(state.origins)) {
  fail("storage state must contain cookies and origins arrays.");
}
if (state.cookies.some((cookie) => !cookie || typeof cookie !== "object")) {
  fail("cookies must contain objects.");
}
if (state.cookies.some((cookie) => /password|passwd|secret|reset.?code/i.test(String(cookie.name ?? "")))) {
  fail("cookies must not contain password, secret, or reset-code fields.");
}
if (state.origins.length === 0) fail("origins must not be empty.");

let tokenCount = 0;
let userCount = 0;
const origins = new Set();
for (const origin of state.origins) {
  if (!origin || typeof origin !== "object" || typeof origin.origin !== "string") {
    fail("each origin must contain an origin string.");
  }
  let parsedOrigin;
  try {
    parsedOrigin = new URL(origin.origin);
  } catch {
    fail("each origin must be a valid URL.");
  }
  if (!["http:", "https:"].includes(parsedOrigin.protocol) || parsedOrigin.username || parsedOrigin.password || parsedOrigin.search || parsedOrigin.hash) {
    fail("origins must be credential-free http(s) origins without query, hash, or path data.");
  }
  if (parsedOrigin.pathname !== "/") fail("origins must contain only the origin, not a path.");
  const normalizedOrigin = parsedOrigin.origin;
  if (origins.has(normalizedOrigin)) fail("storage state must not repeat an origin.");
  origins.add(normalizedOrigin);
  if (!Array.isArray(origin.localStorage)) {
    fail("each origin must contain a localStorage array.");
  }
  for (const entry of origin.localStorage) {
    if (!entry || typeof entry !== "object" || typeof entry.name !== "string" || typeof entry.value !== "string") {
      fail("localStorage entries must contain string name and value fields.");
    }
    if (entry.name === "niakofa_token") {
      tokenCount += 1;
      if (!entry.value || entry.value.split(".").length !== 4) fail("niakofa_token is not a Niakofa token shape.");
    }
    if (entry.name === "niakofa_user") {
      userCount += 1;
      let user;
      try { user = JSON.parse(entry.value); } catch { fail("niakofa_user is not valid JSON."); }
      if (!user || typeof user !== "object" || !Number.isInteger(Number(user.id)) || Number(user.id) <= 0) {
        fail("niakofa_user does not contain a valid user id.");
      }
    }
    if (/password|passwd|secret/i.test(entry.name)) {
      fail("state must not contain password or secret fields.");
    }
    if (entry.name === "niakofa_user") {
      let user;
      try { user = JSON.parse(entry.value); } catch { fail("niakofa_user is not valid JSON."); }
      const inspectKeys = (value) => {
        if (!value || typeof value !== "object") return;
        for (const [key, nested] of Object.entries(value)) {
          if (/password|passwd|secret|reset.?code/i.test(key)) {
            fail("niakofa_user must not contain password, secret, or reset-code fields.");
          }
          inspectKeys(nested);
        }
      };
      inspectKeys(user);
    }
  }
}

if (tokenCount !== 1 || userCount !== 1) {
  fail("state must contain exactly one niakofa_token and one niakofa_user entry.");
}

process.stdout.write("PASS: storageState shape ok\n");