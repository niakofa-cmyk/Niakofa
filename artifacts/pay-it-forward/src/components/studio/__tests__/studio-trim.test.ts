import assert from "node:assert/strict";
import test from "node:test";
import { initialStudioState, studioReducer } from "../studio-machine";
import { trimmedItem, untrimmedItem } from "../studio-media";
import { destinationAvailability, type StudioItem } from "../studio-policy";
import { MIN_TRIM_MS, isFullRange, moveTrimHandle, trimmedDurationMs, trimmedFileName, validateTrimRange } from "../studio-trim";

const file = (type: string, size = 1000, name = "clip.webm") => ({ type, size, name }) as unknown as File;
const video = (over: Partial<StudioItem> = {}): StudioItem => ({ id: "v1", file: file("video/webm"), kind: "video", durationMs: 20_000, source: "camera", coverTimeMs: 1500, ...over });

test("trim range validation: order, minimum length, bounds", () => {
  assert.equal(validateTrimRange({ startMs: 0, endMs: 5000 }, 20_000), null);
  assert.match(validateTrimRange({ startMs: -1, endMs: 5000 }, 20_000) ?? "", /before the video/);
  assert.match(validateTrimRange({ startMs: 4000, endMs: 4000 + MIN_TRIM_MS - 1 }, 20_000) ?? "", /at least 1 second/);
  assert.match(validateTrimRange({ startMs: 0, endMs: 25_000 }, 20_000) ?? "", /after the video/);
  assert.match(validateTrimRange({ startMs: NaN, endMs: 5000 }, 20_000) ?? "", /valid/);
  assert.equal(trimmedDurationMs({ startMs: 2000, endMs: 9500 }), 7500);
  assert.equal(isFullRange({ startMs: 0, endMs: 20_000 }, 20_000), true);
  assert.equal(isFullRange({ startMs: 500, endMs: 20_000 }, 20_000), false);
});

test("dragging a handle past the other keeps a valid, ordered range", () => {
  const range = { startMs: 5000, endMs: 10_000 };
  assert.deepEqual(moveTrimHandle(range, "start", 12_000, 20_000), { startMs: 10_000 - MIN_TRIM_MS, endMs: 10_000 });
  assert.deepEqual(moveTrimHandle(range, "end", 1000, 20_000), { startMs: 5000, endMs: 5000 + MIN_TRIM_MS });
  assert.deepEqual(moveTrimHandle(range, "start", -50, 20_000), { startMs: 0, endMs: 10_000 });
  assert.deepEqual(moveTrimHandle(range, "end", 99_000, 20_000), { startMs: 5000, endMs: 20_000 });
  assert.equal(trimmedFileName("studio-1.mp4", "mp4"), "studio-1-trimmed.mp4");
});

test("trimming swaps the clip in place, keeps the first original through repeat trims, and reset restores it", () => {
  const source = video();
  const once = trimmedItem(source, file("video/webm", 500, "t1.webm"), 8000);
  assert.notEqual(once.id, source.id, "new identity so the object-URL cache is not reused");
  assert.equal(once.durationMs, 8000);
  assert.equal(once.coverTimeMs, 0, "cover time referred to the old timeline");
  assert.equal(once.original?.file, source.file);
  const twice = trimmedItem(once, file("video/webm", 300, "t2.webm"), 4000);
  assert.equal(twice.original?.file, source.file, "second trim must not replace the original");
  assert.equal(twice.original?.durationMs, 20_000);
  const back = untrimmedItem(twice);
  assert.equal(back.file, source.file);
  assert.equal(back.durationMs, 20_000);
  assert.equal(back.original, undefined);
  assert.equal(untrimmedItem(source), source);
});

test("reducer replace keeps order and selection, and ignores unknown ids", () => {
  const a = video({ id: "a" }); const b = video({ id: "b" });
  let s = studioReducer(initialStudioState(), { type: "add", items: [a, b] });
  s = studioReducer(s, { type: "select", id: "a" });
  const a2 = trimmedItem(a, file("video/webm"), 5000);
  s = studioReducer(s, { type: "replace", id: "a", item: a2 });
  assert.deepEqual(s.items.map((item) => item.id), [a2.id, "b"]);
  assert.equal(s.activeId, a2.id);
  assert.equal(studioReducer(s, { type: "replace", id: "zzz", item: a2 }), s);
});

test("Family size limit is judged on the ORIGINAL capture, not the trimmed copy", () => {
  const ctx = { hasExchangeListing: false, hasFamilySpace: true };
  const big = file("video/webm", 30 * 1024 * 1024);
  const trimmed = trimmedItem(video({ file: big }), file("video/webm", 2 * 1024 * 1024), 5000);
  assert.equal(destinationAvailability([trimmed], ctx).family_story.ok, false);
  assert.equal(destinationAvailability([video({ file: file("video/webm", 2 * 1024 * 1024) })], ctx).family_story.ok, true);
});
