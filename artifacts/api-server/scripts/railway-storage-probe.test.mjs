import assert from "node:assert/strict";
import test from "node:test";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { buildRailwayStorageProbeFunction } from "./build-railway-storage-probe-function.mjs";
import { runRailwayStorageProbe } from "./railway-storage-probe-core.mjs";

const validEnvironment = {
  STORAGE_BUCKET: "verified-production-bucket",
  EXPECTED_STORAGE_BUCKET: "verified-production-bucket",
  STORAGE_ENDPOINT: "https://storage.example.invalid",
  STORAGE_REGION: "auto",
  AWS_ACCESS_KEY_ID: "test-access-key",
  AWS_SECRET_ACCESS_KEY: "test-secret-key",
  PROBE_KEY:
    "media-assets/_probe/2026-10-06/11111111-1111-4111-8111-111111111111.txt",
};

test("a target mismatch stops before creating a provider client", async () => {
  let clientCreated = false;
  await assert.rejects(
    runRailwayStorageProbe(
      { ...validEnvironment, STORAGE_BUCKET: "unexpected-bucket" },
      {
        createClient() {
          clientCreated = true;
          throw new Error("must not reach provider");
        },
      },
    ),
    (error) => {
      assert.equal(error.probeCode, "bucket_mismatch");
      assert.match(error.message, /no object written/);
      return true;
    },
  );
  assert.equal(clientCreated, false);
});

test("a non-probe key stops before creating a provider client", async () => {
  let clientCreated = false;
  await assert.rejects(
    runRailwayStorageProbe(
      { ...validEnvironment, PROBE_KEY: "existing/photo.jpg" },
      {
        createClient() {
          clientCreated = true;
          throw new Error("must not reach provider");
        },
      },
    ),
    (error) => {
      assert.equal(error.probeCode, "probe_key_invalid");
      assert.match(error.message, /no object written/);
      return true;
    },
  );
  assert.equal(clientCreated, false);
});

test("uses the shared bounded PUT/HEAD/GET/DELETE/HEAD certification flow", async () => {
  let object;
  const calls = [];
  let destroyed = false;
  const client = {
    async send(command) {
      calls.push(command.constructor.name);
      if (command instanceof PutObjectCommand) {
        object = Buffer.from(command.input.Body);
        return {};
      }
      if (command instanceof HeadObjectCommand) {
        if (object === undefined) {
          const error = new Error("missing");
          error.name = "NotFound";
          error.$metadata = { httpStatusCode: 404 };
          throw error;
        }
        return { ContentLength: object.length };
      }
      if (command instanceof GetObjectCommand) return { Body: object };
      if (command instanceof DeleteObjectCommand) {
        object = undefined;
        return {};
      }
      throw new Error("Unexpected command");
    },
    destroy() {
      destroyed = true;
    },
  };

  const result = await runRailwayStorageProbe(validEnvironment, {
    createClient(options) {
      assert.equal(options.maxAttempts, 1);
      assert.equal(options.forcePathStyle, false);
      assert.equal(options.credentials.accessKeyId, "test-access-key");
      return client;
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.probe, "put-head-get-delete");
  assert.equal(result.deleted, true);
  assert.equal(result.backend, "s3-compatible");
  assert.equal(object, undefined);
  assert.equal(destroyed, true);
  assert.deepEqual(calls, [
    "PutObjectCommand",
    "HeadObjectCommand",
    "GetObjectCommand",
    "DeleteObjectCommand",
    "HeadObjectCommand",
  ]);
});

test("builds a private one-shot Railway Function source without an HTTP server", async () => {
  const source = await buildRailwayStorageProbeFunction();
  assert.match(source, /EXPECTED_STORAGE_BUCKET/);
  assert.match(source, /PROBE_KEY/);
  assert.match(source, /TEMP_STORAGE_PROBE_RESULT/);
  assert.match(source, /PutObjectCommand/);
  assert.match(source, /HeadObjectCommand/);
  assert.match(source, /GetObjectCommand/);
  assert.match(source, /DeleteObjectCommand/);
  assert.match(source, /maxAttempts:\s*1/);
  assert.match(source, /OPERATION_TIMEOUT_MS\s*=\s*(?:6_000|6e3)/);
  assert.match(source, /CLEANUP_ATTEMPTS\s*=\s*3/);
  assert.doesNotMatch(source, /Bun\.serve/);
  assert.doesNotMatch(source, /MEDIA_PLATFORM_V21\s*=/);
});
