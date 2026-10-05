#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { readHiddenPassword } from "./read-hidden-password.mjs";
import { serializeStorageState } from "./user-state-serialization.mjs";

const baseUrl = process.env.BASE_URL;
const email = process.env.DISPOSABLE_EMAIL?.trim();
let password = process.env.DISPOSABLE_PASSWORD;
const outputPath = process.env.OUT;
const disposableConfirmed = process.env.CONFIRM_DISPOSABLE_ACCOUNT === "1";
const promptPassword = process.env.PROMPT_PASSWORD === "1";

function fail(message) {
  console.error(`USER_A_STATE generation failed: ${message}`);
  process.exit(1);
}

if (!baseUrl || !email || !outputPath) {
  fail("BASE_URL, DISPOSABLE_EMAIL, and OUT are required.");
}
if (!disposableConfirmed) {
  fail("set CONFIRM_DISPOSABLE_ACCOUNT=1 only when these credentials belong to an approved disposable account.");
}

let base;
try {
  base = new URL(baseUrl);
  if (!["http:", "https:"].includes(base.protocol) || base.username || base.password
    || base.search || base.hash || base.pathname !== "/") {
    throw new Error("unsupported URL");
  }
} catch {
  fail("BASE_URL must be a credential-free http(s) origin.");
}

const origin = base.origin;

if (promptPassword) {
  try {
    password = await readHiddenPassword();
  } catch {
    fail("password prompt could not be completed.");
  }
}

if (!password) {
  fail("DISPOSABLE_PASSWORD is required, or set PROMPT_PASSWORD=1 to enter it interactively.");
}

async function requestJson(pathname, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(new URL(pathname, origin), {
      ...options,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(options.headers ?? {}),
      },
      signal: controller.signal,
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const rawCode = typeof body?.error_code === "string" ? body.error_code : "";
      const code = /^[A-Z][A-Z0-9_]{0,63}$/.test(rawCode) ? rawCode : "";
      const retryAfter = Number(body?.retry_after_sec);
      const safeRetryAfter = Number.isSafeInteger(retryAfter) && retryAfter > 0 && retryAfter <= 604800
        ? retryAfter
        : null;
      const message = response.status === 401
        ? "authentication was rejected"
        : response.status === 429
          ? "authentication is rate limited or the account is locked"
          : "authentication request failed";
      const details = [
        `HTTP ${response.status}`,
        code ? `code=${code}` : "",
        message,
        safeRetryAfter === null ? "" : `retry_after_sec=${safeRetryAfter}`,
      ].filter(Boolean).join("; ");
      const error = new Error(details);
      error.status = response.status;
      throw error;
    }
    return body;
  } finally {
    clearTimeout(timeout);
  }
}

let login;
try {
  login = await requestJson("/api/users/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
} catch (error) {
  if (error instanceof Error && Number.isInteger(error.status)) {
    fail(`login could not be verified (${error.message}).`);
  }
  fail("login request could not be completed; response details were not logged.");
}

const token = typeof login?.token === "string" ? login.token : "";
const userId = Number(login?.user?.id);
if (!token || !Number.isInteger(userId) || userId <= 0) {
  fail("login did not return a valid authenticated user.");
}

let verifiedUser;
try {
  verifiedUser = await requestJson(`/api/users/${userId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
} catch (error) {
  if (error instanceof Error && Number.isInteger(error.status)) {
    fail(`the returned token did not verify (${error.message}).`);
  }
  fail("the returned token could not be verified; response details were not logged.");
}

if (verifiedUser?.approval_status !== "approved") {
  fail("the account is not approved; use a genuinely disposable approved account.");
}

function containsSensitiveKey(value) {
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(([key, nested]) =>
    /password|passwd|secret|reset.?code/i.test(key) || containsSensitiveKey(nested)
  );
}

if (containsSensitiveKey(login.user)) {
  fail("the login response contained sensitive fields; refusing to write storage state.");
}

const state = {
  cookies: [],
  origins: [
    {
      origin,
      localStorage: [
        { name: "niakofa_token", value: token },
        { name: "niakofa_user", value: JSON.stringify(login.user) },
      ],
    },
  ],
};

const resolvedOutput = path.resolve(outputPath);
const repoRoot = path.resolve(import.meta.dirname, "..");
if (resolvedOutput === repoRoot || resolvedOutput.startsWith(`${repoRoot}${path.sep}`)) {
  fail("OUT must be outside the repository; use a runtime temporary directory.");
}
const temporaryOutput = `${resolvedOutput}.tmp-${process.pid}`;
let serializedState;
try {
  serializedState = serializeStorageState(state);
} catch (error) {
  fail(error instanceof Error ? error.message : "storage state exceeded its configured size limit.");
}

try {
  fs.mkdirSync(path.dirname(resolvedOutput), { recursive: true });
  fs.writeFileSync(temporaryOutput, serializedState, {
    encoding: "utf8",
    mode: 0o600,
  });
  fs.chmodSync(temporaryOutput, 0o600);
  fs.renameSync(temporaryOutput, resolvedOutput);
} catch (error) {
  try { fs.rmSync(temporaryOutput, { force: true }); } catch {}
  fail(`could not write ${outputPath} (${error instanceof Error ? error.message : "write error"}).`);
}

process.stdout.write(`PASS: storage state written to ${outputPath}\n`);