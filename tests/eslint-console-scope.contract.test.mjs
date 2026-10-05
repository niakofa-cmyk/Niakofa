import assert from "node:assert/strict";
import path from "node:path";
import { ESLint } from "eslint";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const eslint = new ESLint({ overrideConfigFile: path.join(root, "eslint.config.mjs") });

async function noConsoleRule(relativePath) {
  const config = await eslint.calculateConfigForFile(path.join(root, relativePath));
  assert.ok(config, `ESLint should calculate a config for ${relativePath}`);
  return config.rules["no-console"];
}

test("keeps console warnings in app code and limits the ops exception to the bucket helper", async () => {
  const appRule = await noConsoleRule("artifacts/pay-it-forward/src/App.tsx");
  const helperRule = await noConsoleRule("ops/railway-bucket-object.mjs");
  const unrelatedOpsRule = await noConsoleRule("ops/generate-user-a-state.mjs");

  assert.equal(appRule[0], 1, "app console use must remain a lint warning");
  assert.deepEqual(appRule[1], { allow: ["warn", "error"] });
  assert.equal(helperRule[0], 0, "the focused bucket CLI may report its pass status");
  assert.equal(unrelatedOpsRule[0], 1, "other ops scripts must not inherit the helper exception");
});
