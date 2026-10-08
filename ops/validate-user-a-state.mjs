#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const stateName = process.argv[3] || "USER_A_STATE";
const statePath = process.argv[2] || process.env[stateName];
const requiredOriginInput = process.argv[4] || "";

function fail(message) {
  console.error(`${stateName} validation failed: ${message}`);
  process.exit(1);
}

if (!statePath) fail(`provide a storage-state path as the first argument or ${stateName}.`);

let requiredOrigin = null;
if (requiredOriginInput) {
  let parsedRequiredOrigin;
  try {
    parsedRequiredOrigin = new URL(requiredOriginInput);
  } catch {
    fail("the required origin must be a credential-free HTTP(S) origin.");
  }
  if (
    !["http:", "https:"].includes(parsedRequiredOrigin.protocol) ||
    parsedRequiredOrigin.username ||
    parsedRequiredOrigin.password ||
    parsedRequiredOrigin.search ||
    parsedRequiredOrigin.hash ||
    parsedRequiredOrigin.pathname !== "/"
  ) {
    fail("the required origin must be a credential-free HTTP(S) origin.");
  }
  requiredOrigin = parsedRequiredOrigin.origin;
}

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const resolvedPath = path.resolve(statePath);
let fileInfo;
try {
  fileInfo = fs.lstatSync(resolvedPath);
} catch {
  fail("the file is missing.");
}
if (fileInfo.isSymbolicLink()) fail("symbolic links are not allowed.");
if (!fileInfo.isFile()) fail("the path must be a regular file.");
if ((fileInfo.mode & 0o077) !== 0) fail("file permissions must be 0600 (not group/world accessible).");
try {
  if (fs.realpathSync(resolvedPath) !== resolvedPath) fail("paths through symbolic links are not allowed.");
} catch {
  fail("the file could not be resolved safely.");
}
const relativePath = path.relative(repositoryRoot, resolvedPath);
const isInsideRepository = relativePath === "" ||
  (relativePath !== ".." && !relativePath.startsWith(`..${path.sep}`) && !path.isAbsolute(relativePath));
if (isInsideRepository) {
  if (!relativePath.startsWith(`.auth${path.sep}`)) {
    fail("in-repository state files are not allowed outside the ignored .auth directory.");
  }

  const { spawnSync } = await import("node:child_process");
  const tracked = spawnSync("git", ["-C", repositoryRoot, "ls-files", "--error-unmatch", "--", relativePath], {
    encoding: "utf8",
    stdio: ["ignore", "ignore", "ignore"],
  });
  if (tracked.status === 0) fail("tracked state files are not allowed.");
  if (tracked.status !== 1) fail("could not verify workspace auth-state tracking.");

  const ignored = spawnSync("git", ["-C", repositoryRoot, "check-ignore", "--quiet", "--", relativePath], {
    encoding: "utf8",
    stdio: ["ignore", "ignore", "ignore"],
  });
  if (ignored.status !== 0) fail("workspace-local state files under .auth must be git-ignored.");
}

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
let requiredOriginFound = false;
let requiredOriginTokenCount = 0;
let requiredOriginUserCount = 0;
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
  const isRequiredOrigin = normalizedOrigin === requiredOrigin;
  if (isRequiredOrigin) requiredOriginFound = true;
  if (!Array.isArray(origin.localStorage)) {
    fail("each origin must contain a localStorage array.");
  }
  for (const entry of origin.localStorage) {
    if (!entry || typeof entry !== "object" || typeof entry.name !== "string" || typeof entry.value !== "string") {
      fail("localStorage entries must contain string name and value fields.");
    }
    if (entry.name === "niakofa_token") {
      tokenCount += 1;
      if (isRequiredOrigin) requiredOriginTokenCount += 1;
      if (!entry.value || entry.value.split(".").length !== 4) fail("niakofa_token is not a Niakofa token shape.");
    }
    if (entry.name === "niakofa_user") {
      userCount += 1;
      if (isRequiredOrigin) requiredOriginUserCount += 1;
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
if (requiredOrigin && !requiredOriginFound) {
  fail("state does not contain the required origin.");
}
if (requiredOrigin && (requiredOriginTokenCount !== 1 || requiredOriginUserCount !== 1)) {
  fail("the required origin must contain the Niakofa authentication entries.");
}

process.stdout.write("PASS: storageState shape ok\n");