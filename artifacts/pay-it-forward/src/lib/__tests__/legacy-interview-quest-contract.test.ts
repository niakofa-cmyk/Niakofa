import { describe, it } from "node:test";
import { expect } from "expect";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

describe("Legacy interview quest submission contract", () => {
  it("validates transcripts before creating quests and reuses retry IDs", () => {
    const source = readFileSync(
      fileURLToPath(new URL("../../pages/legacy-interview-quest.tsx", import.meta.url)),
      "utf8",
    );

    const transcriptValidation = source.indexOf("if (finalTranscript.length < 10)");
    const questStart = source.indexOf("const startRes = await fetch");

    expect(transcriptValidation).toBeGreaterThan(-1);
    expect(questStart).toBeGreaterThan(transcriptValidation);
    expect(source).toContain("let interviewId = questId;");
    expect(source).toContain("setQuestId(interviewId);");
    expect(source).toContain("setQuestId(null);");
  });
});