import { describe, expect, it } from "@jest/globals";
import {
  chunkStorageKey,
  cleanupFinalizedChunkObjects,
  decideMediaChunk,
  MEDIA_UPLOAD_CHUNK_SIZE,
  MEDIA_UPLOAD_MAX_BYTES,
} from "../resumable-media-upload";

describe("resumable media chunk protocol", () => {
  const sha = "a".repeat(64);

  it("uses bounded four-MiB chunks within the 64-MiB file ceiling", () => {
    expect(MEDIA_UPLOAD_CHUNK_SIZE).toBe(4 * 1024 * 1024);
    expect(MEDIA_UPLOAD_MAX_BYTES).toBe(64 * 1024 * 1024);
    expect(decideMediaChunk({
      expectedBytes: MEDIA_UPLOAD_CHUNK_SIZE + 1,
      chunkSize: MEDIA_UPLOAD_CHUNK_SIZE,
      nextOffset: 0,
      offset: 0,
      chunkLength: MEDIA_UPLOAD_CHUNK_SIZE,
      sha256: sha,
      acceptedChunks: [],
    })).toEqual({ kind: "accept", nextOffset: MEDIA_UPLOAD_CHUNK_SIZE });
  });

  it("accepts exact retries, rejects changed retries, and rejects gaps", () => {
    const acceptedChunks = [{ byte_offset: 0, byte_length: MEDIA_UPLOAD_CHUNK_SIZE, sha256: sha }];
    const input = {
      expectedBytes: MEDIA_UPLOAD_CHUNK_SIZE * 3,
      chunkSize: MEDIA_UPLOAD_CHUNK_SIZE,
      nextOffset: MEDIA_UPLOAD_CHUNK_SIZE,
      offset: 0,
      chunkLength: MEDIA_UPLOAD_CHUNK_SIZE,
      sha256: sha,
      acceptedChunks,
    };
    expect(decideMediaChunk(input).kind).toBe("replay");
    expect(decideMediaChunk({ ...input, sha256: "b".repeat(64) }).kind).toBe("conflict");
    expect(decideMediaChunk({ ...input, offset: MEDIA_UPLOAD_CHUNK_SIZE * 2 }).kind).toBe("out-of-order");
  });

  it("only permits a correctly sized final partial chunk", () => {
    const input = {
      expectedBytes: MEDIA_UPLOAD_CHUNK_SIZE + 10,
      chunkSize: MEDIA_UPLOAD_CHUNK_SIZE,
      nextOffset: MEDIA_UPLOAD_CHUNK_SIZE,
      offset: MEDIA_UPLOAD_CHUNK_SIZE,
      chunkLength: 9,
      sha256: sha,
      acceptedChunks: [],
    };
    expect(decideMediaChunk(input).kind).toBe("conflict");
    expect(decideMediaChunk({ ...input, chunkLength: 10 })).toEqual({
      kind: "accept",
      nextOffset: MEDIA_UPLOAD_CHUNK_SIZE + 10,
    });
  });

  it("uses deterministic provider-neutral chunk object keys", () => {
    expect(chunkStorageKey(5, 4, sha)).toBe(`media-assets/5/upload-chunks/4-${sha}`);
  });

  it("keeps the durable ledger when a provider delete fails partway, then retries idempotently", async () => {
    const objects = new Set(["chunk-a", "chunk-b", "chunk-c"]);
    let failOnce = true;
    let ledgerCommits = 0;
    const deleteObject = async (key: string) => {
      if (key === "chunk-b" && failOnce) {
        failOnce = false;
        throw new Error("temporary storage failure");
      }
      objects.delete(key); // strict deletion is idempotent when already absent
    };
    const commitLedger = async () => { ledgerCommits += 1; };

    expect(await cleanupFinalizedChunkObjects(["chunk-a", "chunk-b", "chunk-c"], deleteObject, commitLedger)).toBe(false);
    expect(objects).toEqual(new Set(["chunk-b", "chunk-c"]));
    expect(ledgerCommits).toBe(0);
    expect(await cleanupFinalizedChunkObjects(["chunk-a", "chunk-b", "chunk-c"], deleteObject, commitLedger)).toBe(true);
    expect(objects.size).toBe(0);
    expect(ledgerCommits).toBe(1);
  });

  it("retries safely if the post-delete database cleanup transaction rolls back", async () => {
    const objects = new Set(["chunk-a"]);
    let failCommit = true;
    let attempts = 0;
    const clean = () => cleanupFinalizedChunkObjects(
      ["chunk-a"],
      async (key) => { objects.delete(key); },
      async () => {
        attempts += 1;
        if (failCommit) {
          failCommit = false;
          throw new Error("database rollback");
        }
      },
    );
    expect(await clean()).toBe(false);
    expect(objects.size).toBe(0);
    expect(attempts).toBe(1);
    expect(await clean()).toBe(true);
    expect(attempts).toBe(2);
  });
});