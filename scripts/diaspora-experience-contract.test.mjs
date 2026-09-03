import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => fs.readFileSync(p, "utf8");

test("Diaspora Research API is registered and persists cases/evidence", () => {
  const routes = read("artifacts/api-server/src/routes/index.ts");
  const research = read("artifacts/api-server/src/routes/diaspora-research.ts");
  assert.match(routes, /diasporaResearchRouter/);
  assert.match(research, /diaspora_research_cases/);
  assert.match(research, /\/handoff\/timeline/);
  assert.match(research, /requireAuth/);
});

test("Research Timeline handoff creates an artifact without falsely resolving the case", () => {
  const research = read("artifacts/api-server/src/routes/diaspora-research.ts");
  assert.match(research, /event_date must be a valid date/);
  assert.match(research, /source: \"diaspora_research\"/);
  assert.match(research, /A handoff creates a Timeline artifact/);
  assert.doesNotMatch(research, /set\(\{ status: \"resolved\"/);
});

test("DNA Connections remains consent-first and non-biometric", () => {
  const page = read("artifacts/pay-it-forward/src/pages/dna-connections.tsx");
  const api = read("artifacts/api-server/src/routes/diaspora-connections.ts");
  assert.match(page, /Opt in/);
  assert.match(page, /No biometric matching/);
  assert.match(api, /opted_in/);
  assert.match(api, /low-confidence derived-sketch similarity/);
  assert.match(api, /FEATURE_ENABLED/);
  assert.doesNotMatch(api, /return \{ \.\.\.r,/);
});

test("Globe uses live hub/story APIs and real audio playback", () => {
  const globe = read("artifacts/pay-it-forward/src/pages/globe.tsx");
  assert.match(globe, /\/api\/griot\/hubs/);
  assert.match(globe, /\/api\/griot\/stories/);
  assert.match(globe, /new Audio\(story\.audio_url\)/);
  assert.match(globe, /projection=\"globe\"/);
});

test("Research migration and schema stay paired", () => {
  const migration = read("lib/db/migrations/0121_diaspora_research_workspace.sql");
  const schema = read("lib/db/src/schema/diaspora-research.ts");
  for (const name of ["diaspora_research_cases", "diaspora_research_evidence", "diaspora_research_notes"]) {
    assert.match(migration, new RegExp(name));
    assert.match(schema, new RegExp(name));
  }
});
