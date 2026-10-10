import assert from "node:assert/strict";
import test from "node:test";
import { initialStudioState, studioReducer, type StudioState } from "../studio-machine";
import {
  CAMERA_CLIP_MAX_MS, STUDIO_MAX_ITEMS, destinationAvailability, momentCutdownIds,
  needsFamilyOriginalOffer, remainingCaptureMs, totalVideoMs, type StudioItem,
} from "../studio-policy";

const file = (type: string, size = 1000) => ({ type, size, name: "f" }) as unknown as File;
let n = 0;
const item = (kind: "photo" | "video", durationMs: number | null = null, over: Partial<StudioItem> = {}): StudioItem => ({
  id: `i${++n}`, file: file(kind === "video" ? "video/mp4" : "image/jpeg"), kind, durationMs, source: "camera", coverTimeMs: 0, ...over,
});
const run = (state: StudioState, ...actions: Parameters<typeof studioReducer>[1][]) => actions.reduce(studioReducer, state);

test("capture budget shrinks as clips are chained and never exceeds one clip cap", () => {
  assert.equal(remainingCaptureMs([]), CAMERA_CLIP_MAX_MS);
  assert.equal(remainingCaptureMs([item("video", 60_000), item("video", 60_000)]), CAMERA_CLIP_MAX_MS);
  assert.equal(remainingCaptureMs([item("video", 60_000), item("video", 60_000), item("video", 50_000)]), 10_000);
  assert.equal(remainingCaptureMs([item("video", 90_000), item("video", 90_000)]), 0);
  assert.equal(totalVideoMs([item("photo"), item("video", 4000)]), 4000);
});

test("over-cap selections keep earliest whole clips and photos, never alter originals", () => {
  const items = [item("video", 55_000), item("photo"), item("video", 55_000), item("video", 55_000), item("video", 55_000)];
  assert.deepEqual(momentCutdownIds(items), [items[0].id, items[1].id, items[2].id, items[3].id]);
  assert.equal(needsFamilyOriginalOffer(items), true);
  assert.equal(needsFamilyOriginalOffer([item("video", 180_000)]), false);
});

test("destinations: moment cut-down allowed, exchange needs listing + single short video, family needs space", () => {
  const ctx = { hasExchangeListing: false, hasFamilySpace: false };
  assert.equal(destinationAvailability([], ctx).moment.ok, false);
  const long = [item("video", 55_000), item("video", 55_000), item("video", 55_000), item("video", 55_000)];
  const over = destinationAvailability(long, ctx);
  assert.equal(over.moment.ok, true);
  assert.match(over.moment.note ?? "", /earliest clips/);
  assert.equal(destinationAvailability([item("video", 200_000)], ctx).moment.ok, false);
  assert.equal(destinationAvailability([item("video", 5000)], ctx).exchange_spark.ok, false);
  const withListing = { hasExchangeListing: true, hasFamilySpace: true };
  assert.equal(destinationAvailability([item("video", 5000)], withListing).exchange_spark.ok, true);
  assert.equal(destinationAvailability([item("video", 61_000)], withListing).moment.ok, false);
  assert.equal(destinationAvailability([item("video", 61_000)], withListing).exchange_spark.ok, true);
  assert.equal(destinationAvailability([item("video", 5000), item("photo")], withListing).exchange_spark.ok, false);
  assert.equal(destinationAvailability([item("video", 200_000)], withListing).exchange_spark.ok, false);
  const big = item("video", 5000, { file: file("video/mp4", 30 * 1024 * 1024) });
  assert.equal(destinationAvailability([big], withListing).family_story.ok, false);
  assert.equal(destinationAvailability([item("photo")], withListing).family_story.ok, true);
});

test("a chained camera clip stays in capture; a photo or library pick moves to review", () => {
  const s0 = initialStudioState();
  assert.equal(run(s0, { type: "add", items: [item("video", 3000)] }).mode, "capture");
  assert.equal(run(s0, { type: "add", items: [item("photo")], goReview: true }).mode, "review");
});

test("item cap, selection, reorder, delete-last returns to the live camera", () => {
  let s = run(initialStudioState(), { type: "add", items: Array.from({ length: 8 }, () => item("photo")) });
  assert.equal(s.items.length, STUDIO_MAX_ITEMS);
  assert.match(s.error, /first 6/);
  const [a, b] = s.items;
  s = run(s, { type: "move", id: a.id, to: 1 });
  assert.equal(s.items[1].id, a.id);
  assert.equal(s.items[0].id, b.id);
  s = run(initialStudioState(), { type: "add", items: [item("photo")], goReview: true });
  s = run(s, { type: "remove", id: s.items[0].id });
  assert.equal(s.mode, "capture");
  assert.equal(s.activeId, null);
});

test("cannot enter review/publish with nothing; text-only is allowed once there is a caption", () => {
  assert.equal(run(initialStudioState(), { type: "mode", mode: "review" }).mode, "capture");
  const s = run(initialStudioState(), { type: "caption", caption: "hello" }, { type: "mode", mode: "review" });
  assert.equal(s.mode, "review");
});

test("a failed publish returns to the sheet with items and caption intact", () => {
  let s = run(initialStudioState(), { type: "add", items: [item("photo")], goReview: true }, { type: "caption", caption: "hi" }, { type: "mode", mode: "publishing" });
  s = run(s, { type: "progress", label: "Uploading", percent: 40.4 }, { type: "fail", message: "offline" });
  assert.equal(s.mode, "publish");
  assert.equal(s.items.length, 1);
  assert.equal(s.caption, "hi");
  assert.equal(s.error, "offline");
  assert.equal(s.progress.percent, 0);
});

test("adding past the cap from capture is refused with a message, not a crash", () => {
  const full = run(initialStudioState(), { type: "add", items: Array.from({ length: STUDIO_MAX_ITEMS }, () => item("photo")) });
  assert.match(run(full, { type: "mode", mode: "capture" }).error, /Up to 6/);
});
