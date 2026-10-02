import { describe, test } from "node:test";
import * as assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
  formatParkDistance,
  getParkAddress,
  getParkDirectionsUrl,
  parseMapboxParkFeatures,
} from "../park-preview-utils";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const source = (relativePath: string) =>
  fs.readFileSync(path.join(__dirname, relativePath), "utf8");

describe("Park Preview", () => {
  test("keeps validated park POIs, rejects unrelated or malformed places, and deduplicates IDs", () => {
    const parks = parseMapboxParkFeatures({
      features: [
        {
          id: "poi.park-1",
          text: "Riverside Park",
          place_name: "Riverside Park, Chicago, Illinois",
          geometry: { coordinates: [-87.6, 41.8] },
          properties: { category: "Recreation & Parks" },
        },
        {
          id: "poi.play-2",
          text: "Westside Playfield",
          geometry: { coordinates: [-87.7, 41.9] },
          properties: { category: "Playground" },
        },
        {
          id: "poi.home-3",
          text: "Parkview Homes",
          geometry: { coordinates: [-87.5, 41.7] },
          properties: { category: "Residential" },
        },
        {
          id: "poi.bad-4",
          text: "Bad Coordinates Park",
          geometry: { coordinates: [300, 41.8] },
        },
        {
          id: "poi.bad-5",
          text: "Malformed Address Park",
          place_name: { city: "Chicago" },
          geometry: { coordinates: [-87.6, 41.8] },
        },
        {
          id: "poi.park-1",
          text: "Duplicate Park",
          geometry: { coordinates: [-87.6, 41.8] },
          properties: { category: "Park" },
        },
      ],
    });

    assert.deepEqual(parks.map((park) => park.id), ["poi.park-1"]);
    assert.equal(getParkAddress(parks[0]), "Chicago, Illinois");
  });

  test("formats distance in the selected locale units", () => {
    assert.equal(formatParkDistance(850, "metric"), "850 m away");
    assert.equal(formatParkDistance(1500, "metric"), "1.5 km away");
    assert.equal(formatParkDistance(400, "imperial"), "1310 ft away");
    assert.equal(formatParkDistance(3218.688, "imperial"), "2.0 mi away");
    assert.equal(formatParkDistance(-1, "metric"), "");
  });

  test("directions target the real coordinates without altering them", () => {
    const url = new URL(getParkDirectionsUrl({
      id: "poi.park",
      text: "Riverside Park",
      geometry: { coordinates: [-87.6, 41.8] },
    }));
    assert.equal(url.origin, "https://www.google.com");
    assert.equal(url.pathname, "/maps/dir/");
    assert.equal(url.searchParams.get("api"), "1");
    assert.equal(url.searchParams.get("destination"), "41.8,-87.6");
  });

  test("registers Park Preview as a route and exposes it from the map and shared navigation", () => {
    const app = source("../../App.tsx");
    const mapNav = source("../../components/BottomNav.tsx");
    const sharedNav = source("../appNavItems.ts");
    assert.match(app, /<Route path="\/parks" component=\{ParkPreviewPage\} \/>/);
    assert.match(mapNav, /href="\/parks"/);
    assert.match(mapNav, /aria-label="Open Park Preview"/);
    assert.match(mapNav, /data-testid="link-park-preview-map-menu"/);
    assert.match(sharedNav, /key: "parks", label: "Park Preview", icon: Trees, href: "\/parks", testId: "link-park-preview"/);
  });

  test("loads real nearby results and discloses the external location lookup", () => {
    const page = source("../../pages/park-preview.tsx");
    assert.match(page, /api\.mapbox\.com\/geocoding\/v5\/mapbox\.places\/park\.json/);
    assert.match(page, /parseMapboxParkFeatures\(payload\)/);
    assert.match(page, /Mapbox processes your location query/);
    assert.match(page, /getParkDirectionsUrl\(park\)/);
    assert.match(page, /button-enable-location/);
    assert.doesNotMatch(page, /localStorage\.(?:setItem|removeItem).*park/i);
  });
});