import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  STORY_CAMERA_CLIP_MAX_MS,
  STORY_CAMERA_MAX_ITEMS,
  STORY_CAMERA_MAX_RECORDING_MS,
  storyCameraConstraints,
  storyCameraErrorMessage,
  storyCameraRecordingConstraints,
  chooseRecorderMimeType,
  recordedVideoMimeType,
  storyCameraPlaybackErrorMessage,
} from "../story-camera-utils";

const component = readFileSync(new URL("../StoryCameraRecorder.tsx", import.meta.url), "utf8");
const storyRail = readFileSync(new URL("../CommunityStoryRail.tsx", import.meta.url), "utf8");

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

test("camera keeps each clip within a Moment and allows a longer Spark for Family Stories", () => {
  assert.equal(STORY_CAMERA_MAX_ITEMS, 6);
  assert.equal(STORY_CAMERA_CLIP_MAX_MS, 60_000);
  assert.equal(STORY_CAMERA_MAX_RECORDING_MS, 180_000);
  assert.match(component, /clips\.length >= MAX_ITEMS/);
  assert.match(component, /recordedVideoMsRef\.current >= MAX_RECORDING_MS/);
  assert.match(component, /Math\.min\(CLIP_MAX_MS, Math\.max\(0, MAX_RECORDING_MS - recordedVideoMsRef\.current\)\)/);
  assert.match(component, /Family Story length/);
});

test("recording keeps one camera session and degrades safely when microphone access fails", () => {
  assert.deepEqual(storyCameraRecordingConstraints("user").audio, true);
  assert.equal((storyCameraRecordingConstraints("environment").video as MediaTrackConstraints).facingMode && true, true);
  assert.match(component, /phase === "camera" \|\| phase === "countdown" \|\| phase === "recording" \|\| phase === "paused"/);
  assert.doesNotMatch(component, /if \(video\.srcObject === streamRef\.current\) video\.srcObject = null/);
  assert.doesNotMatch(component, /getUserMedia\(\{ audio: true \}\)/);
  const startCamera = component.slice(component.indexOf("const startCamera"), component.indexOf("useEffect(() => {\n    void startCamera"));
  const beginRecording = component.slice(component.indexOf("const beginRecording"), component.indexOf("const startRecording"));
  assert.match(startCamera, /getUserMedia\(\{ \.\.\.constraints, audio: true \}\)/);
  assert.match(startCamera, /A microphone denial must not block video-only recording/);
  assert.match(startCamera, /getUserMedia\(constraints\);\s*setMicUnavailable\(true\)/);
  assert.match(startCamera, /recordingAudioRef\.current = acquiredAudio/);
  assert.doesNotMatch(beginRecording, /getUserMedia|ensureMicrophone/);
  assert.match(beginRecording, /recordingAudioRef\.current\?\.getAudioTracks\(\)\.filter/);
  assert.match(beginRecording, /new MediaStream\(\[\.\.\.recordingStream\.getVideoTracks\(\), \.\.\.audioTracks\]\)/);
  assert.match(component, /new MediaRecorder\(recorderInput, \{ mimeType \}\)/);
  assert.match(component, /status-spark-microphone/);
});

test("camera permission and device errors are explained without relying on DOMException support", () => {
  assert.match(storyCameraErrorMessage({ name: "NotAllowedError" }), /permission was denied/i);
  assert.match(storyCameraErrorMessage({ name: "NotFoundError" }), /No camera or microphone/);
  assert.equal(storyCameraErrorMessage(new Error("Unsupported")), "Unsupported");
  assert.match(storyCameraErrorMessage(null), /Camera access could not be started/);
});

test("recording uses a clip format the same browser can play", () => {
  const chrome = (type: string) => type.startsWith("video/webm") || type === "video/mp4";
  assert.equal(chooseRecorderMimeType(true, chrome, (type) => type === "video/webm" ? "probably" : ""), "video/webm;codecs=vp8,opus");
  assert.equal(chooseRecorderMimeType(false, (type) => type === "video/mp4", (type) => type === "video/mp4" ? "maybe" : ""), "video/mp4");
  assert.equal(chooseRecorderMimeType(true, () => false, () => "probably"), "");
  assert.match(component, /chooseRecorderMimeType\(/);
  assert.match(component, /playsInline controls preload="auto"/);
  assert.match(component, /data-testid="button-play-spark-preview"/);
  assert.match(component, /const actualMimeType = recordedVideoMimeType\(chunksRef\.current, recorder\.mimeType, mimeType\)/);
  assert.match(component, /const baseType = actualMimeType\.split\(";"\)\[0\]/);
  assert.match(component, /new File\(\[blob\]/);
  assert.match(component, /type: baseType/);
  assert.match(storyRail, /const onCameraVideo = \(recorded: File\[\]\) => \{[\s\S]*?selectStudioFiles\(recorded\)/);
  assert.match(storyRail, /selectedPreviewFile\?\.type\.startsWith\("video\/"\) \? <video ref=\{previewVideo\} key=\{selectedFileUrl\} src=\{selectedFileUrl\} controls playsInline preload="metadata"/);
  assert.doesNotMatch(component, /toDataURL/);
  assert.doesNotMatch(component, /nia-spark-camera__shade/);
  assert.match(component, /previewUrlRef.current !== url/);
  assert.match(component, /video.error\?\.code === 1/);
  assert.match(component, /nia-spark-camera--playback/);
  assert.match(component, /fixed inset-0 z-\[120\] h-\[100dvh\] w-screen/);
  assert.doesNotMatch(component, />Start camera</);
  assert.match(component, /stopTracks\(\);\s+setPhase\("preview"\);/);
  assert.match(component, /if \(streamRef\.current\) setPhase\("camera"\);\s*else \{\s*setPhase\("idle"\);\s*void startCamera\(\);/);
});

test("recorded files use the emitted MIME type and transient playback aborts do not look like corrupt clips", () => {
  const emitted = new Blob(["clip"], { type: "video/mp4;codecs=avc1" });
  assert.equal(recordedVideoMimeType([emitted], "video/webm", "video/webm;codecs=vp8"), "video/mp4;codecs=avc1");
  assert.equal(recordedVideoMimeType([], "", "video/webm;codecs=vp8"), "video/webm;codecs=vp8");
  assert.equal(storyCameraPlaybackErrorMessage({ name: "AbortError" }), null);
  assert.match(storyCameraPlaybackErrorMessage({ name: "NotAllowedError" }) ?? "", /blocked.*video controls/i);
  assert.match(storyCameraPlaybackErrorMessage(new Error("decode failed")) ?? "", /preview could not be loaded/i);
});

test("fresh Sparks open the live camera immediately, and restored drafts resume in the studio", () => {
  assert.match(storyRail, /const beginCreateSpark = \(\) => \{\s*setComposerOpen\(true\);\s*setCameraOpen\(true\);/);
  assert.match(storyRail, /recoveredDraftRef\.current = hasRecoverableWork/);
  assert.match(storyRail, /recoveredScopeRef\.current !== scopeKey/);
  assert.match(storyRail, /if \(!draftReady\s*\|\|\s*draftError/);
  assert.match(storyRail, /if \(!hasStudioWork\) setCameraOpen\(true\)/);
  assert.match(storyRail, /else setCameraOpen\(false\)/);
  assert.match(storyRail, /if \(cameraOpen\) \{ cancelCamera\(\); return; \}/);
  assert.match(storyRail, /composerOpen && !cameraOpen && draftReady/);
});

test("camera offers Gallery and text alternatives and closes Gallery before camera navigation", () => {
  assert.match(component, /onClick=\{onGallery\} data-testid="button-spark-camera-gallery"/);
  assert.match(component, /onClick=\{onText\} data-testid="button-spark-camera-text"/);
  assert.match(storyRail, /setGalleryOpen\(false\); setCameraOpen\(true\)/);
  assert.match(storyRail, /onCancel=\{cancelCamera\}/);
  assert.match(storyRail, /allowText=\{!responseTargetId\}/);
});