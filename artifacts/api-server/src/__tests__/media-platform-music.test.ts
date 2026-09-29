import {
  buildMomentMusicRightsMetadata,
  isMomentMusicAsset,
  mediaJobsForType,
} from "../lib/media-platform";

describe("Moment background music authorization", () => {
  test("records and accepts a rights attestation only for its owner", () => {
    const metadata = buildMomentMusicRightsMetadata(42, {
      confirmed: true,
      basis: "licensed",
      licenseReference: "https://example.org/license",
    }, new Date("2026-09-29T12:00:00.000Z"));

    expect(isMomentMusicAsset(metadata, 42)).toBe(true);
    expect(isMomentMusicAsset(metadata, 43)).toBe(false);
  });

  test("rejects insecure license references", () => {
    const metadata = buildMomentMusicRightsMetadata(42, {
      confirmed: true,
      basis: "licensed",
      licenseReference: "http://example.org/license",
    });

    expect(isMomentMusicAsset(metadata, 42)).toBe(false);
  });

  test("queues mixing from an asset ID, not a client storage key or boolean", () => {
    expect(mediaJobsForType("video", { music: { track_asset_id: 12 } })).toContain("audio_mix");
    expect(mediaJobsForType("video", {
      music: { track_key: "media-assets/12/other-user.mp3", licensed: true },
    } as never)).not.toContain("audio_mix");
  });
});