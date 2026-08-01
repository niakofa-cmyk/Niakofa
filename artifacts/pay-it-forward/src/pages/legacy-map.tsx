/**
 * Legacy Family World Map
 * Route: /legacy/map
 *
 * Replaces the "World Map" section's "Full Map" button, which previously
 * linked to /diaspora/timeline (a chronological, non-geographic view).
 * This page renders the family's real family_places (with coordinates)
 * as pins on an actual map, connected by a chronological migration route,
 * via GET /api/legacy/map/:familyId. See legacy-map.ts for how years and
 * chapter tags are derived from real family_events / legacy_chapters rows
 * — nothing here is fabricated or a static stage list.
 *
 * Degrades gracefully: if Mapbox isn't configured, or a family's places
 * don't have coordinates yet, falls back to the same chronological list
 * so the page is still useful.
 */

import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import MapGL, { Marker, Popup, Source, Layer } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import { ArrowLeft, MapPin, Loader2, Church, School, Home, Landmark, Building2, TreePine } from "lucide-react";
import { useAppContext } from "@/lib/AppContext";
import { authHeaders } from "@/lib/auth";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;

interface MapPlace {
  id: number;
  label: string;
  placeType: string | null;
  country: string | null;
  region: string | null;
  lat: number | null;
  lng: number | null;
  notes: string | null;
  year: number | null;
  chapterNumbers: number[];
}

interface MapResponse {
  places: MapPlace[];
  placesWithCoordinates: number;
  placesWithoutCoordinates: number;
  route: [number, number][];
}

const PLACE_ICONS: Record<string, typeof MapPin> = {
  village: Home,
  town: Home,
  city: Building2,
  school: School,
  church: Church,
  cemetery: TreePine,
  business: Building2,
  landmark: Landmark,
};

function iconFor(placeType: string | null) {
  return PLACE_ICONS[placeType ?? ""] ?? MapPin;
}

export default function LegacyMapPage() {
  const { currentUser } = useAppContext();
  const [, navigate] = useLocation();
  const [data, setData] = useState<MapResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activePlaceId, setActivePlaceId] = useState<number | null>(null);

  useEffect(() => {
    if (!currentUser) return;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const familyRes = await fetch("/api/family/mine", { headers: authHeaders() });
        const familyData = familyRes.ok ? await familyRes.json() : { families: [] };
        const families = (familyData.families ?? []).filter((f: { status: string }) => f.status === "active");
        const primaryFamilyId = families[0]?.id;
        if (!primaryFamilyId) {
          setError("Join or create a family to see your world map.");
          return;
        }

        const res = await fetch(`/api/legacy/map/${primaryFamilyId}`, { headers: authHeaders() });
        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: "Failed to load map" }));
          throw new Error(body.error || `HTTP ${res.status}`);
        }
        setData(await res.json() as MapResponse);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load map");
      } finally {
        setLoading(false);
      }
    })();
  }, [currentUser]);

  const placedPlaces = useMemo(() => (data?.places ?? []).filter(p => p.lat !== null && p.lng !== null), [data]);
  const activePlace = placedPlaces.find(p => p.id === activePlaceId) ?? null;

  const routeGeoJSON = useMemo(() => {
    if (!data || data.route.length < 2) return null;
    return {
      type: "Feature" as const,
      properties: {},
      geometry: { type: "LineString" as const, coordinates: data.route },
    };
  }, [data]);

  const initialView = placedPlaces.length > 0
    ? { longitude: placedPlaces[0].lng as number, latitude: placedPlaces[0].lat as number, zoom: 3 }
    : { longitude: 0, latitude: 10, zoom: 1.3 };

  const canShowMap = MAPBOX_TOKEN && placedPlaces.length > 0;

  if (!currentUser) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#1A0F08]">
        <p className="text-amber-700 text-sm">Sign in to view your family world map</p>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-[#1A0F08] text-amber-100 pb-28">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-[#1A0F08]/95 backdrop-blur border-b border-amber-900/30">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate("/legacy")} className="p-2 -ml-2 rounded-lg active:bg-amber-900/30 transition-colors">
            <ArrowLeft className="w-5 h-5 text-amber-500" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-black text-amber-100 uppercase tracking-widest">Family World Map</h1>
            <p className="text-xs text-amber-700">Your family's real places, in the order they were lived</p>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto">
        {loading && (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-amber-500 mb-3" />
            <p className="text-sm text-amber-700">Charting the family world...</p>
          </div>
        )}

        {!loading && error && (
          <div className="text-center py-16 px-4">
            <p className="text-sm text-amber-700">{error}</p>
          </div>
        )}

        {!loading && !error && data && data.places.length === 0 && (
          <div className="text-center py-16 px-4">
            <MapPin className="w-10 h-10 text-amber-900 mx-auto mb-4" />
            <h2 className="text-base font-bold text-amber-200 mb-2">No family places yet</h2>
            <p className="text-sm text-amber-700 mb-6 max-w-xs mx-auto">
              Add villages, homes, schools, or landmarks to the Family Vault and they'll appear here as your family's real map.
            </p>
          </div>
        )}

        {!loading && !error && data && data.places.length > 0 && (
          <>
            {/* Real interactive map, only when Mapbox is configured and at least
                one place has coordinates. */}
            {canShowMap && (
              <div className="relative h-[340px] border-b border-amber-900/30">
                <MapGL
                  mapboxAccessToken={MAPBOX_TOKEN}
                  style={{ width: "100%", height: "100%" }}
                  mapStyle="mapbox://styles/mapbox/dark-v11"
                  attributionControl={false}
                  initialViewState={initialView}
                >
                  {routeGeoJSON && (
                    <Source id="legacy-route" type="geojson" data={routeGeoJSON}>
                      <Layer
                        id="legacy-route-line"
                        type="line"
                        paint={{ "line-color": "#d97706", "line-width": 2, "line-dasharray": [2, 1.5] }}
                      />
                    </Source>
                  )}
                  {placedPlaces.map((p) => {
                    const Icon = iconFor(p.placeType);
                    return (
                      <Marker
                        key={p.id}
                        longitude={p.lng as number}
                        latitude={p.lat as number}
                        anchor="bottom"
                        onClick={(e) => { e.originalEvent.stopPropagation(); setActivePlaceId(p.id); }}
                      >
                        <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center shadow-lg cursor-pointer ${
                          activePlaceId === p.id
                            ? "bg-amber-500 border-amber-200"
                            : "bg-amber-900 border-amber-600"
                        }`}>
                          <Icon className={`w-4 h-4 ${activePlaceId === p.id ? "text-amber-950" : "text-amber-300"}`} />
                        </div>
                      </Marker>
                    );
                  })}
                  {activePlace && (
                    <Popup
                      longitude={activePlace.lng as number}
                      latitude={activePlace.lat as number}
                      anchor="top"
                      closeButton={false}
                      onClose={() => setActivePlaceId(null)}
                    >
                      <div className="text-xs text-stone-900 max-w-[180px]">
                        <p className="font-bold">{activePlace.label}</p>
                        {activePlace.year && <p className="text-stone-600">{activePlace.year}</p>}
                        {activePlace.chapterNumbers.length > 0 && (
                          <p className="text-amber-700 font-semibold">
                            Chapter {activePlace.chapterNumbers.join(", ")}
                          </p>
                        )}
                      </div>
                    </Popup>
                  )}
                </MapGL>
              </div>
            )}

            {!canShowMap && (
              <div className="mx-4 mt-4 bg-[#2A1A0F] border border-amber-900/30 rounded-xl p-3 text-xs text-amber-700">
                {!MAPBOX_TOKEN
                  ? "The interactive map isn't configured yet — showing your family's places as a list instead."
                  : "None of your family's places have coordinates yet — add latitude/longitude in the Family Vault to see them on the map."}
              </div>
            )}

            {/* Chronological list — always shown, doubles as the fallback view. */}
            <div className="px-4 mt-4">
              <h2 className="text-xs font-black text-amber-700 uppercase tracking-widest mb-3">
                The Journey, In Order
              </h2>
              <div className="space-y-3 border-l-2 border-amber-900/40 pl-4 ml-1.5">
                {data.places.map((p) => {
                  const Icon = iconFor(p.placeType);
                  return (
                    <button
                      key={p.id}
                      onClick={() => p.lat !== null && setActivePlaceId(p.id)}
                      className="relative block w-full text-left"
                    >
                      <div className="absolute -left-[22px] top-1.5 w-2.5 h-2.5 rounded-full bg-amber-500" />
                      <div className="bg-[#2A1A0F] border border-amber-900/30 rounded-xl p-3">
                        <div className="flex items-start gap-3">
                          <div className="w-8 h-8 rounded-lg bg-amber-900/40 flex items-center justify-center flex-shrink-0">
                            <Icon className="w-4 h-4 text-amber-500" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-bold text-amber-100">{p.label}</p>
                              {p.year && <span className="text-xs text-amber-600">{p.year}</span>}
                            </div>
                            <p className="text-xs text-amber-700">
                              {[p.placeType, p.region, p.country].filter(Boolean).join(" \u00b7 ") || "Family place"}
                            </p>
                            {p.chapterNumbers.length > 0 && (
                              <p className="text-xs text-amber-500 mt-1 font-semibold">
                                Chapter {p.chapterNumbers.join(", ")}
                              </p>
                            )}
                            {p.lat === null && (
                              <p className="text-xs text-amber-900 mt-1 italic">No coordinates yet</p>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {data.placesWithoutCoordinates > 0 && (
              <p className="text-xs text-amber-800 px-4 mt-4 text-center">
                {data.placesWithoutCoordinates} more {data.placesWithoutCoordinates === 1 ? "place doesn't" : "places don't"} have coordinates yet.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
