import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { globeHref, parseGlobeHubQuery, resolveHubFromQuery } from "../artifacts/pay-it-forward/src/lib/diaspora/globeHubDeepLink.ts";
import { RESEARCH_STATUSES, RESEARCH_CONFIDENCE, canTransition, assertTransition } from "../artifacts/pay-it-forward/src/lib/diaspora/researchCaseStatus.ts";
import { assertTransition as assertTransitionServer } from "../artifacts/api-server/src/lib/research-case-status.ts";
import { sanitizeDnaCandidate, sanitizeConnectionsPayload } from "../artifacts/api-server/src/lib/sanitize-dna-connections.ts";
import { buildDnaEvidencePayload } from "../artifacts/pay-it-forward/src/lib/diaspora/dnaEvidenceTemplate.ts";
import { relationshipBandCopy } from "../artifacts/pay-it-forward/src/lib/diaspora/relationshipBandCopy.ts";

test("Globe links use the canonical route and preserve a hub", () => {
  assert.equal(globeHref({ hubId: 42 }), "/diaspora/heritage/globe?hub=42");
  assert.equal(globeHref({ hubName: "Fort Worth" }), "/diaspora/heritage/globe?hubName=Fort%20Worth");
  assert.equal(globeHref(), "/diaspora/heritage/globe");
});

test("Globe query parsing accepts numeric IDs and names", () => {
  assert.deepEqual(parseGlobeHubQuery("?hub=7"), { hubId: 7, hubName: null });
  assert.deepEqual(parseGlobeHubQuery("?hub=bad"), { hubId: null, hubName: null });
  assert.deepEqual(parseGlobeHubQuery("?hubName=Accra"), { hubId: null, hubName: "Accra" });
});

test("Globe hub resolution prefers ID, then case-insensitive name", () => {
  const hubs = [{ id: 1, name: "Fort Worth" }, { id: 2, name: "Accra" }];
  assert.equal(resolveHubFromQuery(hubs, { hubId: 2, hubName: null })?.name, "Accra");
  assert.equal(resolveHubFromQuery(hubs, { hubId: null, hubName: "fort worth" })?.id, 1);
  assert.equal(resolveHubFromQuery(hubs, { hubId: 99, hubName: null }), null);
});

test("frontend and API research enums stay aligned", async () => {
  const source = await readFile(new URL("../artifacts/api-server/src/routes/diaspora-research.ts", import.meta.url), "utf8");
  for (const status of RESEARCH_STATUSES) assert.match(source, new RegExp(`"${status}"`));
  for (const confidence of RESEARCH_CONFIDENCE) assert.match(source, new RegExp(`"${confidence}"`));
});

test("research cases support pause, resolve, and explicit reopen", () => {
  assert.equal(canTransition("open", "paused"), true);
  assert.equal(canTransition("paused", "resolved"), true);
  assert.equal(canTransition("resolved", "open"), true);
  assert.equal(canTransition("resolved", "paused"), false);
  assert.equal(assertTransition("open", "resolved"), "resolved");
  assert.throws(() => assertTransition("resolved", "paused"));
});

test("server transition validation mirrors the frontend", () => {
  assert.deepEqual(assertTransitionServer("open", "resolved"), { ok: true, status: "resolved" });
  assert.equal(assertTransitionServer("resolved", "paused").ok, false);
});

test("server route guards transitions and does not auto-resolve Timeline handoff", async () => {
  const source = await readFile(new URL("../artifacts/api-server/src/routes/diaspora-research.ts", import.meta.url), "utf8");
  assert.match(source, /assertTransition\(row\.status, nextStatus\)/);
  const handoffRoute = source.slice(source.indexOf("handoff/timeline"));
  assert.doesNotMatch(handoffRoute, /status:\s*"resolved"/);
  assert.match(handoffRoute, /does not mean the research case[\s\S]*is resolved/);
});

test("DNA response sanitizer strips internal candidate fields", () => {
  const clean = sanitizeDnaCandidate({
    id: 1,
    candidate_name: "J. Doe",
    candidate_family_name: "Doe Family",
    relation_note: null,
    similarity_score: 0.42,
    confidence: "low",
    source: "derived-sketch",
    relationship_band: "possible distant relative",
    matched_user_id: 999,
    other_user_email: "leak@example.com",
  });
  assert.equal(clean.matched_user_id, undefined);
  assert.equal(clean.other_user_email, undefined);
  assert.equal(clean.candidate_name, "J. Doe");
});

test("Connections payload sanitizer preserves caveats", () => {
  const payload = sanitizeConnectionsPayload({
    enabled: true,
    opted_in: true,
    caveat: "not proof",
    candidates: [{ id: 1, candidate_name: "A", other_user_email: "leak@example.com" }],
  });
  assert.equal(payload.caveat, "not proof");
  assert.equal(payload.candidates[0].other_user_email, undefined);
});

test("Connections route applies the sanitizer", async () => {
  const source = await readFile(new URL("../artifacts/api-server/src/routes/diaspora-connections.ts", import.meta.url), "utf8");
  assert.match(source, /sanitizeConnectionsPayload\(/);
});

test("DNA evidence remains possible and explicitly caveated", () => {
  const payload = buildDnaEvidencePayload({
    candidate_name: "J. Doe",
    candidate_family_name: "Doe Family",
    similarity_score: 0.65,
    source: "derived-sketch",
    relationship_band: "possible distant relative",
  });
  assert.equal(payload.confidence, "possible");
  assert.match(payload.notes, /not shared-cM/);
  assert.match(payload.citation, /65%/);
});

test("relationship copy stays hedged", () => {
  assert.match(relationshipBandCopy("possible cousin", "high"), /still verify with records/);
  assert.match(relationshipBandCopy("possible cousin", "low"), /research lead only/);
});