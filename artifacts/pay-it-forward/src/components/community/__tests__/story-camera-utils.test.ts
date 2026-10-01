import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  STORY_CAMERA_MAX_ITEMS,
  STORY_CAMERA_MAX_RECORDING_MS,
  storyCameraConstraints,
  storyCameraErrorMessage,
} from "../story-camera-utils";

const component = readFileSync(new URL("../StoryCameraRecorder.tsx", import.meta.url), "utf8");

test("camera constraints default to front-facing and can request the other camera", () => {
  assert.deepEqual(storyCameraConstraints("user"), {
    video: { facingMode: { ideal: "user" }, width: { ideal: 1080 }, height: { ideal: 1920 } },
    audio: false,
  });
  assert.deepEqual(storyCameraConstraints("environment", true), {
    video: { facingMode: { exact: "environment" }, width: { ideal: 1080 }, height: { ideal: 1920 } },
    audio: false,
  });
  assert.match(component, /useState<StoryCameraFacingMode>\("user"\)/);
  assert.match(component, /void startCamera\(\);\s*\/\/ Camera acquisition is intentionally started as soon as the choice mounts/);
});

test("camera limits remain six items and sixty seconds", () => {
  assert.equal(STORY_CAMERA_MAX_ITEMS, 6);
  assert.equal(STORY_CAMERA_MAX_RECORDING_MS, 60_000);
  assert.match(component, /clips\.length >= MAX_ITEMS/);
  assert.match(component, /recordedVideoMsRef\.current >= MAX_RECORDING_MS/);
});

test("camera permission and device errors are explained without relying on DOMException support", () => {
  assert.match(storyCameraErrorMessage({ name: "NotAllowedError" }), /permission was denied/i);
  assert.match(storyCameraErrorMessage({ name: "NotFoundError" }), /No camera or microphone/);
  assert.equal(storyCameraErrorMessage(new Error("Unsupported")), "Unsupported");
  assert.match(storyCameraErrorMessage(null), /Camera access could not be started/);
});

test("camera surface is edge-to-edge and releases tracks before recording preview", () => {
  assert.match(component, /fixed inset-0 z-\[70\] h-\[100dvh\] w-screen/);
  assert.doesNotMatch(component, />Start camera</);
  assert.match(component, /stopTracks\(\);\s+setPhase\("preview"\);/);
  assert.match(component, /if \(streamRef\.current\) setPhase\("camera"\);\s*else \{\s*setPhase\("idle"\);\s*void startCamera\(\);/);
});