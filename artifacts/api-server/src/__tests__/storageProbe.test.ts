import { describe, expect, it } from "@jest/globals";
import {
  runStorageIoProbe,
  type StorageProbeTransport,
} from "../lib/storageProbe";

const completeEnv = {
  NODE_ENV: "production",
  STORAGE_BUCKET: "niakofa-production-media",
  STORAGE_ENDPOINT: "https://storage.example.test",
  STORAGE_REGION: "auto",
  AWS_ACCESS_KEY_ID: "test-access-key",
  AWS_SECRET_ACCESS_KEY: "test-secret-key",
};

describe("storage I/O probe", () => {
  it("fails closed without importing or contacting storage when credentials are incomplete", async () => {
    const result = await runStorageIoProbe({
      STORAGE_BUCKET: "niakofa-production-media",
    });

    expect(result).toMatchObject({
      ok: false,
      error_code: "STORAGE_NOT_CONFIGURED",
      cleanup_attempted: false,
      cleanup_attempts: 0,
    });
  });

  it("cleans up after a HEAD failure", async () => {
    let deleted = 0;
    const transport: StorageProbeTransport = {
      async put() {},
      async head() {
        throw new Error("head unavailable");
      },
      async delete() {
        deleted += 1;
      },
    };

    const result = await runStorageIoProbe(completeEnv, {
      transport,
      now: () => new Date("2026-09-20T19:00:00.000Z"),
      id: () => "probe-id",
    });

    expect(result).toMatchObject({
      ok: false,
      error_code: "STORAGE_PROBE_FAILED",
      cleanup_attempted: true,
      cleanup_succeeded: true,
      cleanup_attempts: 1,
    });
    expect(deleted).toBe(1);
  });

  it("retries cleanup when the provider rejects the first delete", async () => {
    let deleted = 0;
    const transport: StorageProbeTransport = {
      async put() {},
      async head() {
        if (deleted > 0) {
          throw Object.assign(new Error("not found"), {
            name: "NotFound",
            $metadata: { httpStatusCode: 404 },
          });
        }
        return { contentLength: 56 };
      },
      async delete() {
        deleted += 1;
        if (deleted === 1) throw new Error("transient delete failure");
      },
    };

    const result = await runStorageIoProbe(completeEnv, {
      transport,
      now: () => new Date("2026-09-20T19:00:00.000Z"),
      id: () => "probe-id",
    });

    expect(result.ok).toBe(true);
    expect(result).toMatchObject({
      cleanup_attempts: 2,
      deleted: true,
    });
    expect(deleted).toBe(2);
  });

  it("fails closed when post-delete verification hits an unexpected provider error", async () => {
    let deleted = 0;
    const transport: StorageProbeTransport = {
      async put() {},
      async head() {
        if (deleted > 0) {
          throw Object.assign(new Error("storage temporarily unavailable"), {
            $metadata: { httpStatusCode: 503 },
          });
        }
        return { contentLength: 56 };
      },
      async delete() {
        deleted += 1;
      },
    };

    const result = await runStorageIoProbe(completeEnv, {
      transport,
      now: () => new Date("2026-09-20T19:00:00.000Z"),
      id: () => "probe-id",
    });

    expect(result).toMatchObject({
      ok: false,
      error_code: "STORAGE_PROBE_FAILED",
      cleanup_attempted: true,
      cleanup_succeeded: true,
      cleanup_attempts: 1,
    });
    expect(result.ok ? "" : result.error).toMatch(/DELETE verification could not be confirmed/);
  });
});