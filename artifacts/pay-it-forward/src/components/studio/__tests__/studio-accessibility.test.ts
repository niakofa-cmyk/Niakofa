import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { studioReducer, initialStudioState } from "../studio-machine";
import { ALT_TEXT_MAX, accessibilityArrays, missingAltIds, momentAccessibilityIssues } from "../studio-accessibility";
import { trimmedItem, untrimmedItem } from "../studio-media";
import type { StudioItem } from "../studio-policy";

const file = (type: string) => ({ type, size: 10, name: "f" }) as unknown as File;
let n = 0;
const item = (kind: "photo" | "video", over: Partial<StudioItem> = {}): StudioItem => ({
  id: `a${++n}`, file: file(kind === "video" ? "video/mp4" : "image/jpeg"), kind, durationMs: kind === "video" ? 5000 : null, source: "camera", coverTimeMs: 0, ...over,
});
const okVtt = () => null;

test("every photo and video needs a description before a Moment can be shared", () => {
  const issues = momentAccessibilityIssues([item("photo"), item("video", { altText: "A dog" })], okVtt);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].position, 1);
  assert.match(issues[0].message, /Describe photo 1/);
  assert.deepEqual(momentAccessibilityIssues([item("photo", { altText: "  a cat " })], okVtt), []);
  assert.equal(momentAccessibilityIssues([item("photo", { altText: "x".repeat(ALT_TEXT_MAX + 1) })], okVtt).length, 1);
  assert.equal(momentAccessibilityIssues([], okVtt).length, 0);
});

test("captions are checked only for video, using the injected WebVTT validator", () => {
  const video = item("video", { altText: "x", captionsVtt: "bad" });
  const issues = momentAccessibilityIssues([video], () => "Caption cues need a WEBVTT header.");
  assert.match(issues[0].message, /captions: Caption cues need a WEBVTT header/);
  const photo = item("photo", { altText: "x", captionsVtt: "bad" });
  assert.equal(momentAccessibilityIssues([photo], () => "never called").length, 0);
});

test("publish arrays line up with the kept files and drop captions on photos", () => {
  const a = item("photo", { altText: " one " });
  const b = item("video", { altText: "two", captionsVtt: " WEBVTT " });
  assert.deepEqual(accessibilityArrays([a, b]), { mediaAltTexts: ["one", "two"], mediaCaptionsVtt: ["", "WEBVTT"] });
  assert.deepEqual([...missingAltIds([a, item("photo")])].length, 1);
});

test("reducer keeps description, captions and tags; trimming keeps the description but drops stale captions", () => {
  const v = item("video");
  let s = studioReducer(initialStudioState(), { type: "add", items: [v] });
  s = studioReducer(s, { type: "alt", id: v.id, text: "Skater lands a kickflip" });
  s = studioReducer(s, { type: "captions", id: v.id, vtt: "WEBVTT" });
  s = studioReducer(s, { type: "tags", value: "skate, fort-worth" });
  assert.equal(s.items[0].altText, "Skater lands a kickflip");
  assert.equal(s.tagsInput, "skate, fort-worth");
  const trimmed = trimmedItem(s.items[0], file("video/mp4"), 3000);
  assert.equal(trimmed.altText, "Skater lands a kickflip");
  assert.equal(trimmed.captionsVtt, "");
  assert.equal(untrimmedItem(trimmed).captionsVtt, "");
  assert.deepEqual(studioReducer(s, { type: "captions", id: "nope", vtt: "x" }).items, s.items);
  const photo = item("photo");
  const sp = studioReducer(studioReducer(initialStudioState(), { type: "add", items: [photo] }), { type: "captions", id: photo.id, vtt: "WEBVTT" });
  assert.equal(sp.items[0].captionsVtt, undefined);
});

test("Studio limits stay in step with the Moment publish contract", () => {
  const contract = readFileSync(new URL("../../community/moment-studio-accessibility.ts", import.meta.url), "utf8");
  assert.match(contract, new RegExp(`MOMENT_ACCESSIBILITY_MAX_ALT_LENGTH = ${ALT_TEXT_MAX}`));
});

test("the Moment publisher passes descriptions, captions and tags and fails before uploading when one is missing", () => {
  const src = readFileSync(new URL("../studio-publishers.ts", import.meta.url), "utf8");
  assert.match(src, /mediaAltTexts,\s*\n\s*mediaCaptionsVtt,/);
  assert.match(src, /momentAccessibilityIssues\(momentItems/);
  assert.ok(src.indexOf("momentAccessibilityIssues(momentItems") < src.indexOf("publishStudioMoment({"), "the check must run before the upload ladder");
});
