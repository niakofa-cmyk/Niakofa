import assert from "node:assert/strict";
import { createServer } from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const helper = path.join(root, "ops/railway-bucket-object.mjs");
const objectKey = "test-auth/user-a/niakofa-state.json";
// Railway's generated S3 bucket name is distinct from its display name.
const bucket = "niakofa-media-prod-unique-123";
const fakeState = '{"fixture":"not-a-real-session"}';

async function startServer() {
  const requests = [];
  const server = createServer((request, response) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      requests.push({
        method: request.method,
        url: request.url,
        headers: request.headers,
        body: Buffer.concat(chunks),
      });
      response.writeHead(200, { "content-length": String(Buffer.byteLength(fakeState)) });
      response.end(fakeState);
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    server,
    requests,
    endpoint: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

function runHelper(server, operation, filePath, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [helper, operation, objectKey, filePath], {
      env: {
        PATH: process.env.PATH,
        HOME: os.tmpdir(),
        STORAGE_BUCKET: bucket,
        STORAGE_ENDPOINT: server.endpoint,
        STORAGE_REGION: "auto",
        AWS_ACCESS_KEY_ID: "fixture-access",
        AWS_SECRET_ACCESS_KEY: "fixture-secret-value",
        CERTIFICATION_S3_URL_STYLE: "path",
        ...extraEnv,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (status, signal) => resolve({ status, signal, stdout, stderr }));
  });
}

function makePrivateTempDirectory() {
  const directory = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "railway-bucket-test-"));
  fs.chmodSync(directory, 0o700);
  return directory;
}

test("downloads the fixed state key into a private file without printing its contents", async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const directory = makePrivateTempDirectory();
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const destination = path.join(directory, "state.json");

  const result = await runHelper(server, "get", destination);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.readFileSync(destination, "utf8"), fakeState);
  assert.equal(fs.statSync(destination).mode & 0o777, 0o600);
  assert.equal(server.requests[0].method, "GET");
  assert.equal(server.requests[0].url, `/${bucket}/${objectKey}`);
  assert.equal(server.requests[0].headers["x-amz-acl"], undefined);
  assert.doesNotMatch(result.stdout + result.stderr, /fixture-secret-value|not-a-real-session/);
});

test("uploads only a private local state file to the fixed key without a public ACL", async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const directory = makePrivateTempDirectory();
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const source = path.join(directory, "state.json");
  fs.writeFileSync(source, fakeState, { mode: 0o600 });
  fs.chmodSync(source, 0o600);

  const result = await runHelper(server, "put", source);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(server.requests[0].method, "PUT");
  assert.equal(server.requests[0].url, `/${bucket}/${objectKey}`);
  assert.equal(server.requests[0].body.toString("utf8"), fakeState);
  assert.equal(server.requests[0].headers["x-amz-acl"], undefined);
  assert.doesNotMatch(result.stdout + result.stderr, /fixture-secret-value|not-a-real-session/);
});

test("refuses bucket state access when a CDN URL is configured", async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const directory = makePrivateTempDirectory();
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));

  const result = await runHelper(server, "get", path.join(directory, "state.json"), {
    STORAGE_CDN_URL: "https://public.example.invalid/",
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /refusing state I\/O while STORAGE_CDN_URL is configured/);
  assert.equal(server.requests.length, 0);
  assert.doesNotMatch(result.stderr, /public\.example\.invalid|fixture-secret-value/);
});