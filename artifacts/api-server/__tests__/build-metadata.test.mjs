import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { resolveBuildCommit } from "../build-metadata.mjs";

test("prefers an explicit deployment commit", () => {
  assert.equal(
    resolveBuildCommit(
      {
        GIT_COMMIT: "29b5252aa4740ec3",
        RAILWAY_GIT_COMMIT_SHA: "aaaaaaaaaaaaaaa",
      },
      "/directory/without/a-git-repository",
    ),
    "29b5252aa4740ec3",
  );
});

test("uses provider commit metadata when GIT_COMMIT is absent", () => {
  assert.equal(
    resolveBuildCommit(
      { RAILWAY_GIT_COMMIT_SHA: "b9d7d7401234567" },
      "/directory/without/a-git-repository",
    ),
    "b9d7d7401234567",
  );
});

test("falls back to the checked-out Git revision for local builds", () => {
  const expectedCommit = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: process.cwd(),
    encoding: "utf8",
  }).trim();
  assert.equal(
    resolveBuildCommit({ GIT_COMMIT: "unknown" }, process.cwd()),
    expectedCommit,
  );
});

test("reports unknown when neither metadata nor Git is available", () => {
  assert.equal(
    resolveBuildCommit({}, "/directory/without/a-git-repository"),
    "unknown",
  );
});