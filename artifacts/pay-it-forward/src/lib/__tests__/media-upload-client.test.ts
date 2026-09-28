import assert from "node:assert/strict";
import test from "node:test";
import { ensureSameOriginMediaPath, uploadBinaryMedia } from "../media-upload-client";

test("media completion endpoints are constrained to safe same-origin paths", () => {
  const originalWindow = globalThis.window;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { location: { origin: "https://community.test" } },
  });
  try {
    assert.equal(ensureSameOriginMediaPath("/api/media/complete?retry=1"), "/api/media/complete?retry=1");
    assert.throws(() => ensureSameOriginMediaPath("https://other.test/api/complete"), /unsafe/i);
    assert.throws(() => ensureSameOriginMediaPath("https://user:pass@community.test/api/complete"), /unsafe/i);
    assert.throws(() => ensureSameOriginMediaPath("/api/complete#fragment"), /unsafe/i);
  } finally {
    Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
  }
});

test("binary media uploads send raw files, report progress, and scope auth to same-origin URLs", async () => {
  const originalWindow = globalThis.window;
  const originalXhr = globalThis.XMLHttpRequest;
  const originalLocalStorage = globalThis.localStorage;
  const values = new Map([["niakofa_token", "test-token"]]);
  const sentBodies: unknown[] = [];
  const requestHeaders: Array<Record<string, string>> = [];
  class FakeXhr {
    upload: { onprogress: ((event: { loaded: number; total: number; lengthComputable: boolean }) => void) | null } = {
      onprogress: null,
    };
    status = 204;
    timeout = 0;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    ontimeout: (() => void) | null = null;
    onabort: (() => void) | null = null;
    private headers: Record<string, string> = {};
    open() {}
    setRequestHeader(name: string, value: string) {
      this.headers[name] = value;
    }
    send(body: unknown) {
      sentBodies.push(body);
      requestHeaders.push(this.headers);
      this.upload.onprogress?.({ loaded: 2, total: 3, lengthComputable: true });
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
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
      },
    },
  });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
    },
  });
  globalThis.XMLHttpRequest = FakeXhr as unknown as typeof XMLHttpRequest;
  try {
    const file = new File([new Uint8Array([1, 2, 3])], "photo.jpg", { type: "image/jpeg" });
    const progress: Array<[number, number]> = [];
    await uploadBinaryMedia({
      upload: { method: "PUT", url: "/api/media-assets/1/upload", headers: { "Content-Type": file.type } },
      file,
      signal: new AbortController().signal,
      onProgress: (loaded, total) => progress.push([loaded, total]),
    });
    await uploadBinaryMedia({
      upload: { method: "PUT", url: "https://storage.test/upload", headers: {} },
      file,
      signal: new AbortController().signal,
      onProgress: () => {},
    });

    assert.deepEqual(sentBodies, [file, file]);
    assert.deepEqual(progress, [[2, 3]]);
    assert.equal(requestHeaders[0].Authorization, "Bearer test-token");
    assert.equal(requestHeaders[1].Authorization, undefined);
  } finally {
    Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: originalLocalStorage });
    globalThis.XMLHttpRequest = originalXhr;
  }
});