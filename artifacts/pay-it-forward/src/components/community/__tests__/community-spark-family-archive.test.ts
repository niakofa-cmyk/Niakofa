import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  canCopyStudioFilesToFamily,
  FAMILY_STORY_CANDIDATE_DURATION_MS,
  FAMILY_STORY_MAX_FILE_BYTES,
  totalStudioVideoDurationMs,
} from "../community-spark-family-archive";

const storyRailSource = readFileSync(new URL("../CommunityStoryRail.tsx", import.meta.url), "utf8");
const composerChromeSource = readFileSync(new URL("../CommunityStoryVisual.tsx", import.meta.url), "utf8");
const familyStoriesSource = readFileSync(new URL("../../family/FamilyStoriesExperience.tsx", import.meta.url), "utf8");

function studioFile(type: string, size = 1024): File {
  return { type, size } as unknown as File;
}

test("Family Story candidate duration sums selected videos, not photos", () => {
  const files = [
    studioFile("video/mp4"),
    studioFile("image/jpeg"),
    studioFile("video/webm"),
  ];
  const duration = totalStudioVideoDurationMs(files, [35_000, 0, 25_000]);
  assert.equal(duration, FAMILY_STORY_CANDIDATE_DURATION_MS);
  assert.equal(totalStudioVideoDurationMs(files, [35_001, 0, 25_000]) > FAMILY_STORY_CANDIDATE_DURATION_MS, true);
});

test("Family copy accepts only supported nonempty items at or below 20 MB", () => {
  assert.equal(canCopyStudioFilesToFamily([
    studioFile("image/jpeg"),
    studioFile("video/webm", FAMILY_STORY_MAX_FILE_BYTES),
  ]), true);
  assert.equal(canCopyStudioFilesToFamily([]), false);
  assert.equal(canCopyStudioFilesToFamily([studioFile("video/quicktime")]), false);
  assert.equal(canCopyStudioFilesToFamily([studioFile("image/png", 0)]), false);
  assert.equal(canCopyStudioFilesToFamily([studioFile("video/mp4", FAMILY_STORY_MAX_FILE_BYTES + 1)]), false);
});

test("recovered Studio work resumes in editing, and Create a Spark skips the source chooser", () => {
  assert.match(storyRailSource, /if \(hasRecoverableWork\) setStudioStep\("edit"\)/);
  assert.doesNotMatch(storyRailSource, /What’s happening/);
  assert.doesNotMatch(composerChromeSource, /What’s happening/);
  assert.doesNotMatch(composerChromeSource, /Choose how to start/);
  assert.match(composerChromeSource, /step === "destination" \? \(\) => onStep\("edit"\) : onClose/);
  assert.doesNotMatch(composerChromeSource, /step === "edit" \? onStep\("source"\)/);
  assert.match(storyRailSource, /setFamilyStoryCopyEnabled\(true\)/);
});

test("private Family Story media opens with the authenticated Family asset client", () => {
  assert.match(familyStoriesSource, /useAuthorizedFamilyAsset\(asset\.storage_key\)/);
  assert.match(familyStoriesSource, /<video controls playsInline preload="metadata"/);
  assert.match(familyStoriesSource, /<img src=\{url\} alt="Private Family Story photo"/);
});