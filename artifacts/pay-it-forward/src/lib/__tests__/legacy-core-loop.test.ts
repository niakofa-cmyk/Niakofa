import { describe, it } from "node:test";
import { expect } from "expect";
import { buildWorldChanges } from "../../components/legacy-core-loop";

describe("Legacy core loop world changes", () => {
  it("shows newly unlocked gameplay from the completion response", () => {
    const changes = buildWorldChanges("chapter_complete", {
      newChapterUnlocked: true,
    });

    expect(changes.some((change) => change.type === "new_gameplay")).toBe(true);
  });

  it("does not claim a chapter was unlocked when the response has no next chapter", () => {
    const changes = buildWorldChanges("chapter_complete", {
      newChapterUnlocked: false,
    });

    expect(changes.some((change) => change.type === "new_gameplay")).toBe(false);
  });
});