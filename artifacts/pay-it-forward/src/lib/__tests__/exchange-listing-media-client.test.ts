import assert from "node:assert/strict";
import test from "node:test";
import { uploadExchangeListingMediaFile } from "../exchange-listing-media-client";

test("Exchange listing photos upload in resumable chunks and retry a dropped chunk", async () => {
  const originalFetch = globalThis.fetch;
  const originalXhr = globalThis.XMLHttpRequest;
  const originalWindow = globalThis.window;
  const originalLocalStorage = globalThis.localStorage;
  const apiRequests: Array<{ url: string; method: string; authorization: string | null }> = [];
  const chunkAttempts: Array<{ body: Blob; headers: Record<string, string> }> = [];
  let droppedFirstChunk = false;

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
    getResponseHeader(name: string) {
      return name === "Upload-Offset" ? "3" : null;
    }
    send(body: Blob) {
      chunkAttempts.push({ body, headers: { ...this.headers } });
      if (!droppedFirstChunk) {
        droppedFirstChunk = true;
        this.onerror?.();
        return;
      }
      this.upload.onprogress?.({ loaded: body.size, total: body.size, lengthComputable: true });
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
      localStorage: { getItem: (key: string) => key === "niakofa_token" ? "test-token" : null },
      setTimeout,
      clearTimeout,
    },
  });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: { getItem: (key: string) => key === "niakofa_token" ? "test-token" : null },
  });
  globalThis.XMLHttpRequest = FakeXhr as unknown as typeof XMLHttpRequest;
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    const method = init.method ?? "GET";
    const headers = new Headers(init.headers);
    apiRequests.push({ url, method, authorization: headers.get("Authorization") });
    if (url === "/api/media-assets/uploads" && method === "POST") {
      return new Response(JSON.stringify({
        media_asset_id: 81,
        upload: { method: "PUT", url: "/api/media-assets/81/upload", headers: { "Content-Type": "image/jpeg" } },
        resumable: {
          chunk_size: 3,
          status_url: "/api/media-assets/81/upload-session",
          chunk_url: "/api/media-assets/81/upload/chunks",
        },
        complete_url: "/api/media-assets/81/complete",
      }), { status: 201, headers: { "Content-Type": "application/json" } });
    }
    if (url === "/api/media-assets/81/upload-session" && method === "GET") {
      return new Response(JSON.stringify({
        media_asset_id: 81,
        offset: 0,
        total_bytes: 3,
        chunk_size: 3,
        finalized: false,
        status: "pending",
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (url === "/api/media-assets/81/complete" && method === "POST") {
      return new Response(JSON.stringify({ media_asset_id: 81, status: "processing" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    throw new Error(`Unexpected API request: ${method} ${url}`);
  };

  try {
    const file = new File([new Uint8Array([1, 2, 3])], "neighbor-photo.jpg", { type: "image/jpeg" });
    const progress: number[] = [];
    const mediaAssetId = await uploadExchangeListingMediaFile({
      ownerId: 23,
      file,
      signal: new AbortController().signal,
      onProgress: (value) => progress.push(value),
    });

    assert.equal(mediaAssetId, 81);
    assert.deepEqual(apiRequests.map(({ method, url }) => [method, url]), [
      ["POST", "/api/media-assets/uploads"],
      ["GET", "/api/media-assets/81/upload-session"],
      ["POST", "/api/media-assets/81/complete"],
    ]);
    assert.ok(apiRequests.every(({ authorization }) => authorization === "Bearer test-token"));
    assert.equal(chunkAttempts.length, 2);
    assert.deepEqual(chunkAttempts.map(({ headers }) => headers["Upload-Offset"]), ["0", "0"]);
    assert.equal(chunkAttempts[0].headers["X-Chunk-SHA256"], chunkAttempts[1].headers["X-Chunk-SHA256"]);
    assert.ok(chunkAttempts.every(({ headers }) => headers["X-Media-Mime-Type"] === "image/jpeg"));
    assert.ok(progress.includes(100));
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.XMLHttpRequest = originalXhr;
    Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: originalLocalStorage });
  }
});
