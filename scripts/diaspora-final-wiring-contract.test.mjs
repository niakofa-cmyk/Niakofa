import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (file) => fs.readFileSync(new URL(file, import.meta.url), "utf8");

test("Research page uses the six-type evidence selector and posts evidence_type", () => {
  const page = read("../artifacts/pay-it-forward/src/pages/research-center.tsx");
  assert.match(page, /ResearchEvidenceTypeSelect/);
  assert.match(page, /evidence_type: evidenceType/);
  for (const type of ["document", "shared_segment", "pedigree", "oral_history", "place_history", "dna_profile"]) {
    assert.match(read("../artifacts/pay-it-forward/src/lib/diaspora/researchEvidence.ts"), new RegExp(type));
  }
});

test("Preserve scan context has durable browser handoff and recorder association", () => {
  const link = read("../artifacts/pay-it-forward/src/lib/diaspora/oralHistoryDeepLink.ts");
  const preserve = read("../artifacts/pay-it-forward/src/pages/preserve-culture.tsx");
  assert.match(link, /persistPreserveScanContext/);
  assert.match(link, /preserve\/links\//);
  assert.match(link, /url\.match\(/, "expected Preserve handoff to inspect the family-memory route matcher");
  assert.match(link, /api.*family.*memories/, "expected family memory API route");
  assert.match(preserve, /data\.scan_id/);
  assert.match(preserve, /preserve_scan_id/);
});

test("Dashboard labels the nine-item value as a curated Heritage catalog", () => {
  const page = read("../artifacts/pay-it-forward/src/pages/diaspora-dashboard.tsx");
  assert.match(page, /Curated heritage catalog/);
  assert.match(page, /heritage_collections/);
});

test("Globe renders migration arcs from the great-circle geometry helper", () => {
  const page = read("../artifacts/pay-it-forward/src/pages/globe.tsx");
  const geometry = read("../artifacts/pay-it-forward/src/lib/diaspora/greatCircle.ts");
  assert.match(page, /greatCirclePath/);
  assert.match(page, /projection=\"globe\"/);
  assert.match(geometry, /greatCirclePath/);
  assert.match(geometry, /Math\.acos/);
});

test("DNA Connections surfaces the explicit provenance boundary", () => {
  const page = read("../artifacts/pay-it-forward/src/pages/dna-connections.tsx");
  const notice = read("../artifacts/pay-it-forward/src/components/diaspora/DnaProvenanceNotice.tsx");
  assert.match(page, /DnaProvenanceNotice/);
  assert.match(notice, /derived-sketch similarity/);
  assert.match(notice, /shared-cM/);
  assert.match(notice, /IBD/);
});

test("Live E2E suite is explicitly gated for authenticated DB writes", () => {
  const spec = read("../e2e/diaspora-final-wiring-live.spec.ts");
  assert.match(spec, /ALLOW_MUTATING_E2E/);
  assert.match(spec, /Research evidence creation/);
  assert.match(spec, /Preserve repeat scans/);
  assert.match(spec, /DNA opt-in then revoke/);
});
