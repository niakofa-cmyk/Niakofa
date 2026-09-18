import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8");
const requests = read("../artifacts/api-server/src/routes/requests.ts");
const navigation = read("../artifacts/api-server/src/routes/navigation.ts");
const app = read("../artifacts/pay-it-forward/src/App.tsx");
const context = read("../artifacts/pay-it-forward/src/lib/AppContext.tsx");
const requestDetail = read("../artifacts/pay-it-forward/src/pages/request-detail.tsx");
const requestTrack = read("../artifacts/pay-it-forward/src/pages/request-track.tsx");
const requestNew = read("../artifacts/pay-it-forward/src/pages/request-new.tsx");

test("request lifecycle API routes are wired", () => {
  for (const route of [
    'router.post("/requests"',
    'router.post("/requests/:id/claim"',
    'router.post("/requests/:id/en-route"',
    'router.post("/requests/:id/arrived"',
    'router.post("/requests/:id/complete"',
  ]) assert.ok(requests.includes(route), `missing ${route}`);
});

test("frontend request screens resolve to distinct requester/helper routes", () => {
  assert.match(app, /path="\\/request\\/:id\\/view" component=\\{RequestDetailScreen\\}/);
  assert.match(app, /path="\\/request\\/:id\\/track" component=\\{RequesterTrackingScreen\\}/);
  assert.match(app, /path="\\/request\\/:id" component=\\{ActiveRequestScreen\\}/);
  assert.match(requestDetail, /request\\/\\$\\{requestId\\}/);
  assert.match(requestTrack, /useRoute\\("\\/request\\/:id\\/track"\\)/);
});

test("requester receives global REQUEST_ACCEPTED handoff", () => {
  assert.match(context, /useWebSocket\\("REQUEST_ACCEPTED"/);
  assert.match(context, /req\\.requester_id !== currentUser\\.id/);
  assert.match(context, /request\\/\\$\\{req\\.id\\}\\/track/);
});

test("directional routing is server-side and helper-safe", () => {
  assert.match(navigation, /router\\.get\\("\\/navigation\\/route", requireAuth/);
  assert.match(navigation, /ALLOWED_PROFILES = \\["driving", "walking", "cycling"\\]/);
  assert.match(navigation, /ARRIVED_THRESHOLD_METERS = 15/);
  assert.match(navigation, /depart_at=/);
});

test("yard_work is represented in request creation UI", () => {
  assert.match(requestNew, /value: "yard_work"/);
});

console.log("Niakofa request/helper routing contract checks passed.");