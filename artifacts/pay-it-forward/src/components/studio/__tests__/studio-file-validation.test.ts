import assert from "node:assert/strict";
import test from "node:test";
import { validateStudioFile } from "../studio-file-validation";
import { initialStudioState, studioReducer } from "../studio-machine";

test("Studio rejects disguised or empty files before entering review", async () => {
  await assert.rejects(validateStudioFile(new File(["text"], "renamed.png", { type: "image/png" })), /contents don't match/);
  await assert.rejects(validateStudioFile(new File([], "empty.png", { type: "image/png" })), /between 1 byte/);
  await assert.rejects(validateStudioFile(new File(["text"], "file.txt", { type: "text/plain" })), /Choose a JPEG/);
});

test("Studio accepts supported signatures and recorder MIME codec parameters", async () => {
  const fixtures: Array<[string, number[]]> = [
    ["image/jpeg", [0xff, 0xd8, 0xff]],
    ["image/png", [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
    ["image/gif", Array.from(Buffer.from("GIF89a"))],
    ["image/webp", Array.from(Buffer.from("RIFFxxxxWEBP"))],
    ["video/mp4", Array.from(Buffer.from("xxxxftypisom"))],
    ["video/webm;codecs=vp9,opus", [0x1a, 0x45, 0xdf, 0xa3]],
  ];
  for (const [type, bytes] of fixtures) {
    await assert.doesNotReject(validateStudioFile(new File([new Uint8Array(bytes)], "fixture", { type })));
  }
});

test("selection errors preserve the current step, text, and existing items", () => {
  const state = { ...initialStudioState("review"), caption: "Keep my text" };
  const next = studioReducer(state, { type: "selectionError", message: "Choose another file" });
  assert.equal(next.mode, "review");
  assert.equal(next.caption, state.caption);
  assert.equal(next.items, state.items);
  assert.equal(next.error, "Choose another file");
});
