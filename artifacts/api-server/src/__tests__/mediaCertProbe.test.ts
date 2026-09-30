import { describe, expect, it } from "@jest/globals";
import { publicProbeStatus, safeProbeFailureReason } from "../routes/media-cert-probe";

describe("admin media certification status", () => {
  const started_at = "2026-09-30T12:00:00.000Z";
  const started = Date.parse(started_at);

  it("does not expose a pending object key while a probe is still running", () => {
    expect(publicProbeStatus({
      status: "running",
      started_at,
      pending_key: "media-assets/_probe/opaque-key",
    }, started + 1000)).toEqual({ status: "running", started_at });
  });

  it("retains the key if the process is interrupted after an attempted write", () => {
    expect(publicProbeStatus({
      status: "running",
      started_at,
      pending_key: "media-assets/_probe/opaque-key",
    }, started + 121_000)).toEqual({
      status: "interrupted",
      started_at,
      cleanup: "unproven",
      manual_cleanup_key: "media-assets/_probe/opaque-key",
    });
  });

  it("does not imply any provider write if the toolchain was still running", () => {
    expect(publicProbeStatus({ status: "running", started_at }, started + 121_000)).toEqual({
      status: "interrupted",
      started_at,
      cleanup: "not_started",
    });
  });

  it("reports only allowlisted failure categories, never provider error details", () => {
    expect(safeProbeFailureReason({ probeCode: "bucket_missing", message: "hidden configuration" }, "storage")).toBe("bucket_missing");
    expect(safeProbeFailureReason({ probeCode: "credentials_missing" }, "storage")).toBe("credentials_missing");
    expect(safeProbeFailureReason({ probeCode: "endpoint-and-secret-value" }, "storage")).toBe("client_or_prewrite_failed");
    expect(safeProbeFailureReason(new Error("provider internal URL"), "storage", "opaque-key")).toBe("provider_or_cleanup_failed");
    expect(safeProbeFailureReason(new Error("binary path"), "toolchain")).toBe("toolchain_failed");
  });
});