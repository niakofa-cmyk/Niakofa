export const MEDIA_UPLOAD_CHUNK_SIZE = 4 * 1024 * 1024;
export const MEDIA_UPLOAD_MAX_BYTES = 64 * 1024 * 1024;

export type StoredMediaChunk = {
  byte_offset: number;
  byte_length: number;
  sha256: string;
};

export type ChunkDecision =
  | { kind: "accept"; nextOffset: number }
  | { kind: "replay"; nextOffset: number }
  | { kind: "conflict"; nextOffset: number }
  | { kind: "out-of-order"; nextOffset: number };

/** Enforces fixed-size sequential chunks, except for the final short chunk. */
export function decideMediaChunk(input: {
  expectedBytes: number;
  chunkSize: number;
  nextOffset: number;
  offset: number;
  chunkLength: number;
  sha256: string;
  acceptedChunks: StoredMediaChunk[];
}): ChunkDecision {
  const { expectedBytes, chunkSize, nextOffset, offset, chunkLength, sha256, acceptedChunks } = input;
  if (!Number.isSafeInteger(offset) || offset < 0 || offset % chunkSize !== 0
    || !Number.isSafeInteger(chunkLength) || chunkLength <= 0 || chunkLength > chunkSize
    || offset + chunkLength > expectedBytes
    || chunkLength !== Math.min(chunkSize, expectedBytes - offset)) {
    return { kind: "conflict", nextOffset };
  }
  if (offset < nextOffset) {
    const previous = acceptedChunks.find((chunk) => chunk.byte_offset === offset);
    return previous && previous.byte_length === chunkLength && previous.sha256 === sha256
      ? { kind: "replay", nextOffset }
      : { kind: "conflict", nextOffset };
  }
  if (offset > nextOffset) return { kind: "out-of-order", nextOffset };
  return { kind: "accept", nextOffset: offset + chunkLength };
}

export function chunkStorageKey(assetId: number, offset: number, sha256: string): string {
  return `media-assets/${assetId}/upload-chunks/${offset}-${sha256}`;
}

/** Provider deletion is retried safely if either a partial delete or DB commit fails. */
export async function cleanupFinalizedChunkObjects(
  keys: string[],
  deleteObjectStrict: (key: string) => Promise<void>,
  commitLedgerRemoval: () => Promise<void>,
): Promise<boolean> {
  try {
    for (const key of keys) await deleteObjectStrict(key);
    await commitLedgerRemoval();
    return true;
  } catch {
    return false;
  }
}
