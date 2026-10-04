import assert from "node:assert/strict";
import test from "node:test";
import { CameraClipReelPendingError, getCameraClipReelStatus, isCameraClipReelSelection, publishStudioMoment, requestCameraClipReel, selectedStudioFiles, validateMomentCompositionPlaybackUrl, validStudioMediaEdits } from "../story-studio-publish";
import { buildMomentMediaAccessibility, parseMomentStudioTags, restoreMomentStudioAccessibility, validateMomentStudioWebVtt, type MomentStudioAccessibilityDraft } from "../moment-studio-accessibility";
import { trimVideoFile } from "../story-media-tools";
import { discardStudioDraft, emptyStudioScope, exchangeResumeAction, loadStudioDraft, persistStudioDraft, persistStudioPublishAttempt, saveStudioDraft, studioDraftKey, studioFileFingerprint, studioPublishSignature, type StudioDraft } from "../story-studio-draft";

const file = (name: string) => Object.assign(new Blob(["bytes"], { type: "image/jpeg" }), { name, lastModified: 1 }) as File;
const videoFile = (name: string) => Object.assign(new Blob(["video"], { type: "video/webm" }), { name, lastModified: 1 }) as File;

test("camera reel marker applies to one through six all-video camera groups", () => {
  assert.equal(isCameraClipReelSelection([videoFile("one.webm")]), true);
  assert.equal(isCameraClipReelSelection([videoFile("one.webm"), videoFile("two.webm")]), true);
  assert.equal(isCameraClipReelSelection([videoFile("one.webm"), file("photo.jpg")]), false);
  assert.equal(isCameraClipReelSelection(Array.from({ length: 7 }, (_, index) => videoFile(`${index}.webm`))), false);
});

test("camera reel playback URL stays same-origin and query-free for native Range streaming", () => {
  assert.equal(
    validateMomentCompositionPlaybackUrl("/api/community/stories/52/moment-composition/play", 52, "https://niakofa.test"),
    "/api/community/stories/52/moment-composition/play",
  );
  assert.throws(() => validateMomentCompositionPlaybackUrl("https://evil.test/api/community/stories/52/moment-composition/play", 52, "https://niakofa.test"), /invalid/);
  assert.throws(() => validateMomentCompositionPlaybackUrl("/api/community/stories/52/moment-composition/play?token=secret", 52, "https://niakofa.test"), /invalid/);
  assert.throws(() => validateMomentCompositionPlaybackUrl("/api/community/stories/53/moment-composition/play", 52, "https://niakofa.test"), /invalid/);
});

test("camera composition client sends the ordered id contract and consumes private playback contract", async () => {
  const oldFetch = globalThis.fetch;
  const calls: Array<{ path: string; method?: string; body?: string }> = [];
  globalThis.fetch = async (path, init) => {
    calls.push({ path: String(path), method: init?.method, body: init?.body as string | undefined });
    if (String(path).endsWith("/moment-composition") && init?.method === "POST") {
      return new Response(JSON.stringify({ composition: {
        status: "queued",
        playback_grant_url: "/api/community/stories/52/moment-composition/playback-grant",
        status_url: "/api/community/stories/52/moment-composition",
      } }), { status: 202 });
    }
    return new Response(JSON.stringify({ composition: {
      status: "ready",
      failure_code: null,
      duration_ms: 4200,
      playback_grant_url: "/api/community/stories/52/moment-composition/playback-grant",
    } }), { status: 200 });
  };
  try {
    assert.equal(await requestCameraClipReel(52, [71]), "queued");
    assert.deepEqual(JSON.parse(calls[0].body!), { intent: "camera_clip_reel", media_asset_ids: [71] });
    assert.equal(await requestCameraClipReel(52, [71, 70]), "queued");
    assert.deepEqual(JSON.parse(calls[1].body!), { intent: "camera_clip_reel", media_asset_ids: [71, 70] });
    assert.equal(calls[0].method, "POST");
    assert.equal(calls[1].method, "POST");
    const status = await getCameraClipReelStatus(52);
    assert.deepEqual(status, {
      status: "ready",
      failureCode: null,
      durationMs: 4200,
      playbackGrantUrl: "/api/community/stories/52/moment-composition/playback-grant",
    });
    await assert.rejects(requestCameraClipReel(52, [71, 71]), /unique video assets/);
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test("publishing one camera video returns its Spark ID and queues that exact media as a reel", async () => {
  const oldFetch = globalThis.fetch;
  const calls: Array<{ path: string; method?: string; body?: string }> = [];
  globalThis.fetch = async (path, init) => {
    const route = String(path);
    calls.push({ path: route, method: init?.method, body: init?.body as string | undefined });
    if (route.includes("moment-media-status")) {
      return new Response(JSON.stringify({
        assets: [{ id: 71, status: "ready", media_type: "video", variant_ready: true }],
      }), { status: 200 });
    }
    if (route === "/api/community/stories" && init?.method === "POST") {
      return new Response(JSON.stringify({ story: { id: 915 } }), { status: 201 });
    }
    if (route === "/api/community/stories/915/moment-composition" && init?.method === "POST") {
      return new Response(JSON.stringify({ composition: {
        status: "queued",
        playback_grant_url: "/api/community/stories/915/moment-composition/playback-grant",
        status_url: "/api/community/stories/915/moment-composition",
      } }), { status: 202 });
    }
    throw new Error(`Unexpected request: ${route}`);
  };
  try {
    const sparkId = await publishStudioMoment({
      userId: 73,
      hubId: null,
      audience: "community",
      clientPublishId: "00000000-0000-4000-8000-000000000915",
      files: [videoFile("camera-clip.webm")],
      caption: "A moment from today",
      mediaAltTexts: ["A video recorded in the camera"],
      elements: [],
      effect: "none",
      signal: new AbortController().signal,
      onStatus: () => {},
      uploadedIds: [71],
      cameraClipReel: true,
      beforePublish: async (ids) => assert.deepEqual(ids, [71]),
    });
    assert.equal(sparkId, 915);
    assert.deepEqual(calls.map(({ path, method }) => [path, method]), [
      ["/api/community/stories/moment-media-status?contextKind=community_moment&contextId=73&ids=71", undefined],
      ["/api/community/stories", "POST"],
      ["/api/community/stories/915/moment-composition", "POST"],
    ]);
    assert.deepEqual(JSON.parse(calls[2].body!), {
      intent: "camera_clip_reel",
      media_asset_ids: [71],
    });
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test("camera composition network failures retain the published Spark ID for retry", async () => {
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (path, init) => {
    const route = String(path);
    if (route.includes("moment-media-status")) {
      return new Response(JSON.stringify({
        assets: [{ id: 71, status: "ready", media_type: "video", variant_ready: true }],
      }), { status: 200 });
    }
    if (route === "/api/community/stories" && init?.method === "POST") {
      return new Response(JSON.stringify({ story: { id: 917 } }), { status: 201 });
    }
    if (route === "/api/community/stories/917/moment-composition" && init?.method === "POST") {
      throw new TypeError("Network disconnected");
    }
    throw new Error(`Unexpected request: ${route}`);
  };
  try {
    await assert.rejects(
      publishStudioMoment({
        userId: 73,
        hubId: null,
        audience: "community",
        clientPublishId: "00000000-0000-4000-8000-000000000917",
        files: [videoFile("camera-clip.webm")],
        caption: "A moment from today",
        mediaAltTexts: ["A video recorded in the camera"],
        elements: [],
        effect: "none",
        signal: new AbortController().signal,
        onStatus: () => {},
        uploadedIds: [71],
        cameraClipReel: true,
        beforePublish: async () => {},
      }),
      (reason: unknown) => reason instanceof CameraClipReelPendingError
        && reason.storyId === 917
        && /Network disconnected/.test(reason.message),
    );
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test("an imported video returns its Spark ID without being routed through camera composition", async () => {
  const oldFetch = globalThis.fetch;
  const calls: Array<{ path: string; body?: string }> = [];
  globalThis.fetch = async (path, init) => {
    const route = String(path);
    calls.push({ path: route, body: init?.body as string | undefined });
    if (route.includes("moment-media-status")) {
      return new Response(JSON.stringify({
        assets: [{ id: 72, status: "ready", media_type: "video", variant_ready: true }],
      }), { status: 200 });
    }
    if (route === "/api/community/stories" && init?.method === "POST") {
      return new Response(JSON.stringify({ story: { id: 916 } }), { status: 201 });
    }
    throw new Error(`Unexpected request: ${route}`);
  };
  try {
    const sparkId = await publishStudioMoment({
      userId: 73,
      hubId: null,
      audience: "community",
      clientPublishId: "00000000-0000-4000-8000-000000000916",
      files: [videoFile("edited-import.mp4")],
      caption: "Edited video",
      mediaAltTexts: ["A video edited outside the camera"],
      elements: [],
      effect: "none",
      signal: new AbortController().signal,
      onStatus: () => {},
      uploadedIds: [72],
      beforePublish: async (ids) => assert.deepEqual(ids, [72]),
    });
    assert.equal(sparkId, 916);
    assert.equal(calls.some(({ path }) => path.includes("/moment-composition")), false);
    assert.deepEqual(JSON.parse(calls.at(-1)!.body!), {
      caption: "Edited video",
      hub_id: null,
      audience: "community",
      media_asset_ids: [72],
      elements: [],
      media_accessibility: [{ media_asset_id: 72, alt_text: "A video edited outside the camera" }],
      client_publish_id: "00000000-0000-4000-8000-000000000916",
      archive_enabled: false,
      remix_enabled: false,
      composition_manifest: {
        version: 1,
        canvas: { width: 1080, height: 1920, aspect: "9:16" },
        elements: [],
        effects: [],
        music: null,
      },
    });
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test("cover edits only include video assets and nonnegative timestamps", () => {
  const video = Object.assign(new Blob(["video"], { type: "video/webm" }), { name: "clip.webm", lastModified: 1 }) as File;
  assert.deepEqual(validStudioMediaEdits([video, file("photo")], [12, 13], [
    { index: 0, coverTimeMs: 1234.6 }, { index: 1, coverTimeMs: 500 }, { index: 0, coverTimeMs: -1 },
  ]), [{ media_asset_id: 12, cover_time_ms: 1235 }]);
});

test("video trimming rejects non-video files and empty or reversed ranges", async () => {
  const video = Object.assign(new Blob(["video"], { type: "video/webm" }), { name: "clip.webm", lastModified: 1 }) as File;
  await assert.rejects(trimVideoFile(file("photo"), 0, 1), /valid video range/);
  await assert.rejects(trimVideoFile(video, 2, 2), /valid video range/);
  await assert.rejects(trimVideoFile(video, 3, 2), /valid video range/);
});

test("sequence is the selected order, not the gallery's file order", () => {
  assert.deepEqual(selectedStudioFiles([file("first"), file("second")], [1, 0, 1]).map((item) => item.name), ["second", "first"]);
});

test("Moment tags and accessibility metadata are bounded and retain selected attachment order", () => {
  assert.deepEqual(parseMomentStudioTags("#Community, ART, helping-neighbors"), ["community", "art", "helping-neighbors"]);
  assert.throws(() => parseMomentStudioTags(Array.from({ length: 11 }, (_, index) => `tag${index}`).join(",")), /no more than 10/);
  assert.throws(() => parseMomentStudioTags("two words"), /letters, numbers, or hyphens/);
  const photo = file("neighbors.jpg");
  const video = Object.assign(new Blob(["video"], { type: "video/webm" }), { name: "voices.webm", lastModified: 1 }) as File;
  const vtt = "WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nHello neighbors";
  assert.equal(validateMomentStudioWebVtt(vtt), null);
  assert.match(validateMomentStudioWebVtt(vtt, 1_000) ?? "", /within this video/);
  assert.match(validateMomentStudioWebVtt("WEBVTT\n\n00:00:00.000 --> 00:00:02.000\n<unsafe>") ?? "", /plain text/);
  assert.deepEqual(buildMomentMediaAccessibility(
    [photo, video], [1, 0], [72, 71],
    { 0: "A welcoming neighborhood gathering", 1: "A volunteer greets a neighbor" },
    { 1: vtt },
  ), [
    { media_asset_id: 72, alt_text: "A volunteer greets a neighbor", captions_vtt: vtt },
    { media_asset_id: 71, alt_text: "A welcoming neighborhood gathering" },
  ]);
  assert.deepEqual(restoreMomentStudioAccessibility({
    momentTagsInput: "community", momentAltTexts: { 0: "Description" }, momentCaptionsVtt: { 0: vtt },
  }), { momentTagsInput: "community", momentAltTexts: { 0: "Description" }, momentCaptionsVtt: { 0: vtt } });
});

test("scope reset starts without prior user's or Hub's files, audience, listing or uploaded assets", () => {
  assert.deepEqual(emptyStudioScope(null), { files: [], selection: [], audience: "community", uploadedIds: [], listingId: "", caption: "", musicFile: null, musicRightsBasis: "original", musicLicenseReference: "", musicRightsAccepted: false, musicVolume: 0.65, uploadedMusicAssetId: null });
  assert.deepEqual(emptyStudioScope(41), { files: [], selection: [], audience: "hub", uploadedIds: [], listingId: "", caption: "", musicFile: null, musicRightsBasis: "original", musicLicenseReference: "", musicRightsAccepted: false, musicVolume: 0.65, uploadedMusicAssetId: null });
  assert.notEqual(studioDraftKey(73, 41), studioDraftKey(74, 41));
  assert.notEqual(studioDraftKey(73, 41), studioDraftKey(73, 42));
});

test("Exchange retry keeps the server draft ID instead of creating a second Spark", () => {
  const video = Object.assign(new Blob(["video"], { type: "video/mp4" }), { name: "help.mp4", lastModified: 123 }) as File;
  const fingerprint = studioFileFingerprint(video);
  const base = { draftId: 915, listingId: 31, savedListingId: 31, fingerprint, savedFingerprint: fingerprint, file: video };
  assert.equal(exchangeResumeAction({ ...base, status: null }), "publish-again"); // Lost publish response: idempotent POST to /915/publish.
  assert.equal(exchangeResumeAction({ ...base, status: { listing_id: 31, media_assets: [{ media_asset_id: 82, media_type: "video", mime_type: video.type, byte_size: video.size, status: "ready", variant_ready: true }] } }), "publish");
  assert.equal(exchangeResumeAction({ ...base, status: { listing_id: 31, media_assets: [] } }), "create-upload");
  assert.throws(() => exchangeResumeAction({ ...base, listingId: 32, status: null }), /another listing or video/);
  assert.throws(() => exchangeResumeAction({ ...base, fingerprint: "different video", status: null }), /another listing or video/);
});

test("studio uploads raw bytes and publishes asset IDs, elements and manifest without data URLs", async () => {
  const oldFetch = globalThis.fetch;
  const oldWindow = (globalThis as { window?: unknown }).window;
  const oldXHR = (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest;
  const sent: Array<{ path: string; body?: string }> = [];
  let raw: unknown;
  (globalThis as { window?: unknown }).window = { location: { origin: "https://niakofa.test" } };
  class Upload {
    upload: { onprogress: ((event: { loaded: number; total: number; lengthComputable: boolean }) => void) | null } = { onprogress: null };
    onload: (() => void) | null = null;
    onerror = null;
    ontimeout = null;
    onabort = null;
    status = 200;
    timeout = 0;
    open(method: string) { assert.equal(method, "PUT"); }
    setRequestHeader() {}
    send(body: unknown) { raw = body; this.upload.onprogress?.({ loaded: 5, total: 5, lengthComputable: true }); this.onload?.(); }
    abort() {}
  }
  (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest = Upload;
  globalThis.fetch = async (path, init) => {
    const route = String(path);
    sent.push({ path: route, body: init?.body as string | undefined });
    if (route.endsWith("/uploads")) return new Response(JSON.stringify({ media_asset_id: 41, upload: { method: "PUT", url: "/storage/41", headers: {} }, complete_url: "/api/media-assets/41/complete" }), { status: 200 });
    if (route.endsWith("/complete")) return new Response(JSON.stringify({ media_asset_id: 41, status: "processing" }), { status: 202 });
    if (route.includes("moment-media-status")) return new Response(JSON.stringify({ assets: [{ id: 41, status: "ready", media_type: "photo", variant_ready: true }] }), { status: 200 });
    if (route === "/api/community/stories" && init?.method === "POST") {
      return new Response(JSON.stringify({ story: { id: 915 } }), { status: 201 });
    }
    return new Response("{}", { status: 200 });
  };
  try {
    const image = file("neighborhood.jpg");
    await publishStudioMoment({ userId: 73, hubId: null, audience: "community", clientPublishId: "00000000-0000-4000-8000-000000000002", files: [image], caption: "We helped", tags: ["neighbors", "volunteers"], mediaAltTexts: ["A neighborhood volunteer hands out supplies"], elements: [{ type: "text", payload: { text: "We helped" } }], effect: "none", signal: new AbortController().signal, onStatus: () => {}, beforePublish: async (ids) => { assert.deepEqual(ids, [41]); } });
    assert.equal(raw, image);
    assert.equal(JSON.parse(sent[0].body!).contextKind, "community_moment");
    assert.equal(JSON.parse(sent[0].body!).contextId, 73);
    const published = JSON.parse(sent.at(-1)!.body!);
    assert.deepEqual(published.media_asset_ids, [41]);
    assert.deepEqual(published.tags, ["neighbors", "volunteers"]);
    assert.deepEqual(published.media_accessibility, [{ media_asset_id: 41, alt_text: "A neighborhood volunteer hands out supplies" }]);
    assert.equal(published.client_publish_id, "00000000-0000-4000-8000-000000000002");
    assert.equal(published.media, undefined);
    assert.equal(published.elements[0].type, "text");
    assert.equal(published.composition_manifest.version, 1);
  } finally {
    globalThis.fetch = oldFetch;
    (globalThis as { window?: unknown }).window = oldWindow;
    (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest = oldXHR;
  }
});

test("failed publication does not remove a recoverable user-scoped draft", async () => {
  const oldWindow = (globalThis as { window?: unknown }).window;
  const oldDb = (globalThis as { indexedDB?: unknown }).indexedDB;
  const oldXHR = (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest;
  const oldFetch = globalThis.fetch;
  const records = new Map<string, StudioDraft>();
  let failPut = false;
  (globalThis as { window?: unknown }).window = { location: { origin: "https://niakofa.test" }, indexedDB: true };
  const db = {
    objectStoreNames: { contains: () => true },
    close() {},
    transaction(_store: string, mode: string) {
      const transaction: { oncomplete?: () => void; onerror?: () => void; onabort?: () => void; objectStore: () => unknown } = {
        objectStore: () => ({
          put(value: StudioDraft) {
            if (!failPut) records.set(value.id, { ...value, files: [...value.files] });
            queueMicrotask(() => failPut ? transaction.onerror?.() : transaction.oncomplete?.());
          },
          delete(key: string) { records.delete(key); queueMicrotask(() => transaction.oncomplete?.()); },
          get(key: string) {
            const request: { result?: StudioDraft; onsuccess?: () => void; onerror?: () => void } = { result: records.get(key) };
            queueMicrotask(() => request.onsuccess?.());
            return request;
          },
        }),
      };
      void mode;
      return transaction;
    },
  };
  (globalThis as { indexedDB?: unknown }).indexedDB = {
    open() {
      const request: { result: typeof db; onsuccess?: () => void; onerror?: () => void; onupgradeneeded?: () => void } = { result: db };
      queueMicrotask(() => request.onsuccess?.());
      return request;
    },
  };
  const draft: StudioDraft & MomentStudioAccessibilityDraft = {
    id: studioDraftKey(73, null), userId: 73, contextId: 73, contextKind: "community_moment",
    clientPublishId: "00000000-0000-4000-8000-000000000001",
    caption: "We helped", files: [file("first"), file("second")], selection: [1, 0],
    previewIndex: 1, audience: "community", destinationListingId: "",
    elements: [{ type: "text", payload: { text: "We helped" } }], effect: "warmth",
    textBackground: "#172554", textColor: "#ffffff", textSize: "18", textAlign: "center",
    trimPreview: { 1: { start: 2, end: 5 } }, uploadedMediaAssetIds: [0, 0], updatedAt: Date.now(),
    momentTagsInput: "community, neighbors",
    momentAltTexts: { 0: "First attachment", 1: "Second attachment" },
    momentCaptionsVtt: {},
  };
  let postedPublishId: string | undefined;
  globalThis.fetch = async (_input, init) => {
    postedPublishId = (JSON.parse(String(init?.body)) as { client_publish_id?: string }).client_publish_id;
    return new Response(JSON.stringify({ error: "Not now" }), { status: 503 });
  };
  try {
    await saveStudioDraft(draft);
    await assert.rejects(publishStudioMoment({ userId: 73, hubId: null, audience: "community", clientPublishId: draft.clientPublishId!, files: [], caption: draft.caption, elements: draft.elements, effect: draft.effect, signal: new AbortController().signal, onStatus: () => {}, beforePublish: async (ids) => { await persistStudioPublishAttempt({ ...draft, attemptedSignature: "stable-text" }, [], ids); } }), /Not now/);
    assert.equal(postedPublishId, draft.clientPublishId, "a text-only retry keeps the draft's publication identity");
    assert.equal((await loadStudioDraft(73, null))?.files[1].name, "second");
    assert.deepEqual((await loadStudioDraft(73, null))?.selection, [1, 0]);
    assert.equal((await loadStudioDraft(73, null) as (StudioDraft & MomentStudioAccessibilityDraft) | null)?.momentTagsInput, "community, neighbors");
    assert.deepEqual((await loadStudioDraft(73, null) as (StudioDraft & MomentStudioAccessibilityDraft) | null)?.momentAltTexts, { 0: "First attachment", 1: "Second attachment" });
    assert.equal((await loadStudioDraft(74, null)), null);
    assert.equal((await loadStudioDraft(73, 88)), null);

    // A lost response after the server commits must leave the exact ordered
    // asset IDs and publish key durable before POST. Reload then retries the
    // same payload, with no second upload session.
    const signature = studioPublishSignature({ files: draft.files, selection: [1, 0], caption: draft.caption, elements: draft.elements, audience: draft.audience, hubId: null, textBackground: draft.textBackground });
    const binary = { ...draft, attemptedSignature: signature, clientPublishId: "00000000-0000-4000-8000-000000000003" };
    await saveStudioDraft(binary);
    class Upload {
      upload = { onprogress: null as null | ((event: { loaded: number; total: number; lengthComputable: boolean }) => void) };
      onload: (() => void) | null = null;
      onerror = null; ontimeout = null; onabort = null; status = 200; timeout = 0;
      open() {} setRequestHeader() {}
      send() { this.onload?.(); }
      abort() {}
    }
    (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest = Upload;
    let sessions = 0;
    let loseResponse = true;
    const posts: Array<{ client_publish_id: string; media_asset_ids: number[]; media_accessibility: unknown; tags: string[] }> = [];
    globalThis.fetch = async (path, init) => {
      const route = String(path);
      if (route === "/api/media-assets/uploads") {
        const id = ++sessions + 200;
        return new Response(JSON.stringify({ media_asset_id: id, upload: { method: "PUT", url: `/storage/${id}`, headers: {} }, complete_url: `/api/media-assets/${id}/complete` }), { status: 200 });
      }
      if (route.endsWith("/complete")) {
        const id = Number(route.match(/media-assets\/(\d+)\/complete/)?.[1]);
        return new Response(JSON.stringify({ media_asset_id: id, status: "processing" }), { status: 202 });
      }
      if (route.includes("moment-media-status")) return new Response(JSON.stringify({ assets: [201, 202].map((id) => ({ id, status: "ready", media_type: "photo", variant_ready: true })) }), { status: 200 });
      if (route === "/api/community/stories") {
        const body = JSON.parse(String(init?.body)) as { client_publish_id: string; media_asset_ids: number[]; media_accessibility: unknown; tags: string[] };
        assert.deepEqual(records.get(binary.id)?.publishAssetIds, body.media_asset_ids, "IDB commit must precede each POST");
        assert.equal(records.get(binary.id)?.clientPublishId, body.client_publish_id);
        posts.push(body);
        if (loseResponse) throw new Error("Connection lost after commit");
        return new Response(JSON.stringify({ story: { id: 917 } }), { status: 201 });
      }
      return new Response("{}", { status: 200 });
    };
    const publishBinary = (value: StudioDraft & MomentStudioAccessibilityDraft) => publishStudioMoment({
      userId: 73, hubId: null, audience: "community", clientPublishId: value.clientPublishId!,
      files: [value.files[1], value.files[0]], caption: value.caption, elements: value.elements,
      tags: parseMomentStudioTags(value.momentTagsInput),
      mediaAltTexts: [value.momentAltTexts[1], value.momentAltTexts[0]],
      mediaCaptionsVtt: [value.momentCaptionsVtt[1] ?? "", value.momentCaptionsVtt[0] ?? ""],
      effect: value.effect, signal: new AbortController().signal, onStatus: () => {},
      uploadedIds: [value.uploadedMediaAssetIds?.[1] ?? 0, value.uploadedMediaAssetIds?.[0] ?? 0],
      beforePublish: async (ids) => { await persistStudioPublishAttempt(value, [1, 0], ids); },
    });
    await assert.rejects(publishBinary(binary), /Connection lost/);
    const recovered = await loadStudioDraft(73, null) as (StudioDraft & MomentStudioAccessibilityDraft) | null;
    assert.deepEqual(recovered?.uploadedMediaAssetIds, [202, 201]);
    assert.deepEqual(recovered?.publishAssetIds, [201, 202]);
    assert.equal(recovered?.clientPublishId, binary.clientPublishId);
    loseResponse = false;
    await publishBinary(recovered!);
    assert.equal(sessions, 2, "retries must not upload a second copy");
    assert.deepEqual(posts[0], posts[1], "retry keeps the same ordered IDs and publication identity");
    assert.deepEqual(posts[0].media_accessibility, [
      { media_asset_id: 201, alt_text: "Second attachment" },
      { media_asset_id: 202, alt_text: "First attachment" },
    ], "retries preserve the metadata mapped to the ordered attachments");
    assert.deepEqual(posts[0].tags, ["community", "neighbors"]);

    // When the IDB write fails, not even a text-only POST may leave the device.
    let postedAfterFailure = false;
    globalThis.fetch = async () => { postedAfterFailure = true; return new Response("{}", { status: 200 }); };
    failPut = true;
    await assert.rejects(publishStudioMoment({
      userId: 73, hubId: null, audience: "community", clientPublishId: binary.clientPublishId!,
      files: [], caption: binary.caption, elements: binary.elements, effect: binary.effect,
      signal: new AbortController().signal, onStatus: () => {},
      beforePublish: async (ids) => { await persistStudioPublishAttempt(binary, [], ids); },
    }), /Nothing was published/);
    assert.equal(postedAfterFailure, false);
    failPut = false;
    await persistStudioDraft({ ...draft, files: [], selection: [], caption: "", elements: [] });
    assert.equal(await loadStudioDraft(73, null), null, "clearing the final media and caption cannot resurrect removed content");
    await saveStudioDraft({ ...draft, exchangeDraftId: 915, exchangeFileFingerprint: "help.mp4", files: [], selection: [], caption: "", elements: [] });
    await persistStudioDraft({ ...draft, exchangeDraftId: 915, exchangeFileFingerprint: "help.mp4", files: [], selection: [], caption: "", elements: [] });
    assert.equal((await loadStudioDraft(73, null))?.exchangeDraftId, 915, "server-owned Exchange drafts survive an empty local editor");
    await discardStudioDraft(73, null);
    assert.equal(await loadStudioDraft(73, null), null);
  } finally {
    globalThis.fetch = oldFetch;
    (globalThis as { window?: unknown }).window = oldWindow;
    (globalThis as { indexedDB?: unknown }).indexedDB = oldDb;
    (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest = oldXHR;
  }
});