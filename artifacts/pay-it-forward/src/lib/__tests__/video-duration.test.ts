import assert from "node:assert/strict";
import test from "node:test";
import { readVideoDurationSeconds } from "../video-duration";

class MockVideo {
  duration = Infinity;
  src = "";
  preload = "";
  seekable = { length: 0, end: (_index: number) => 0 };
  onloadedmetadata: ((event: Event) => void) | null = null;
  ondurationchange: ((event: Event) => void) | null = null;
  onseeked: ((event: Event) => void) | null = null;
  ontimeupdate: ((event: Event) => void) | null = null;
  onloadeddata: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  private time = 0;

  get currentTime() { return this.time; }
  set currentTime(value: number) {
    this.time = value;
    this.duration = 4.275;
    queueMicrotask(() => {
      this.ondurationchange?.(new Event("durationchange"));
      this.onseeked?.(new Event("seeked"));
    });
  }
  load() {
    if (this.src) queueMicrotask(() => this.onloadedmetadata?.(new Event("loadedmetadata")));
  }
  pause() {}
  removeAttribute(name: string) { if (name === "src") this.src = ""; }
}

async function withMockVideo(run: (video: MockVideo) => Promise<void>) {
  const video = new MockVideo();
  const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, "document");
  const createObjectURLDescriptor = Object.getOwnPropertyDescriptor(URL, "createObjectURL");
  const revokeObjectURLDescriptor = Object.getOwnPropertyDescriptor(URL, "revokeObjectURL");
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { createElement: () => video as unknown as HTMLVideoElement },
  });
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: () => "blob:mock-video" });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: () => {} });
  try {
    await run(video);
  } finally {
    if (documentDescriptor) Object.defineProperty(globalThis, "document", documentDescriptor);
    else Reflect.deleteProperty(globalThis, "document");
    if (createObjectURLDescriptor) Object.defineProperty(URL, "createObjectURL", createObjectURLDescriptor);
    else Reflect.deleteProperty(URL, "createObjectURL");
    if (revokeObjectURLDescriptor) Object.defineProperty(URL, "revokeObjectURL", revokeObjectURLDescriptor);
    else Reflect.deleteProperty(URL, "revokeObjectURL");
  }
}

test("recovers duration for MediaRecorder WebM when metadata initially reports Infinity", async () => {
  await withMockVideo(async (video) => {
    assert.equal(await readVideoDurationSeconds(new Blob(["webm"]), 100), 4.275);
    assert.equal(video.currentTime, Number.MAX_SAFE_INTEGER, "unknown duration triggers an end seek");
  });
});

test("uses finite video metadata without seeking", async () => {
  await withMockVideo(async (video) => {
    video.duration = 2.5;
    assert.equal(await readVideoDurationSeconds(new Blob(["mp4"]), 100), 2.5);
    assert.equal(video.currentTime, 0);
  });
});

test("uses the last finite seekable point when duration remains infinite", async () => {
  await withMockVideo(async (video) => {
    video.seekable = { length: 1, end: () => 6.125 };
    Object.defineProperty(video, "currentTime", {
      configurable: true,
      get: () => 0,
      set: () => queueMicrotask(() => video.onseeked?.(new Event("seeked"))),
    });
    assert.equal(await readVideoDurationSeconds(new Blob(["webm"]), 100), 6.125);
  });
});
