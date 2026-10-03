#!/usr/bin/env node

// Creates temporary Playwright storage states without writing tokens to logs or
// the repository. Run only with rotated, securely supplied disposable credentials.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = process.env.MEDIA_CERT_STATE_DIR;
const baseUrl = process.env.BASE_URL;
const expectedCommit = process.env.EXPECTED_COMMIT?.toLowerCase();
const accounts = [
  { label: "A", email: process.env.MEDIA_CERT_A_EMAIL, password: process.env.MEDIA_CERT_A_PASSWORD },
  { label: "B", email: process.env.MEDIA_CERT_B_EMAIL, password: process.env.MEDIA_CERT_B_PASSWORD },
];

function refuse(message) {
  console.error(`State creation refused: ${message}`);
  process.exitCode = 1;
}

if (process.env.ALLOW_MEDIA_CERT_STATE_CREATION !== "1") {
  refuse("explicit operator approval is required.");
} else if (!baseUrl || !/^https:\/\//.test(baseUrl) || !/^[0-9a-f]{40}$/.test(expectedCommit ?? "")) {
  refuse("an HTTPS BASE_URL and the full EXPECTED_COMMIT are required.");
} else if (!outputDir || !path.isAbsolute(outputDir)
  || path.resolve(outputDir) === root
  || path.resolve(outputDir).startsWith(`${root}${path.sep}`)) {
  refuse("MEDIA_CERT_STATE_DIR must be an absolute directory outside the repository.");
} else if (accounts.some(({ email, password }) => !email || !password) || accounts[0].email === accounts[1].email) {
  refuse("two distinct disposable account emails and securely supplied passwords are required.");
} else {
  const written = [];
  try {
    const dir = fs.realpathSync(outputDir);
    if (dir !== path.resolve(outputDir) || (fs.statSync(dir).mode & 0o077) !== 0) {
      throw new Error("the output directory must be private (0700) with no symlinks.");
    }
    const origin = new URL(baseUrl).origin;
    if (origin !== baseUrl.replace(/\/$/, "")) throw new Error("BASE_URL must be an origin without a path.");
    const version = await fetch(new URL("/api/version", origin), { redirect: "error" });
    if (!version.ok || String((await version.json()).commit ?? "").toLowerCase() !== expectedCommit) {
      throw new Error("the served commit does not match EXPECTED_COMMIT.");
    }
    const users = [];
    for (const { label, email, password } of accounts) {
      const response = await fetch(new URL("/api/users/login", origin), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        redirect: "error",
      });
      if (!response.ok) throw new Error(`account ${label} sign-in was refused (HTTP ${response.status}).`);
      const { token, user } = await response.json();
      if (!user || !Number.isSafeInteger(Number(user.id)) || user.approval_status !== "approved" ||
          user.is_suspended === true ||
          typeof token !== "string" || token.split(".").length !== 4) {
        throw new Error(`account ${label} is not an approved account with a valid session shape.`);
      }
      if (!Object.hasOwn(user, "community_id")) {
        throw new Error(`account ${label} does not expose a community identity.`);
      }
      const communityId = user.community_id === null ? null : Number(user.community_id);
      if (communityId !== null && (!Number.isSafeInteger(communityId) || communityId < 1)) {
        throw new Error(`account ${label} has an invalid community identity.`);
      }
      const userId = Number(user.id);
      if (users.some((identity) => identity.id === userId)) {
        throw new Error("both accounts resolve to the same user.");
      }
      if (users.length && users[0].communityId === communityId) {
        throw new Error("the approved accounts must belong to different communities.");
      }
      users.push({ id: userId, communityId });
      const state = {
        cookies: [],
        origins: [{
          origin,
          localStorage: [
            { name: "niakofa_token", value: token },
            { name: "niakofa_user", value: JSON.stringify(user) },
          ],
        }],
      };
      const statePath = path.join(dir, `media-cert-${label.toLowerCase()}.json`);
      fs.writeFileSync(statePath, JSON.stringify(state), { flag: "wx", mode: 0o600 });
      written.push(statePath);
      const check = spawnSync(process.execPath, [path.join(root, "ops/validate-user-a-state.mjs"), statePath, `USER_${label}_STATE`], {
        cwd: root, stdio: "ignore",
      });
      if (check.status !== 0) throw new Error(`account ${label} state failed the storage-state validator.`);
    }
    process.stdout.write("PASS: approved storage states from different communities were created and validated in the private output directory.\n");
  } catch (error) {
    for (const filename of written) fs.rmSync(filename, { force: true });
    refuse(error instanceof Error ? error.message : "state creation failed.");
  }
}