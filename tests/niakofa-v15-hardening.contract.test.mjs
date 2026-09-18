import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("V15 keeps a shared Requests Center on both entry points", () => {
  const app = read("artifacts/pay-it-forward/src/App.tsx");
  const community = read("artifacts/pay-it-forward/src/pages/community.tsx");
  const center = read("artifacts/pay-it-forward/src/components/RequestsCenter.tsx");

  assert.match(app, /RequestsCenter/);
  assert.match(app, /path="\/requests"/);
  assert.match(community, /<RequestsCenter embedded \/>/);
  assert.match(center, /status=open/);
  assert.match(center, /requester_id=/);
  assert.match(center, /helper_id=/);
  assert.match(center, /status=completed/);
});

test("V15 consolidates Community Spirals without removing city-wide discovery", () => {
  const community = read("artifacts/pay-it-forward/src/pages/community.tsx");
  const spirals = read("artifacts/pay-it-forward/src/components/CommunitySpiralsTab.tsx");

  assert.match(community, /<CommunitySpiralsTab \/>/);
  assert.doesNotMatch(community, /NeighborhoodSpiralsTab/);
  assert.match(spirals, /citywide/);
  assert.match(spirals, /setInterval/);
  assert.match(spirals, /20_000/);
  assert.match(spirals, /neighborhood_id/);
  assert.match(spirals, /video_enabled/);
});

test("V15 civic completion retries return the existing invoice", () => {
  const civic = read("artifacts/api-server/src/routes/civic.ts");

  assert.match(civic, /eq\(civicNeedsTable\.status, "completed"\)/);
  assert.match(civic, /eq\(civicNeedsTable\.claimed_by_user_id, userId\)/);
  assert.match(civic, /civicInvoicesTable\.civic_need_id/);
  assert.match(civic, /replayed/);
  assert.match(civic, /completion replayed, existing NET30 invoice returned/);
});

test("V15 completion surfaces preserve server error details", () => {
  const civicNavigation = read("artifacts/pay-it-forward/src/pages/civic-task-nav.tsx");
  const activeRequest = read("artifacts/pay-it-forward/src/pages/request-active.tsx");

  assert.match(civicNavigation, /data\.error/);
  assert.match(activeRequest, /Failed to complete/);
  assert.match(activeRequest, /error\.message/);
});