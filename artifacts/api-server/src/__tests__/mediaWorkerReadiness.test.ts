import { describe, expect, it } from "@jest/globals";
import { getMediaWorkerReadiness } from "../routes/health";

describe("V21 media-worker readiness", () => {
  it("does not add a media-worker requirement while V21 is off", () => {
    expect(getMediaWorkerReadiness(false, [])).toBeUndefined();
  });

  it("fails closed when V21 is on and the worker is missing or not running", () => {
    expect(getMediaWorkerReadiness(true, [])).toMatchObject({
      required: true,
      status: "degraded",
      detail: "BullMQ media-processing worker readiness is missing",
    });
    expect(getMediaWorkerReadiness(true, [
      { name: "media-processing", status: "stopped" },
    ])).toMatchObject({
      required: true,
      status: "degraded",
      detail: "BullMQ media-processing worker readiness is stopped",
    });
    expect(getMediaWorkerReadiness(true, [
      { name: "media-processing", status: "no_redis" },
    ])?.status).toBe("degraded");
  });

  it("is ready only when the registered media worker is running", () => {
    expect(getMediaWorkerReadiness(true, [
      { name: "media-processing", status: "running" },
    ])).toEqual({
      required: true,
      status: "ready",
      detail: "BullMQ media-processing worker registered and initial Redis connection ready",
    });
  });
});