import { describe, expect, it } from "@jest/globals";
import { getStorageReadiness } from "../lib/storageReadiness";

describe("storage readiness", () => {
  it("keeps production media safe while the flag is off", () => {
    const readiness = getStorageReadiness({
      NODE_ENV: "production",
      MEDIA_PLATFORM_V21: "0",
    });

    expect(readiness.backend).toBe("local");
    expect(readiness.description).toBe("local-disk");
    expect(readiness.production_media_safe).toBe(true);
    expect(readiness.missing).toEqual([]);
  });

  it("reports incomplete cloud configuration without exposing values", () => {
    const readiness = getStorageReadiness({
      NODE_ENV: "production",
      MEDIA_PLATFORM_V21: "1",
      STORAGE_BUCKET: "niakofa-production-media-hash",
      STORAGE_ENDPOINT: "https://t3.storageapi.dev",
      AWS_ACCESS_KEY_ID: "access-key",
    });

    expect(readiness.backend).toBe("s3");
    expect(readiness.description).toBe(
      "s3-compatible:niakofa-production-media-hash",
    );
    expect(readiness.production_media_safe).toBe(false);
    expect(readiness.missing).toEqual([
      "STORAGE_REGION",
      "AWS_SECRET_ACCESS_KEY",
    ]);
    expect(readiness).not.toHaveProperty("AWS_SECRET_ACCESS_KEY");
  });

  it("accepts a complete Railway-compatible configuration", () => {
    const readiness = getStorageReadiness({
      NODE_ENV: "production",
      MEDIA_PLATFORM_V21: "1",
      STORAGE_BUCKET: "niakofa-production-media-hash",
      STORAGE_ENDPOINT: "https://t3.storageapi.dev",
      STORAGE_REGION: "auto",
      AWS_ACCESS_KEY_ID: "access-key",
      AWS_SECRET_ACCESS_KEY: "secret-key",
    });

    expect(readiness.cloud_configured).toBe(true);
    expect(readiness.credentials_present).toBe(true);
    expect(readiness.production_media_safe).toBe(true);
    expect(readiness.missing).toEqual([]);
  });

  it("treats a whitespace-only bucket as local mode", () => {
    const readiness = getStorageReadiness({
      STORAGE_BUCKET: "   ",
      STORAGE_ENDPOINT: "https://t3.storageapi.dev",
    });

    expect(readiness.backend).toBe("local");
    expect(readiness.cloud_configured).toBe(false);
  });
});