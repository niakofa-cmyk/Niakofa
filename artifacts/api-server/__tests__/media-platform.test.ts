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

  it("only schedules audio mixing for an explicitly licensed composition track", () => {
    expect(mediaJobsForType("video")).not.toContain("audio_mix");
    expect(mediaJobsForType("video", {
      version: 1,
      canvas: { width: 1080, height: 1920, aspect: "9:16" },
      elements: [],
      music: { track_key: "media-assets/track-1", licensed: true },
    })).toContain("audio_mix");
    expect(() => assertSupportedMediaJob("audio_mix")).not.toThrow();
  });
});