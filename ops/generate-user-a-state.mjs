#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const baseUrl = process.env.BASE_URL;
const email = process.env.DISPOSABLE_EMAIL;
const password = process.env.DISPOSABLE_PASSWORD;
const outputPath = process.env.OUT;
const disposableConfirmed = process.env.CONFIRM_DISPOSABLE_ACCOUNT === "1";

function fail(message) {
  console.error(`USER_A_STATE generation failed: ${message}`);
  process.exit(1);
}

if (!baseUrl || !email || !password || !outputPath) {
  fail("BASE_URL, DISPOSABLE_EMAIL, DISPOSABLE_PASSWORD, and OUT are required.");
}
if (!disposableConfirmed) {
  fail("set CONFIRM_DISPOSABLE_ACCOUNT=1 only when these credentials belong to an approved disposable account.");
}

let base;
try {
  base = new URL(baseUrl);
  if (!["http:", "https:"].includes(base.protocol)) throw new Error("unsupported protocol");
} catch {
  fail("BASE_URL must be an http(s) URL.");
}

const origin = base.origin;

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
      const detail = typeof body?.error === "string" ? body.error : `HTTP ${response.status}`;
      throw new Error(detail);
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
  fail(`login could not be verified (${error instanceof Error ? error.message : "request error"}).`);
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
  fail(`the returned token did not verify (${error instanceof Error ? error.message : "request error"}).`);
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
const temporaryOutput = `${resolvedOutput}.tmp-${process.pid}`;
try {
  fs.mkdirSync(path.dirname(resolvedOutput), { recursive: true });
  fs.writeFileSync(temporaryOutput, `${JSON.stringify(state, null, 2)}\n`, {
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