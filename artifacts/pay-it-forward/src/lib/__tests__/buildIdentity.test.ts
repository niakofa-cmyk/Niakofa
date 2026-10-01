import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isHealthCommitPayload,
  normalizeBuildCommit,
  shouldNotifyForBuildUpdate,
} from "../buildIdentity";

describe("build identity comparison", () => {
  it("normalizes known commit identifiers and ignores unknown identities", () => {
    assert.equal(normalizeBuildCommit("  abc123  "), "abc123");
    assert.equal(normalizeBuildCommit("unknown"), null);
    assert.equal(normalizeBuildCommit(" UNKNOWN "), null);
    assert.equal(normalizeBuildCommit(""), null);
    assert.equal(normalizeBuildCommit(undefined), null);
  });

  it("notifies only when both known commits differ", () => {
    assert.equal(shouldNotifyForBuildUpdate("old-sha", "new-sha"), true);
    assert.equal(shouldNotifyForBuildUpdate("same-sha", "same-sha"), false);
    assert.equal(shouldNotifyForBuildUpdate("unknown", "new-sha"), false);
    assert.equal(shouldNotifyForBuildUpdate("old-sha", null), false);
  });

  it("accepts only health payloads with a string commit", () => {
    assert.equal(isHealthCommitPayload({ commit: "abc123" }), true);
    assert.equal(isHealthCommitPayload({ commit: 1 }), false);
    assert.equal(isHealthCommitPayload(null), false);
  });
});