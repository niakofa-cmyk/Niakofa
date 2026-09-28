import assert from "node:assert/strict";
import test from "node:test";
import {
  EXCHANGE_SPARK_METADATA_TIMEOUT_MS,
  EXCHANGE_SPARK_MAX_BYTES,
  isExchangeSparkFeatureUnavailable,
  validateExchangeSparkVideo,
} from "../exchange-spark-upload-rules";
import { readExchangeSparkVideoDuration } from "../exchange-spark-upload-client";

test("Exchange Sparks accept validated MP4/WebM within byte and duration limits", () => {
  assert.equal(validateExchangeSparkVideo({
    mimeType: "video/mp4",
    byteSize: 1,
    durationSeconds: 60,
  }), null);
  assert.equal(validateExchangeSparkVideo({
    mimeType: "video/webm",
    byteSize: EXCHANGE_SPARK_MAX_BYTES,
    durationSeconds: 4.2,
  }), null);
});

test("Exchange Sparks reject non-video MIME types, empty/oversize files, and long clips", () => {
  assert.match(validateExchangeSparkVideo({ mimeType: "video/quicktime", byteSize: 1, durationSeconds: 4 }) ?? "", /MP4 or WebM/);
  assert.match(validateExchangeSparkVideo({ mimeType: "video/mp4", byteSize: 0, durationSeconds: 4 }) ?? "", /64 MiB/);
  assert.match(validateExchangeSparkVideo({ mimeType: "video/mp4", byteSize: EXCHANGE_SPARK_MAX_BYTES + 1, durationSeconds: 4 }) ?? "", /64 MiB/);
  assert.match(validateExchangeSparkVideo({ mimeType: "video/mp4", byteSize: 1, durationSeconds: 60.01 }) ?? "", /60 seconds/);
  assert.match(validateExchangeSparkVideo({ mimeType: "video/mp4", byteSize: 1, durationSeconds: Number.NaN }) ?? "", /duration/);
});

test("direct publishing feature failures are identified for legacy composer fallback", () => {
  assert.equal(isExchangeSparkFeatureUnavailable("MEDIA_PLATFORM_DISABLED"), true);
  assert.equal(isExchangeSparkFeatureUnavailable("MEDIA_STORAGE_UNAVAILABLE"), true);
  assert.equal(isExchangeSparkFeatureUnavailable("MEDIA_PROCESSING_UNAVAILABLE"), true);
  assert.equal(isExchangeSparkFeatureUnavailable("MEDIA_SIZE_INVALID"), false);
});

test("video metadata validation has a bounded ten-second default", () => {
  assert.equal(EXCHANGE_SPARK_METADATA_TIMEOUT_MS, 10_000);
});

test("video metadata timeout rejects and releases listeners and its object URL", async () => {
  const listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
  const video = {
    preload: "",
    muted: false,
    duration: Number.NaN,
    src: "",
    addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
      const registered = listeners.get(type) ?? new Set();
      registered.add(listener);
      listeners.set(type, registered);
    },
    removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
      listeners.get(type)?.delete(listener);
    },
    removeAttribute(name: string) {
      if (name === "src") this.src = "";
    },
    load() {},
  } as unknown as HTMLVideoElement;
  const originalDocument = globalThis.document;
  const originalRevoke = URL.revokeObjectURL;
  let revoked = 0;
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { createElement: () => video },
  });
  URL.revokeObjectURL = ((url: string) => {
    revoked += 1;
    originalRevoke.call(URL, url);
  }) as typeof URL.revokeObjectURL;
  try {
    await assert.rejects(
      readExchangeSparkVideoDuration(new File([new Uint8Array([1])], "clip.mp4", { type: "video/mp4" }), new AbortController().signal, 5),
      /within 10 seconds/,
    );
    assert.equal(revoked, 1);
    assert.equal(Array.from(listeners.values()).reduce((count, set) => count + set.size, 0), 0);
  } finally {
    URL.revokeObjectURL = originalRevoke;
    Object.defineProperty(globalThis, "document", { configurable: true, value: originalDocument });
  }
});