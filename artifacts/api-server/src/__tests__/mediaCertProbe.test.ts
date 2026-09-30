import { describe, expect, it } from "@jest/globals";
import { publicProbeStatus } from "../routes/media-cert-probe";

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
});