import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chmod, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const materializer = path.join(root, "ops/materialize-storage-state.mjs");

async function privateDirectory(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "niakofa-state-materialize-"));
  await chmod(directory, 0o700);
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

function runMaterializer(input, outputPath, maxBytes = "16384") {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [materializer, outputPath], {
      cwd: root,
      env: { USER_A_STATE_MAX_BYTES: maxBytes },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (status) => resolve({ status, stdout, stderr }));
    child.stdin.end(input);
  });
}

test("materializes compact storage-state JSON with private file permissions", async (t) => {
  const directory = await privateDirectory(t);
  const outputPath = path.join(directory, "user-a.json");
  const state = {
    cookies: [],
    origins: [{
      origin: "https://example.test",
      localStorage: [{ name: "niakofa_token", value: "fixture-token-not-for-logs" }],
    }],
  };

  const result = await runMaterializer(JSON.stringify(state, null, 2), outputPath);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, `${outputPath}\n`);
  assert.equal(await readFile(outputPath, "utf8"), JSON.stringify(state));
  assert.equal((await stat(outputPath)).mode & 0o777, 0o600);
  assert.doesNotMatch(`${result.stdout}${result.stderr}`, /fixture-token-not-for-logs/);
});

test("rejects oversized compact state before creating a file and does not log its contents", async (t) => {
  const directory = await privateDirectory(t);
  const outputPath = path.join(directory, "oversized.json");
  const input = JSON.stringify({ value: `private-fixture-${"x".repeat(100)}` });

  const result = await runMaterializer(input, outputPath, "32");

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /configured limit is 32 bytes/);
  assert.doesNotMatch(`${result.stdout}${result.stderr}`, /private-fixture/);
  await assert.rejects(readFile(outputPath), { code: "ENOENT" });
});

test("rejects malformed state JSON without echoing the input", async (t) => {
  const directory = await privateDirectory(t);
  const outputPath = path.join(directory, "malformed.json");
  const result = await runMaterializer("private-fixture-not-json", outputPath);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /not valid JSON/);
  assert.doesNotMatch(`${result.stdout}${result.stderr}`, /private-fixture-not-json/);
  await assert.rejects(readFile(outputPath), { code: "ENOENT" });
});

test("does not overwrite an existing state file", async (t) => {
  const directory = await privateDirectory(t);
  const outputPath = path.join(directory, "existing.json");
  await writeFile(outputPath, "existing-state");
  const result = await runMaterializer(JSON.stringify({ cookies: [], origins: [] }), outputPath);

  assert.notEqual(result.status, 0);
  assert.equal(await readFile(outputPath, "utf8"), "existing-state");
});

test("all acceptance paths that materialize JSON use the shared size-limited serializer", async () => {
  const materializingRunners = [
    "ops/run-request-arrival-acceptance.sh",
    "ops/run-deployed-acceptance.sh",
    "ops/run-media-production-certification.sh",
  ];

  for (const relativePath of materializingRunners) {
    const source = await readFile(path.join(root, relativePath), "utf8");
    assert.match(source, /materialize-storage-state\.mjs/, `${relativePath} must use the shared materializer`);
    assert.doesNotMatch(
      source,
      /printf\s+['"]%s['"]\s+"\$USER_[AB]_STATE_JSON"\s*>/,
      `${relativePath} must not write raw JSON environment values directly`,
    );
  }

  const stateBuilder = await readFile(path.join(root, "ops/build-media-certification-states.mjs"), "utf8");
  assert.match(stateBuilder, /serializeStorageState/);
  assert.doesNotMatch(stateBuilder, /JSON\.stringify\(state\)\s*,\s*\{\s*flag:\s*["']wx/);

  const v21Runner = await readFile(path.join(root, "ops/run-media-v21-resume-compose-certification.sh"), "utf8");
  assert.match(v21Runner, /Refusing V21 resume\/compose certification: supply approved 0600 state files/);
});
