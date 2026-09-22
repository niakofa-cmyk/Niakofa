import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const spiralPaths = read("artifacts/pay-it-forward/src/lib/spirals.ts");
const spiralRoutes = read("artifacts/api-server/src/routes/index.ts");
const spiralTests = read("artifacts/api-server/src/__tests__/audio-circles.test.ts");
const dnaPage = read("artifacts/pay-it-forward/src/pages/dna-connections.tsx");
const dnaNotice = read("artifacts/pay-it-forward/src/components/diaspora/DnaProvenanceNotice.tsx");
const researchPage = read("artifacts/pay-it-forward/src/pages/research-center.tsx");
const countyScope = read("artifacts/api-server/src/lib/community-scope.ts");
const civic = read("artifacts/api-server/src/routes/civic.ts");
const diaspora = read("artifacts/api-server/src/routes/diaspora.ts");

assert.match(spiralPaths, /\/audio-spirals/);
assert.match(spiralPaths, /\/audio-spiral\//);
assert.match(spiralRoutes, /audio-spiral-sessions/);
assert.match(spiralRoutes, /audio-spirals/);
assert.match(spiralTests, /audio-spiral-sessions/);
assert.match(spiralTests, /audio-spirals/);

assert.match(dnaPage, /DnaProvenanceNotice/);
assert.match(dnaNotice, /derived-sketch similarity/);
assert.match(dnaNotice, /shared-cM/);
assert.match(dnaNotice, /IBD/);

assert.match(researchPage, /ResearchEvidenceTypeSelect/);
assert.match(researchPage, /evidence_type/);
assert.match(researchPage, /\/evidence/);

assert.match(countyScope, /normalizeCounty/);
assert.match(civic, /communitiesTable\.county/);
assert.match(civic, /communitiesTable\.state/);
assert.match(diaspora, /heritage_collections/);

console.log("PASS: production readiness contracts — Spirals, Diaspora DNA/Research, county scope");
