import { describe, expect, it } from "@jest/globals";
import { classifyMediaChunkFailure } from "../lib/media-upload-failure";

describe("privacy-safe media upload failure classification", () => {
  it.each([
    [400, "storage_rejected"],
    [401, "storage_authorization"],
    [403, "storage_authorization"],
    [404, "storage_missing_object"],
    [408, "storage_timeout"],
    [429, "storage_throttled"],
    [503, "storage_upstream_failure"],
  ] as const)("maps provider HTTP %i to a fixed category", (httpStatusCode, expected) => {
    expect(classifyMediaChunkFailure("storage_put", {
      $metadata: { httpStatusCode },
      message: "private provider details must not be returned",
    })).toBe(expected);
  });

  it.each([
    ["ETIMEDOUT", "storage_network_failure"],
    ["ECONNRESET", "storage_network_failure"],
    ["untrusted provider error text", "storage_provider_unknown"],
  ] as const)("classifies provider code %s without exposing it", (code, expected) => {
    const result = classifyMediaChunkFailure("storage_put", {
      code,
      message: "private object key and provider response",
    });
    expect(result).toBe(expected);
    expect(result).not.toMatch(/private|object|provider response/i);
  });

  it.each([
    ["08006", "database_connection"],
    ["23503", "database_constraint"],
    ["28P01", "database_authentication"],
    ["42P01", "database_schema"],
    ["40001", "database_transaction"],
    ["57P01", "database_operator"],
    ["XX000", "database_query"],
  ] as const)("maps SQLSTATE %s to a fixed category", (code, expected) => {
    expect(classifyMediaChunkFailure("database_commit", {
      code,
      detail: "private SQL values must not be returned",
    })).toBe(expected);
  });

  it("keeps provider status out of database classifications and defaults safely", () => {
    expect(classifyMediaChunkFailure("database_ledger", {
      $metadata: { httpStatusCode: 503 },
      message: "private error",
    })).toBe("database_unknown");
    expect(classifyMediaChunkFailure("database_lock", new Error("sensitive details")))
      .toBe("database_unknown");
  });
});