import { describe, expect, it } from "@jest/globals";
import { mediaStorageKeys } from "../src/lib/media-cleanup";
import {
  MOMENT_COMPOSE_INTENT,
  isPublishedStoryMediaContext,
  isUnfinishedResumableUpload,
  momentComposeAttemptOutputKey,
  momentClipNormalizeArgs,
  momentCompositionAttemptOwnsJob,
  momentCompositionFingerprint,
  momentConcatArgs,
  reconcileMomentCompositionPromotion,
  withDurableCleanupLedger,
  validMomentComposeIds,
  withinMomentDurationLimit,
} from "../src/lib/moment-video-compose";

describe("opt-in Moment camera-clip composition contract", () => {
  it("accepts attached source media only after it has been rebound to the published Story context", () => {
    expect(isPublishedStoryMediaContext("story", 55, 55)).toBe(true);
    expect(isPublishedStoryMediaContext("community_moment", 55, 55)).toBe(false);
    expect(isPublishedStoryMediaContext("hub_moment", 55, 55)).toBe(false);
    expect(isPublishedStoryMediaContext("story", 56, 55)).toBe(false);
  });

  it("does not treat empty or partially uploaded resumable sessions as stale legacy assets", () => {
    expect(isUnfinishedResumableUpload(false, 0)).toBe(true);
    expect(isUnfinishedResumableUpload(false, 128 * 1024)).toBe(true);
    expect(isUnfinishedResumableUpload(true, 128 * 1024)).toBe(false);
    expect(isUnfinishedResumableUpload(false, -1)).toBe(false);
  });

  it("fences composition promotion by the claimed processing attempt and writes to attempt-unique keys", () => {
    expect(momentCompositionAttemptOwnsJob("processing", 4, 4)).toBe(true);
    expect(momentCompositionAttemptOwnsJob("processing", 5, 4)).toBe(false);
    expect(momentCompositionAttemptOwnsJob("queued", 4, 4)).toBe(false);
    expect(momentComposeAttemptOutputKey(22, 4)).not.toBe(momentComposeAttemptOutputKey(22, 5));
    expect(momentComposeAttemptOutputKey(22, 4)).toBe("media-assets/22/moment-compose-attempt-4.mp4");
  });

  it("leaves a committed tombstone key when PUT succeeds but its transaction rolls back", async () => {
    const key = momentComposeAttemptOutputKey(22, 7);
    const committedCleanupKeys: string[] = [];
    const providerObjects = new Set<string>();
    await expect(withDurableCleanupLedger(
      key,
      async (ledgerKey) => {
        committedCleanupKeys.push(ledgerKey);
        return true;
      },
      async () => {
        providerObjects.add(key); // Provider PUT succeeded.
        throw new Error("simulated DB rollback/crash after PUT");
      },
    )).rejects.toThrow("simulated DB rollback/crash after PUT");

    const tombstoneKeys = mediaStorageKeys({
      id: 22,
      original_key: "media-assets/moment-compositions/placeholder.mp4",
      cleanup_keys: committedCleanupKeys,
    });
    expect(tombstoneKeys).toContain(key);
    for (const cleanupKey of tombstoneKeys) providerObjects.delete(cleanupKey);
    expect(providerObjects.has(key)).toBe(false);
  });

  it("preserves a promoted key after commit acknowledgment loss but deletes it after a real rollback", async () => {
    const key = momentComposeAttemptOutputKey(22, 8);
    const deleted: string[] = [];
    const committed = await reconcileMomentCompositionPromotion(
      key,
      8,
      async () => ({
        job_status: "completed",
        job_attempt: 8,
        asset_status: "ready",
        variant_key: key,
        composition_status: "ready",
      }),
      async (outputKey) => { deleted.push(outputKey); },
    );
    expect(committed).toBe("promoted");
    expect(deleted).toEqual([]);

    const rolledBack = await reconcileMomentCompositionPromotion(
      key,
      8,
      async () => ({
        job_status: "processing",
        job_attempt: 8,
        asset_status: "processing",
        variant_key: null,
        composition_status: "processing",
      }),
      async (outputKey) => { deleted.push(outputKey); },
    );
    expect(rolledBack).toBe("not_promoted");
    expect(deleted).toEqual([key]);
  });

  it("accepts only two to six ordered, unique positive media asset ids", () => {
    expect(validMomentComposeIds([8, 3])).toBe(true);
    expect(validMomentComposeIds([8, 8])).toBe(false);
    expect(validMomentComposeIds([0, 3])).toBe(false);
    expect(validMomentComposeIds([8])).toBe(false);
    expect(validMomentComposeIds([1, 2, 3, 4, 5, 6, 7])).toBe(false);
  });

  it("fingerprints include intent and preserve source order for durable idempotency", () => {
    expect(MOMENT_COMPOSE_INTENT).toBe("camera_clip_reel");
    expect(momentCompositionFingerprint([3, 8])).not.toBe(momentCompositionFingerprint([8, 3]));
    expect(momentCompositionFingerprint([3, 8])).toBe(momentCompositionFingerprint([3, 8]));
  });

  it("enforces the aggregate 60-second duration bound", () => {
    expect(withinMomentDurationLimit([30_000, 30_000])).toBe(true);
    expect(withinMomentDurationLimit([30_001, 30_000])).toBe(false);
    expect(withinMomentDurationLimit([30_000])).toBe(false);
    expect(withinMomentDurationLimit([20_000, 0])).toBe(false);
  });

  it("normalizes silent clips by synthesizing a stereo audio track", () => {
    const args = momentClipNormalizeArgs("in.mp4", "out.mp4", 12_345, false);
    expect(args).toContain("anullsrc=channel_layout=stereo:sample_rate=48000");
    expect(args).toContain("1:a:0");
    expect(args).toContain("scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p");
    expect(args).toContain("libx264");
    expect(args).toContain("aac");
  });

  it("bounds concat count and emits an MP4 H.264/AAC output command", () => {
    const args = momentConcatArgs("clips.txt", "moment.mp4", 2);
    expect(args).toContain("concat");
    expect(args).toContain("libx264");
    expect(args).toContain("aac");
    expect(args.at(-1)).toBe("moment.mp4");
    expect(() => momentConcatArgs("clips.txt", "bad.mp4", 1)).toThrow("MOMENT_COMPOSITION_INVALID");
  });
});