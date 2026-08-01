/**
 * Legacy World Map — real family places with GPS check-in.
 *
 * Shows family_places as pins on a Mapbox map (or a chronological list
 * fallback when Mapbox is unavailable). Each place can be "discovered" by
 * physically visiting it and checking in via GPS. Discovery is family-scoped
 * — the first member to check in unlocks the place for everyone.
 *
 * Degrades gracefully: if Mapbox isn't configured, or a family's places
 * don't have coordinates yet, falls back to the same chronological list
 * so the page is still useful. Check-in itself degrades gracefully too — if
 * the browser has no geolocation support or the user denies permission, we
 * show a clear message rather than a silently broken button.
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import { useLocation } from "wouter";
import MapGL, { Marker, Popup, Source, Layer } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import { ArrowLeft, MapPin, Loader2, Church, School, Home, Landmark, Building2, TreePine, CheckCircle2, Navigation } from "lucide-react";
import { useAppContext } from "@/lib/AppContext";
import { authHeaders } from "@/lib/auth";

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
  discovered: boolean;
  discoveredAt: string | null;
  discoveredBy: string | null;
}

interface MapResponse {
  places: MapPlace[];
  placesWithCoordinates: number;
  placesWithoutCoordinates: number;
  placesDiscovered: number;
  route: [number, number][];
}

type CheckinState =
  | { status: "idle" }
  | { status: "locating" }
  | { status: "submitting" }
  | { status: "error"; message: string };

const PLACE_ICONS: Record<string, typeof MapPin> = {
  village: Home,
  town: Home,
  city: Building2,
  school: School,
  church: Church,
  cemetery: Landmark,
  business: Building2,
  landmark: Landmark,
  river: TreePine,
};

function iconFor(placeType: string | null) {
  return PLACE_ICONS[placeType ?? ""] ?? MapPin;
}

function PlaceDiscoveryControl({
  place,
  checkinState,
  onCheckIn,
  variant = "popup",
}: {
  place: MapPlace;
  checkinState: CheckinState | undefined;
  onCheckIn: (placeId: number) => void;
  variant?: "popup" | "list";
}) {
  const state = checkinState ?? { status: "idle" as const };
  const busy = state.status === "locating" || state.status === "submitting";
  const light = variant === "popup";

  if (place.discovered) {
    return (
      <p className={`mt-1.5 flex items-center gap-1 text-[11px] font-semibold ${light ? "text-emerald-700" : "text-emerald-400"}`}>
        <CheckCircle2 className="w-3.5 h-3.5" />
        Discovered{place.discoveredBy ? ` by ${place.discoveredBy}` : ""}
      </p>
    );
  }

  return (
    <div className="mt-1.5" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => onCheckIn(place.id)}
        disabled={busy}
        className={`flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide rounded-md px-2 py-1 transition-colors ${
          light
            ? "bg-amber-600 text-white active:bg-amber-700 disabled:opacity-60"
            : "bg-amber-900/50 text-amber-400 active:bg-amber-900/70 disabled:opacity-60"
        }`}
      >
        {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Navigation className="w-3 h-3" />}
        {state.status === "locating" ? "Locating..." : state.status === "submitting" ? "Checking in..." : "Check In Here"}
      </button>
      {state.status === "error" && (
        <p className={`mt-1 text-[10px] ${light ? "text-red-600" : "text-red-400"}`}>{state.message}</p>
      )}
    </div>
  );
}

export default function LegacyMapPage() {
  const { currentUser } = useAppContext();
  const [, navigate] = useLocation();
  const [data, setData] = useState<MapResponse | null>(null);
  const [familyId, setFamilyId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activePlaceId, setActivePlaceId] = useState<number | null>(null);
  const [checkins, setCheckins] = useState<Record<number, CheckinState>>({});

  useEffect(() => {
    if (!currentUser) return;
    (async () => {
      try {
        const famRes = await fetch("/api/families", { headers: authHeaders() });
        const famBody = await famRes.json().catch(() => ({}));
        const primaryFamilyId = famBody?.families?.[0]?.id;
        if (!primaryFamilyId) {
          setError("Join or create a family to see your world map.");
          return;
        }
        setFamilyId(primaryFamilyId);

        const res = await fetch(`/api/legacy/map/${primaryFamilyId}`, { headers: authHeaders() });
        if (!res.ok) {
          setError("Failed to load map data.");
          return;
        }
        const body = await res.json();
        setData(body);
      } catch {
        setError("Failed to load map data.");
      } finally {
        setLoading(false);
      }
    })();
  }, [currentUser]);

  const checkIn = useCallback((placeId: number) => {
    if (!familyId) return;

    if (!("geolocation" in navigator)) {
      setCheckins((c) => ({ ...c, [placeId]: { status: "error", message: "This device/browser doesn't support location — try checking in from your phone." } }));
      return;
    }

    setCheckins((c) => ({ ...c, [placeId]: { status: "locating" } }));

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        setCheckins((c) => ({ ...c, [placeId]: { status: "submitting" } }));
        try {
          const res = await fetch(`/api/legacy/map/${familyId}/places/${placeId}/checkin`, {
            method: "POST",
            headers: { ...authHeaders(), "Content-Type": "application/json" },
            body: JSON.stringify({
              lat: position.coords.latitude,
              lng: position.coords.longitude,
              accuracyMeters: position.coords.accuracy,
            }),
          });
          const body = await res.json().catch(() => ({}));
          if (!res.ok) {
            throw new Error(body.error || `HTTP ${res.status}`);
          }

          setCheckins((c) => ({ ...c, [placeId]: { status: "idle" } }));
          setData((d) => {
            if (!d) return d;
            const places = d.places.map((p) =>
              p.id === placeId && !p.discovered
                ? { ...p, discovered: true, discoveredAt: body.discoveredAt ?? new Date().toISOString(), discoveredBy: p.discoveredBy }
                : p,
            );
            return { ...d, places, placesDiscovered: places.filter((p) => p.discovered).length };
          });
        } catch (err) {
          setCheckins((c) => ({ ...c, [placeId]: { status: "error", message: err instanceof Error ? err.message : "Check-in failed" } }));
        }
      },
      (geoErr) => {
        const message = geoErr.code === geoErr.PERMISSION_DENIED
          ? "Location access was denied — enable it in your browser/device settings to check in."
          : "Couldn't get your location. Move outdoors or try again.";
        setCheckins((c) => ({ ...c, [placeId]: { status: "error", message } }));
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  }, [familyId]);

  const placedPlaces = useMemo(() => (data?.places ?? []).filter(p => p.lat !== null && p.lng !== null), [data]);
  const activePlace = placedPlaces.find(p => p.id === activePlaceId) ?? null;

  const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#1A0F08]">
        <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#1A0F08] flex flex-col items-center justify-center gap-4 p-6">
        <p className="text-amber-400 text-sm text-center">{error}</p>
        <button onClick={() => navigate("/")} className="text-amber-500 text-xs underline">Back to map</button>
      </div>
    );
  }

  if (!data || data.places.length === 0) {
    return (
      <div className="min-h-screen bg-[#1A0F08] flex flex-col items-center justify-center gap-4 p-6">
        <p className="text-amber-400 text-sm text-center">No family places yet. Add locations in the Family Vault to see your world map.</p>
        <button onClick={() => navigate("/")} className="text-amber-500 text-xs underline">Back to map</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#1A0F08] flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-amber-900/30">
        <button onClick={() => navigate("/")} className="flex items-center gap-1 text-amber-500 text-xs font-semibold">
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <div className="text-center">
          <h1 className="text-sm font-black text-amber-100 uppercase tracking-widest">Family World Map</h1>
          <p className="text-xs text-amber-700">Your family's real places, in the order they were lived</p>
        </div>
        {data.places.length > 0 && (
          <div className="flex-shrink-0 text-right">
            <p className="text-sm font-black text-amber-400">{data.placesDiscovered}/{data.places.length}</p>
            <p className="text-[10px] text-amber-800 uppercase tracking-wide">Discovered</p>
          </div>
        )}
      </div>

      {mapboxToken && placedPlaces.length > 0 ? (
        <div className="flex-1 relative">
          <MapGL
            initialViewState={{
              longitude: placedPlaces[0].lng!,
              latitude: placedPlaces[0].lat!,
              zoom: 3,
            }}
            mapStyle="mapbox://styles/mapbox/dark-v11"
            mapboxAccessToken={mapboxToken}
            style={{ width: "100%", height: "100%" }}
          >
            {placedPlaces.map((p) => {
              const Icon = iconFor(p.placeType);
              return (
                <Marker
                  key={p.id}
                  longitude={p.lng!}
                  latitude={p.lat!}
                  anchor="bottom"
                  onClick={(e) => { e.originalEvent.stopPropagation(); setActivePlaceId(p.id); }}
                >
                  <div className={`relative w-8 h-8 rounded-full border-2 flex items-center justify-center shadow-lg cursor-pointer ${
                    p.discovered
                      ? "bg-amber-500 border-amber-200"
                      : activePlaceId === p.id
                        ? "bg-stone-700 border-amber-500"
                        : "bg-stone-800 border-stone-600 opacity-70"
                  }`}>
                    <Icon className={`w-4 h-4 ${p.discovered ? "text-amber-950" : "text-stone-400"}`} />
                    {p.discovered && (
                      <CheckCircle2 className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 text-emerald-400 bg-[#1A0F08] rounded-full" />
                    )}
                  </div>
                </Marker>
              );
            })}

            {activePlace && (
              <Popup
                longitude={activePlace.lng!}
                latitude={activePlace.lat!}
                closeButton={false}
                onClose={() => setActivePlaceId(null)}
              >
                <div className="text-xs text-stone-900 max-w-[200px]">
                  <p className="font-bold">{activePlace.label}</p>
                  {activePlace.year && <p className="text-stone-600">{activePlace.year}</p>}
                  {activePlace.chapterNumbers.length > 0 && (
                    <p className="text-stone-500 text-[10px] mt-0.5">
                      Chapter {activePlace.chapterNumbers.join(", ")}
                    </p>
                  )}
                  <PlaceDiscoveryControl place={activePlace} checkinState={checkins[activePlace.id]} onCheckIn={checkIn} />
                </div>
              </Popup>
            )}

            {placedPlaces.length > 1 && (
              <Source id="route" type="geojson" data={{
                type: "Feature",
                properties: {},
                geometry: {
                  type: "LineString",
                  coordinates: placedPlaces.map((p) => [p.lng!, p.lat!]),
                },
              }}>
                <Layer id="route-line" type="line" layout={{ "line-join": "round", "line-cap": "round" }} paint={{ "line-color": "#f59e0b", "line-width": 2, "line-opacity": 0.5 }} />
              </Source>
            )}
          </MapGL>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <div className="relative pl-6">
            <div className="absolute left-[10px] top-0 bottom-0 w-px bg-amber-900/40" />
            {data.places.map((p) => {
              const Icon = iconFor(p.placeType);
              return (
                <div
                  key={p.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => p.lat !== null && setActivePlaceId(p.id)}
                  onKeyDown={(e) => { if (e.key === "Enter" && p.lat !== null) setActivePlaceId(p.id); }}
                  className="relative block w-full text-left cursor-pointer mb-3"
                >
                  <div className={`absolute -left-[22px] top-1.5 w-2.5 h-2.5 rounded-full ${p.discovered ? "bg-emerald-500" : "bg-amber-500"}`} />
                  <div className={`bg-[#2A1A0F] border rounded-xl p-3 ${p.discovered ? "border-emerald-900/50" : "border-amber-900/30"}`}>
                    <div className="flex items-start gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${p.discovered ? "bg-emerald-900/30" : "bg-amber-900/40"}`}>
                        <Icon className={`w-4 h-4 ${p.discovered ? "text-emerald-400" : "text-amber-500"}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-amber-200 text-sm">{p.label}</p>
                          {p.year && <span className="text-[10px] text-amber-700">{p.year}</span>}
                        </div>
                        {p.country && <p className="text-xs text-amber-800 mt-0.5">{p.country}{p.region ? `, ${p.region}` : ""}</p>}
                        {p.notes && <p className="text-xs text-amber-700 mt-1 line-clamp-2">{p.notes}</p>}
                        {p.chapterNumbers.length > 0 && (
                          <p className="text-[10px] text-amber-600 mt-1">Chapter {p.chapterNumbers.join(", ")}</p>
                        )}
                        {p.lat === null && (
                          <p className="text-xs text-amber-900 mt-1 italic">No coordinates yet</p>
                        )}
                        {p.lat !== null && (
                          <PlaceDiscoveryControl place={p} checkinState={checkins[p.id]} onCheckIn={checkIn} variant="list" />
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
