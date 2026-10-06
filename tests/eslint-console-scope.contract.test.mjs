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

test("rejects empty promise catch callbacks in API, Nia, and frontend code", async () => {
  const arrowResult = await eslint.lintText("Promise.resolve().catch(() => {});", {
    filePath: path.join(root, "artifacts/api-server/src/__empty_catch_fixture__.ts"),
  });
  const functionResult = await eslint.lintText("Promise.resolve().catch(function onFailure() {});", {
    filePath: path.join(root, "artifacts/nia-service/src/__empty_catch_fixture__.ts"),
  });
  const frontendResult = await eslint.lintText("Promise.resolve().catch(() => {});", {
    filePath: path.join(root, "artifacts/pay-it-forward/src/__empty_catch_fixture__.tsx"),
  });
  const apiBareCatchResult = await eslint.lintText("try { throw new Error('fixture'); } catch {}", {
    filePath: path.join(root, "artifacts/api-server/src/__empty_catch_fixture__.ts"),
  });
  const niaBareCatchResult = await eslint.lintText("try { throw new Error('fixture'); } catch {}", {
    filePath: path.join(root, "artifacts/nia-service/src/__empty_catch_fixture__.ts"),
  });
  const frontendBareCatchResult = await eslint.lintText("try { throw new Error('fixture'); } catch {}", {
    filePath: path.join(root, "artifacts/pay-it-forward/src/__empty_catch_fixture__.tsx"),
  });

  assert.ok(
    arrowResult[0].messages.some((message) => message.ruleId === "no-restricted-syntax"),
    "empty arrow catch callbacks must be reported",
  );
  assert.ok(
    functionResult[0].messages.some((message) => message.ruleId === "no-restricted-syntax"),
    "empty function catch callbacks must be reported",
  );
  assert.ok(
    frontendResult[0].messages.some((message) => message.ruleId === "no-restricted-syntax"),
    "frontend empty arrow catch callbacks must be reported",
  );
  for (const [result, area] of [
    [apiBareCatchResult, "API"],
    [niaBareCatchResult, "Nia"],
    [frontendBareCatchResult, "frontend"],
  ]) {
    assert.ok(
      result[0].messages.some((message) => message.ruleId === "no-empty"),
      `${area} empty try/catch blocks must be reported`,
    );
  }

  const documentedFallback = await eslint.lintText(
    "try { throw new Error('fixture'); } catch { /* intentional: use the fallback value */ }",
    { filePath: path.join(root, "artifacts/api-server/src/__empty_catch_fixture__.ts") },
  );
  assert.ok(
    documentedFallback[0].messages.every((message) => message.ruleId !== "no-empty"),
    "a comment-only catch with an explicit fallback rationale is accepted",
  );
});
