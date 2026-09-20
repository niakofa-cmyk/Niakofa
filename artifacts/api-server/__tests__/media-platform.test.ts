import { describe, expect, it } from "@jest/globals";
import {
  assertSupportedMediaJob,
  isMediaPlatformV21Enabled,
  mediaJobsForType,
} from "../src/lib/media-platform";

describe("universal media foundation", () => {
  it("stays disabled unless the explicit opt-in flag is set", () => {
    const previous = process.env.MEDIA_PLATFORM_V21;
    delete process.env.MEDIA_PLATFORM_V21;
    expect(isMediaPlatformV21Enabled()).toBe(false);
    process.env.MEDIA_PLATFORM_V21 = "1";
    expect(isMediaPlatformV21Enabled()).toBe(true);
    if (previous === undefined) delete process.env.MEDIA_PLATFORM_V21;
    else process.env.MEDIA_PLATFORM_V21 = previous;
  });

  it("uses deterministic processing contracts by media type", () => {
    expect(mediaJobsForType("photo")).toEqual(["probe", "thumbnail"]);
    expect(mediaJobsForType("video")).toEqual(["probe", "thumbnail", "transcode"]);
    expect(mediaJobsForType("audio")).toEqual(["probe"]);
  });

  it("fails closed for the unlicensed audio mixer", () => {
    expect(() => assertSupportedMediaJob("audio_mix")).toThrow("audio_mix is disabled");
  });
});