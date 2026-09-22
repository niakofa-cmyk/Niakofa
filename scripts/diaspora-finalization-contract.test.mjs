import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { estimateDnaRelationship } from "../artifacts/api-server/src/lib/dna-matching-engine.ts";

test("DNA sketch similarity is symmetric and bounded", () => {
  const left = { markerSketch: Array.from({ length: 64 }, (_, i) => i), markerCount: 64 };
  const right = { markerSketch: Array.from({ length: 64 }, (_, i) => i + 16), markerCount: 64 };
  const a = estimateDnaRelationship(left, right);
  const b = estimateDnaRelationship(right, left);
  assert.ok(a);
  assert.deepEqual(a, b);
  assert.ok(a.similarityScore >= 0 && a.similarityScore <= 1);
  assert.equal(a.confidence, "low");
});

test("DNA engine never invents a cM value", async () => {
  const source = await readFile(new URL("../artifacts/api-server/src/routes/dna-matching.ts", import.meta.url), "utf8");
  assert.match(source, /shared_cm_est:\s*null/);
  assert.match(source, /no shared-cM/);
});

test("DNA result schema and migration agree that shared cM is nullable", async () => {
  const schema = await readFile(new URL("../lib/db/src/schema/dna-matching.ts", import.meta.url), "utf8");
  const migration = await readFile(new URL("../lib/db/migrations/0123_dna_matching_shared_cm_nullable.sql", import.meta.url), "utf8");
  assert.match(schema, /shared_cm_est: integer\("shared_cm_est"\)/);
  assert.match(migration, /ALTER COLUMN shared_cm_est DROP NOT NULL/);
});

test("Diaspora app exposes the canonical Globe, Research, and DNA routes", async () => {
  const source = await readFile(new URL("../artifacts/pay-it-forward/src/App.tsx", import.meta.url), "utf8");
  for (const route of ["/diaspora/heritage/globe", "/diaspora/research", "/diaspora/dna"]) {
    assert.match(source, new RegExp(route.replaceAll("/", "\\/")));
  }
});

test("Research migration and schema remain paired", async () => {
  const schema = await readFile(new URL("../lib/db/src/schema/diaspora-research.ts", import.meta.url), "utf8");
  const migration = await readFile(new URL("../lib/db/migrations/0121_diaspora_research_workspace.sql", import.meta.url), "utf8");
  for (const name of ["diaspora_research_cases", "diaspora_research_evidence", "diaspora_research_notes"]) {
    assert.match(schema, new RegExp(name));
    assert.match(migration, new RegExp(name));
  }
});

test("Research evidence supports all semantic evidence kinds", async () => {
  const schema = await readFile(new URL("../lib/db/src/schema/diaspora-research.ts", import.meta.url), "utf8");
  for (const kind of ["document", "shared_segment", "pedigree", "oral_history", "place_history", "dna_profile"]) {
    assert.match(schema, new RegExp(kind));
  }
});
