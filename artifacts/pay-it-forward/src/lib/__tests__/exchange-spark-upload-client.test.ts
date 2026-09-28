import assert from "node:assert/strict";
import test from "node:test";
import {
  clearExchangeSparkDraftId,
  loadExchangeSparkDraftId,
  putRawSparkFile,
  resumeSparkUploadSession,
  saveExchangeSparkDraftId,
} from "../exchange-spark-upload-client";

test("saved Spark draft references persist only the server id and can be cleared", () => {
  const originalWindow = globalThis.window;
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      },
    },
  });
  try {
    assert.equal(loadExchangeSparkDraftId(), null);
    saveExchangeSparkDraftId(582);
    assert.equal(loadExchangeSparkDraftId(), 582);
    assert.deepEqual(Array.from(values.values()), ["582"]);
    assert.equal(Array.from(values.values()).some((value) => /base64|data:video/i.test(value)), false);
    clearExchangeSparkDraftId();
    assert.equal(loadExchangeSparkDraftId(), null);
    assert.throws(() => saveExchangeSparkDraftId(0), /invalid Spark draft id/i);
  } finally {
    Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
  }
});

test("saved pending media resumes through raw upload and completion endpoints", () => {
  const file = new File([new Uint8Array([1, 2, 3])], "clip.mp4", { type: "video/mp4" });
  assert.deepEqual(resumeSparkUploadSession(91, file), {
    media_asset_id: 91,
    upload: {
      method: "PUT",
      url: "/api/media-assets/91/upload",
      headers: { "Content-Type": "video/mp4" },
      expires_in_seconds: null,
    },
    complete_url: "/api/media-assets/91/complete",
  });
  assert.throws(() => resumeSparkUploadSession(-1, file), /invalid/i);
});

test("binary upload sends the File directly instead of encoding it as text", async () => {
  const originalWindow = globalThis.window;
  const originalXhr = globalThis.XMLHttpRequest;
  const sentBodies: unknown[] = [];
  class FakeXhr {
    upload: Record<string, unknown> = {};
    status = 204;
    timeout = 0;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    ontimeout: (() => void) | null = null;
    onabort: (() => void) | null = null;
    open() {}
    setRequestHeader() {}
    send(body: unknown) {
      sentBodies.push(body);
      this.onload?.();
    }
    abort() {
      this.onabort?.();
    }
  }
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      location: { origin: "https://community.test" },
      localStorage: { getItem: () => null },
    },
  });
  globalThis.XMLHttpRequest = FakeXhr as unknown as typeof XMLHttpRequest;
  try {
    const file = new File([new Uint8Array([10, 20, 30])], "clip.mp4", { type: "video/mp4" });
    const controller = new AbortController();
    await putRawSparkFile({
      method: "PUT",
      url: "/api/media-assets/91/upload",
      headers: { "Content-Type": "video/mp4" },
      expires_in_seconds: null,
    }, file, controller.signal, () => {});
    assert.equal(sentBodies[0], file);
    assert.equal(typeof sentBodies[0], "object");
  } finally {
    Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
    globalThis.XMLHttpRequest = originalXhr;
  }
});