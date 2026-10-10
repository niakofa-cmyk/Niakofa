import assert from "node:assert/strict";
import test from "node:test";
import { loadStudioDraft, studioFileFingerprint } from "../../community/story-studio-draft";
import { publishStudioItemAsExchangeSpark } from "../studio-publishers";
import type { StudioItem } from "../studio-policy";
import type { StudioDraft } from "../../community/story-studio-draft";

test("Exchange Spark retry after reload reuses its saved server draft and upload", async () => {
  const globals = globalThis as typeof globalThis & {
    window?: { location: { origin: string }; localStorage: { getItem: () => null; setItem: () => void; removeItem: () => void }; indexedDB: boolean; setTimeout: typeof setTimeout; clearTimeout: typeof clearTimeout };
    indexedDB?: unknown;
    XMLHttpRequest?: unknown;
  };
  const oldWindow = globals.window;
  const oldIndexedDB = globals.indexedDB;
  const oldXhr = globals.XMLHttpRequest;
  const oldFetch = globalThis.fetch;
  const records = new Map<string, StudioDraft>();
  const routes: string[] = [];
  const publishBodies: string[] = [];
  let draftCreates = 0;
  let uploadSessions = 0;
  let statusReads = 0;
  let publishAttempts = 0;

  const db = {
    objectStoreNames: { contains: () => true },
    close() {},
    transaction() {
      const tx: { oncomplete?: () => void; onerror?: () => void; onabort?: () => void; objectStore: () => unknown } = {
        objectStore: () => store,
      };
      const store = {
        put(value: StudioDraft) {
          records.set(value.id, { ...value, files: [...value.files] });
          queueMicrotask(() => tx.oncomplete?.());
        },
        get(key: string) {
          const request: { result?: StudioDraft; onsuccess?: () => void; onerror?: () => void } = { result: records.get(key) };
          queueMicrotask(() => request.onsuccess?.());
          return request;
        },
        delete(key: string) {
          records.delete(key);
          queueMicrotask(() => tx.oncomplete?.());
        },
      };
      return tx;
    },
  };
  const openDb = {
    open() {
      const request: { result: typeof db; onsuccess?: () => void; onerror?: () => void; onupgradeneeded?: () => void } = { result: db };
      queueMicrotask(() => request.onsuccess?.());
      return request;
    },
  };
  globals.window = {
    location: { origin: "https://niakofa.test" },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    indexedDB: true,
    setTimeout,
    clearTimeout,
  };
  globals.indexedDB = openDb;
  class Upload {
    upload = { onprogress: null as null | ((event: { loaded: number; total: number; lengthComputable: boolean }) => void) };
    onload: (() => void) | null = null;
    onerror = null;
    ontimeout = null;
    onabort = null;
    status = 200;
    timeout = 0;
    open(method: string, url: string) { assert.equal(method, "PUT"); assert.match(url, /storage\/201$/); }
    setRequestHeader() {}
    send() { this.upload.onprogress?.({ loaded: 5, total: 5, lengthComputable: true }); this.onload?.(); }
    abort() {}
  }
  globals.XMLHttpRequest = Upload;
  globalThis.fetch = async (input, init) => {
    const path = String(input);
    routes.push(`${init?.method ?? "GET"} ${path}`);
    if (path.endsWith("/listings/31/sparks/drafts") && init?.method === "POST") {
      draftCreates++;
      return new Response(JSON.stringify({ spark_id: 915, upload_context: { contextKind: "exchange_spark", contextId: 915 } }), { status: 201 });
    }
    if (path === "/api/media-assets/uploads") {
      uploadSessions++;
      return new Response(JSON.stringify({
        media_asset_id: 201,
        upload: { method: "PUT", url: "/storage/201", headers: {}, expires_in_seconds: null },
        complete_url: "/api/media-assets/201/complete",
      }), { status: 200 });
    }
    if (path.endsWith("/complete")) return new Response(JSON.stringify({ media_asset_id: 201, status: "processing" }), { status: 202 });
    if (path.endsWith("/drafts/915") && init?.method !== "POST") {
      statusReads++;
      if (statusReads > 1) return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
      return new Response(JSON.stringify({
        spark_id: 915, status: "draft", listing_id: 31, caption: "Help nearby",
        media_assets: [{ media_asset_id: 201, media_type: "video", mime_type: "video/mp4", byte_size: 5, status: "ready", variant_ready: true }],
      }), { status: 200 });
    }
    if (path.endsWith("/drafts/915/publish")) {
      publishAttempts++;
      publishBodies.push(String(init?.body));
      if (publishAttempts === 1) return new Response(JSON.stringify({ error: "Connection lost after publish" }), { status: 503 });
      return new Response(JSON.stringify({ spark_id: 915, status: "published", media_asset_id: 201 }), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 200 });
  };

  const video = Object.assign(new Blob(["video"], { type: "video/mp4" }), { name: "help.mp4", lastModified: 123 }) as File;
  const item: StudioItem = { id: "clip-1", file: video, kind: "video", durationMs: 5000, source: "gallery", coverTimeMs: 0 };
  const scope = { userId: 73, hubId: null, audience: "community" as const };
  const publish = () => publishStudioItemAsExchangeSpark({
    scope, listingId: 31, item, caption: "Help nearby", signal: new AbortController().signal, onProgress: () => {},
  });
  const publishWithTimeout = async () => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        publish(),
        new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error(`Exchange retry stalled at: ${routes.join(" | ")}`)), 3000); }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  try {
    await assert.rejects(publishWithTimeout(), /Connection lost after publish/);
    const saved = await loadStudioDraft(73, null);
    assert.equal(saved?.exchangeDraftId, 915);
    assert.equal(saved?.destinationListingId, "31");
    assert.equal(saved?.exchangeFileFingerprint, studioFileFingerprint(video));

    // A second publisher instance represents a page reload; IndexedDB is the only recovery state.
    assert.equal(await publishWithTimeout(), "published");
    assert.equal(draftCreates, 1, "retry must not create another server-owned Spark");
    assert.equal(uploadSessions, 1, "retry must not create another upload session");
    assert.equal(publishAttempts, 2, "retry idempotently republishes the existing Spark ID");
    assert.deepEqual(publishBodies.map((body) => JSON.parse(body)), [{ caption: "Help nearby" }, { caption: "Help nearby" }]);
    assert.ok(routes.includes("POST /api/community/exchange/sparks/drafts/915/publish"));
    assert.equal(await loadStudioDraft(73, null), null, "successful recovery clears the device draft");
  } finally {
    globalThis.fetch = oldFetch;
    globals.window = oldWindow;
    globals.indexedDB = oldIndexedDB;
    globals.XMLHttpRequest = oldXhr;
  }
});
