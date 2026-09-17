import test from "node:test";
import assert from "node:assert/strict";
import {
  hubScopeLabel,
  messageHubHref,
  parseHubReference,
  resolveHubReference,
} from "@/lib/diaspora/DiasporaHubContext";

const hubs = [
  { id: 10, name: "Brazil", display_name: "Brazil", hub_scope: "country", country_code: "BR", subdivision_code: null },
  { id: 20, name: "Texas", display_name: "Texas", hub_scope: "us_state", country_code: "US", subdivision_code: "TX" },
];

test("V9 labels country and U.S. state Hubs explicitly", () => {
  assert.equal(hubScopeLabel(hubs[0]), "Country Hub");
  assert.equal(hubScopeLabel(hubs[1]), "U.S. state Hub");
});

test("V9 Message Hub links preserve source and target context", () => {
  assert.equal(messageHubHref(10), "/diaspora/messages?sourceHub=10");
  assert.equal(messageHubHref(10, 20), "/diaspora/messages?sourceHub=10&targetHub=20");
  assert.equal(messageHubHref(), "/diaspora/messages");
});

test("V9 Hub references accept ids and display names", () => {
  assert.deepEqual(parseHubReference("20"), { id: 20, name: null });
  assert.deepEqual(parseHubReference("Brazil"), { id: null, name: "Brazil" });
  assert.equal(resolveHubReference(hubs, "20")?.name, "Texas");
  assert.equal(resolveHubReference(hubs, "Brazil")?.id, 10);
  assert.equal(resolveHubReference(hubs, "unknown"), null);
});