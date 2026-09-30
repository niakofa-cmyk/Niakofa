import { describe, expect, it } from "@jest/globals";
import { promises as fs } from "node:fs";
import { escapeMomentSearchTerm, validateMomentCaptionsVtt, validateNewMomentVisualAltText } from "../lib/moment-accessibility";

const storyRoutePath = new URL("../routes/community-stories.ts", import.meta.url);

describe("Moment creator accessibility metadata", () => {
  it("accepts bounded plain-text WebVTT and rejects markup or out-of-range cues", () => {
    expect(validateMomentCaptionsVtt("WEBVTT\n\n00:00:01.000 --> 00:00:02.500\nA neighbor waves hello.")).toBeNull();
    expect(validateMomentCaptionsVtt("WEBVTT\n\n00:00:01.000 --> 00:00:02.000\n<b>Hello</b>"))
      .toMatch(/plain text/);
    expect(validateMomentCaptionsVtt("WEBVTT\n\n00:00:59.000 --> 00:01:01.000\nHello"))
      .toMatch(/60 seconds/);
    expect(validateMomentCaptionsVtt("WEBVTT\n\nnot a cue\nHello")).toMatch(/valid start\/end time/);
  });

  it("escapes wildcard characters before constructing substring search patterns", () => {
    expect(escapeMomentSearchTerm("50%_off\\today")).toBe("50\\%\\_off\\\\today");
  });

  it("rejects missing, blank, or unbounded descriptions for new ordinary visual attachments", () => {
    expect(validateNewMomentVisualAltText([{ media_type: "photo" }], false)).toMatch(/required/);
    expect(validateNewMomentVisualAltText([{ media_type: "video", alt_text: "   " }], false)).toMatch(/required/);
    expect(validateNewMomentVisualAltText([{ media_type: "photo", alt_text: "x".repeat(251) }], false)).toMatch(/250 characters/);
    expect(validateNewMomentVisualAltText([{ media_type: "photo", alt_text: " \u0000 " }], false)).toMatch(/required/);
  });

  it("validates all visual attachments in mixed media and preserves the Exchange exemption", () => {
    const mixedMedia = [
      { media_type: "audio" },
      { media_type: "photo", alt_text: "A neighbor carries a box." },
      { media_type: "video" },
    ];
    expect(validateNewMomentVisualAltText(mixedMedia, false)).toMatch(/required/);
    expect(validateNewMomentVisualAltText([
      mixedMedia[0],
      mixedMedia[1],
      { media_type: "video", alt_text: "A volunteer waves." },
    ], false)).toBeNull();
    expect(validateNewMomentVisualAltText([{ media_type: "video" }], true)).toBeNull();
  });

  it("wires mandatory alt validation to inline and staged assets without weakening server VTT validation", async () => {
    const route = await fs.readFile(storyRoutePath, "utf8");
    expect(route).toMatch(/if \(exchangeListingId === null\) \{\s+const altTextError = validateNewMomentVisualAltText\(parsed\.data\.media, false\)/);
    expect(route).toMatch(/accessibilityByAssetId\.get\(asset\.id\)\?\.alt_text/);
    expect(route).toMatch(/if \(exchangeListingId === null\) \{\s+const altTextError = validateNewMomentVisualAltText\(stagedAssets/);
    expect(route.match(/if \(altTextError\) return res\.status\(400\)\.json\(\{ error: altTextError \}\);/g)).toHaveLength(2);
    expect(route).toMatch(/validateMomentCaptionsVtt\(accessibility\.captions_vtt, \(asset\.duration_ms \?\? 60_000\) \/ 1000\)/);
    expect(route).toMatch(/validateMomentCaptionsVtt\(item\.captions_vtt, \(item\.metadata\?\.duration_ms \?\? 60_000\) \/ 1000\)/);
  });
});