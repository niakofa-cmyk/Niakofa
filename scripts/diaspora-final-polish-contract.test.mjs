import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("Preserve scan endpoint is null-safe and exposes idempotent scan semantics", () => {
  const source = read("artifacts/api-server/src/routes/diaspora-completion.ts");
  assert.match(source, /isNull\(diasporaPreserveLinksTable\.memory_id\)/);
  assert.match(source, /idempotent: true/);
  assert.match(source, /idempotent: false/);
  assert.match(source, /createHash\("sha256"\)/);
});

test("Research evidence vocabulary is centralized and complete", () => {
  const source = read("artifacts/pay-it-forward/src/lib/diaspora/researchEvidence.ts");
  for (const type of ["document", "shared_segment", "pedigree", "oral_history", "place_history", "dna_profile"]) {
    assert.match(source, new RegExp(`\\\"${type}\\\"`));
  }
  assert.match(source, /provider shared-cM match/);
});

test("Research evidence selector exposes every backend-supported evidence kind", () => {
  const source = read("artifacts/pay-it-forward/src/components/diaspora/ResearchEvidenceTypeSelect.tsx");
  assert.match(source, /RESEARCH_EVIDENCE_TYPES\.map/);
  assert.match(source, /Evidence type/);
});

test("DNA remains explicitly provenance-safe", () => {
  const source = read("artifacts/api-server/src/routes/dna-matching.ts");
  assert.match(source, /shared-cM/);
  assert.match(source, /derived-sketch/);
  assert.match(source, /confidence/);
});
