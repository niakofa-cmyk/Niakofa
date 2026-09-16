#!/usr/bin/env node
/**
 * Deterministically hardens the current DiasporaGlobeFirst implementation.
 *
 * Target:
 * artifacts/pay-it-forward/src/components/diaspora/DiasporaGlobeFirst.tsx
 *
 * This patch intentionally refuses to run if expected source anchors are
 * missing, preventing silent partial edits after unrelated refactors.
 */

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const target = path.join(
  root,
  "artifacts/pay-it-forward/src/components/diaspora/DiasporaGlobeFirst.tsx",
);

if (!fs.existsSync(target)) {
  throw new Error(`Target not found: ${target}`);
}

let source = fs.readFileSync(target, "utf8");

function replaceOnce(from, to, label) {
  const count = source.split(from).length - 1;
  if (count !== 1) {
    throw new Error(`${label}: expected exactly 1 match, found ${count}`);
  }
  source = source.replace(from, to);
}

replaceOnce(
  'import Map, { Marker } from "react-map-gl/mapbox";',
  'import Map, { Marker, NavigationControl, type MapRef } from "react-map-gl/mapbox";',
  "Map import",
);

replaceOnce(
  'import { useEffect, useMemo, useState } from "react";',
  'import { useEffect, useMemo, useRef, useState } from "react";',
  "React hooks import",
);

replaceOnce(
  'function hubLabel(hub: Hub) { return hub.display_name?.trim() || hub.name; }',
  `function hubLabel(hub: Hub) { return hub.display_name?.trim() || hub.name; }

function flagForHub(hub: Hub): string {
  const code = hub.country_code?.trim().toUpperCase() ?? "";
  if (!/^[A-Z]{2}$/.test(code)) return "•";
  return [...code]
    .map((letter) => String.fromCodePoint(127397 + letter.charCodeAt(0)))
    .join("");
}`,
  "Hub helpers",
);

replaceOnce(
  `  const [, navigate] = useLocation();
  const [selectedHub, setSelectedHub] = useState<Hub | null>(null);`,
  `  const [, navigate] = useLocation();
  const mapRef = useRef<MapRef | null>(null);
  const [selectedHub, setSelectedHub] = useState<Hub | null>(null);`,
  "Map ref",
);

replaceOnce(
  `  const filteredHubs = useMemo(() => hubs.filter((hub) => matchesQuery(hub, query)), [hubs, query]);
  const openHub = (hub: Hub) => { setSelectedHub(hub); setQuery(""); };`,
  `  const filteredHubs = useMemo(() => hubs.filter((hub) => matchesQuery(hub, query)), [hubs, query]);

  const focusHub = (hub: Hub) => {
    mapRef.current?.flyTo({
      center: [hub.lng, hub.lat],
      zoom: hub.hub_scope === "us_state" ? 4.2 : 3.1,
      duration: 1100,
      essential: true,
    });
  };

  const openHub = (hub: Hub) => {
    setSelectedHub(hub);
    setQuery("");
    focusHub(hub);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (messageHub) {
        setMessageHub(null);
        return;
      }
      if (selectedHub) setSelectedHub(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [messageHub, selectedHub]);`,
  "Hub focus and keyboard behavior",
);

replaceOnce(
  `      {token ? <Map initialViewState={{ longitude: -20, latitude: 18, zoom: 1.25 }} projection="globe" mapStyle="mapbox://styles/mapbox/dark-v11" mapboxAccessToken={token} attributionControl={false}>
        {filteredHubs.map((hub) => <Marker key={hub.id} longitude={hub.lng} latitude={hub.lat} anchor="center"><button onClick={() => openHub(hub)} aria-label={\`Open ${hubLabel(hub)} Hub\`} title={hubLabel(hub)} className={\`relative h-11 w-11 rounded-full border-2 shadow-lg transition-transform hover:scale-110 ${hub.is_crisis ? "border-rose-300 bg-rose-300/30" : "border-teal-300 bg-teal-300/25"}\`}><span aria-hidden="true" className="pointer-events-none absolute inset-1 rounded-full border border-white/30 motion-safe:animate-pulse motion-reduce:animate-none" /></button></Marker>)}
      </Map>`,
  `      {token ? <Map
        ref={mapRef}
        initialViewState={{ longitude: -20, latitude: 18, zoom: 1.25 }}
        projection="globe"
        mapStyle="mapbox://styles/mapbox/dark-v11"
        mapboxAccessToken={token}
        attributionControl={false}
      >
        <NavigationControl
          position="top-right"
          showZoom
          showCompass
          visualizePitch={false}
        />
        {filteredHubs.map((hub) => (
          <Marker key={hub.id} longitude={hub.lng} latitude={hub.lat} anchor="center">
            <button
              onClick={() => openHub(hub)}
              aria-label={\`Open ${hubLabel(hub)} Hub\`}
              title={hubLabel(hub)}
              className={\`relative flex h-11 w-11 items-center justify-center rounded-full border-2 shadow-lg transition-transform hover:scale-110 ${
                selectedHub?.id === hub.id
                  ? "scale-110 border-white bg-teal-200/35 ring-4 ring-teal-200/20"
                  : hub.is_crisis
                    ? "border-rose-300 bg-rose-300/30"
                    : "border-teal-300 bg-teal-300/25"
              }\`}
            >
              <span className="text-[15px] leading-none" aria-hidden="true">{flagForHub(hub)}</span>
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-1 rounded-full border border-white/30 motion-safe:animate-pulse motion-reduce:animate-none"
              />
            </button>
          </Marker>
        ))}
      </Map>`,
  "Globe map and markers",
);

replaceOnce(
  `          <p className="mt-2 text-[10px] text-white/30">{filteredHubs.length} canonical Hubs · Select a marker or search result</p>`,
  `          <p className="mt-2 text-[10px] text-white/30" aria-live="polite">{filteredHubs.length} canonical Hubs · Select a marker or search result</p>`,
  "Search result announcement",
);

replaceOnce(
  `          {selectedHub.local_hubs && selectedHub.local_hubs.length > 1 && <div className="border-t border-white/10 px-3 py-3"><p className="text-[9px] font-bold uppercase tracking-[0.14em] text-white/30">Local communities</p><p className="mt-1 text-[11px] leading-relaxed text-white/50">{selectedHub.local_hubs.map((local) => local.name).join(" · ")}</p></div>}`,
  `          {selectedHub.local_hubs && selectedHub.local_hubs.length > 0 && (
            <div className="border-t border-white/10 px-3 py-3">
              <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-white/30">Local communities</p>
              <div className="mt-2 grid gap-1.5">
                {selectedHub.local_hubs.map((local) => (
                  <button
                    key={local.hub_id}
                    onClick={() => navigate(\`/community?hubId=\${local.hub_id}\`)}
                    className={\`flex min-h-11 items-center justify-between gap-3 rounded-lg border border-white/5 bg-white/[0.02] px-3 text-left text-[11px] text-white/60 hover:bg-white/[0.05] hover:text-white \${diasporaTheme.focus}\`}
                  >
                    <span className="min-w-0 truncate">{local.name}</span>
                    <span className="shrink-0 text-[9px] text-white/30">{local.member_count} members</span>
                  </button>
                ))}
              </div>
            </div>
          )}`,
  "Local community actions",
);

replaceOnce(
  `<div className="flex max-h-[92%] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-teal-300/20 bg-[#0a1918] shadow-2xl">`,
  `<div className="flex max-h-[calc(100%-1.5rem)] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-teal-300/20 bg-[#0a1918] shadow-2xl sm:max-h-[92%] sm:rounded-2xl">`,
  "Mobile messaging height",
);

fs.writeFileSync(target, source);
console.log(`Applied Diaspora Globe V2 hardening to ${target}`);
