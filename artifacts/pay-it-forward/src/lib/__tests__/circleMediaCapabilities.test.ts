import test from "node:test";
import assert from "node:assert/strict";
import { getAudioCircleMediaCapabilities } from "../circleMediaCapabilities";

test("media capability checks do not prompt or require the retired mesh", () => {
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const previousMediaRecorder = Object.getOwnPropertyDescriptor(globalThis, "MediaRecorder");
  const previousAudioContext = Object.getOwnPropertyDescriptor(globalThis, "AudioContext");

  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { mediaDevices: { getUserMedia: () => Promise.resolve() } },
  });
  Object.defineProperty(globalThis, "MediaRecorder", {
    configurable: true,
    value: class MediaRecorder {},
  });
  Object.defineProperty(globalThis, "AudioContext", {
    configurable: true,
    value: class AudioContext {},
  });

  try {
    assert.deepEqual(getAudioCircleMediaCapabilities(), {
      microphone: true,
      camera: true,
      recording: true,
    });
  } finally {
    if (previousNavigator) Object.defineProperty(globalThis, "navigator", previousNavigator);
    else delete (globalThis as { navigator?: unknown }).navigator;
    if (previousMediaRecorder) Object.defineProperty(globalThis, "MediaRecorder", previousMediaRecorder);
    else delete (globalThis as { MediaRecorder?: unknown }).MediaRecorder;
    if (previousAudioContext) Object.defineProperty(globalThis, "AudioContext", previousAudioContext);
    else delete (globalThis as { AudioContext?: unknown }).AudioContext;
  }
});