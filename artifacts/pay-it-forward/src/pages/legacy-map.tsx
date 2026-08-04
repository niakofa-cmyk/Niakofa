/**
 * Legacy World Map — real family places with GPS check-in + landmark tagging.
 *
 * Shows family_places as pins on a Mapbox map (or a chronological list
 * fallback when Mapbox is unavailable). Each place can be "discovered" by
 * physically visiting it and checking in via GPS. Discovery is family-scoped
 * — the first member to check in unlocks the place for everyone.
 *
 * Families can also tag new landmarks directly from this page via the
 * AddPlaceModal — the write path family_places never had before.
 *
 * Degrades gracefully: if Mapbox isn't configured, or a family's places
 * don't have coordinates yet, falls back to the same chronological list
 * so the page is still useful. Check-in itself degrades gracefully too — if
 * the browser has no geolocation support or the user denies permission, we
 * show a clear message rather than a silently broken button.
 */

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import MapGL, { Marker, Popup, Source, Layer } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import { ArrowLeft, MapPin, Loader2, Church, School, Home, Landmark, Building2, TreePine, CheckCircle2, Navigation, Plus, X, BookOpen, Camera, Star, Compass } from "lucide-react";
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

const PLACE_TYPE_OPTIONS = [
  { value: "village", label: "Village" },
  { value: "town", label: "Town" },
  { value: "city", label: "City" },
  { value: "school", label: "School" },
  { value: "church", label: "Church" },
  { value: "cemetery", label: "Cemetery" },
  { value: "business", label: "Business" },
  { value: "landmark", label: "Landmark" },
] as const;

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

function AddPlaceModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (input: { label: string; placeType?: string; country?: string; region?: string; notes?: string; useCurrentLocation: boolean }) => Promise<void>;
}) {
  const [label, setLabel] = useState("");
  const [placeType, setPlaceType] = useState<string>("landmark");
  const [country, setCountry] = useState("");
  const [region, setRegion] = useState("");
  const [notes, setNotes] = useState("");
  const [useCurrentLocation, setUseCurrentLocation] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!label.trim()) {
      setFormError("Give the place a name.");
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      await onSubmit({ label: label.trim(), placeType, country: country.trim() || undefined, region: region.trim() || undefined, notes: notes.trim() || undefined, useCurrentLocation });
      onClose();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to tag landmark");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div
        className="w-full max-w-md bg-[#2A1A0F] border border-amber-900/40 rounded-2xl p-5 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-black text-amber-100 uppercase tracking-widest">Tag a Family Landmark</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-amber-900/30">
            <X className="w-4 h-4 text-amber-500" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wide text-amber-700">Name</label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Grandma's Church, Cape Coast Castle"
              style={{ fontSize: "16px" }}
              className="mt-1 w-full rounded-lg bg-[#1A0F08] border border-amber-900/40 px-3 py-2 text-sm text-amber-50 placeholder:text-amber-800"
            />
          </div>

          <div>
            <label className="text-[11px] font-bold uppercase tracking-wide text-amber-700">Type</label>
            <select
              value={placeType}
              onChange={(e) => setPlaceType(e.target.value)}
              style={{ fontSize: "16px" }}
              className="mt-1 w-full rounded-lg bg-[#1A0F08] border border-amber-900/40 px-3 py-2 text-sm text-amber-50"
            >
              {PLACE_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wide text-amber-700">Region</label>
              <input
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                style={{ fontSize: "16px" }}
                className="mt-1 w-full rounded-lg bg-[#1A0F08] border border-amber-900/40 px-3 py-2 text-sm text-amber-50"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wide text-amber-700">Country</label>
              <input
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                style={{ fontSize: "16px" }}
                className="mt-1 w-full rounded-lg bg-[#1A0F08] border border-amber-900/40 px-3 py-2 text-sm text-amber-50"
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] font-bold uppercase tracking-wide text-amber-700">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="What happened here?"
              style={{ fontSize: "16px" }}
              className="mt-1 w-full rounded-lg bg-[#1A0F08] border border-amber-900/40 px-3 py-2 text-sm text-amber-50 placeholder:text-amber-800 resize-none"
            />
          </div>

          <label className="flex items-center gap-2 text-xs text-amber-300">
            <input type="checkbox" checked={useCurrentLocation} onChange={(e) => setUseCurrentLocation(e.target.checked)} />
            Use my current location for this place
          </label>

          {formError && <p className="text-xs text-red-400">{formError}</p>}

          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-amber-600 text-white text-sm font-bold py-2.5 active:bg-amber-700 disabled:opacity-60"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {submitting ? "Adding..." : "Add to Family World Map"}
          </button>
        </div>
      </div>
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
  const [showAddPlace, setShowAddPlace] = useState(false);
  const [geocodingInProgress, setGeocodingInProgress] = useState(false);
  const backfillFiredRef = useRef(false);

  const refetchMap = useCallback(async (targetFamilyId: number) => {
    try {
      const res = await fetch(`/api/legacy/map/${targetFamilyId}`, { headers: authHeaders() });
      if (!res.ok) return;
      const body = await res.json();
      setData(body);
    } catch {
      // Non-fatal — the just-added place is still saved even if the refresh fails.
    }
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    (async () => {
      try {
        const famRes = await fetch("/api/family/mine", { headers: authHeaders() });
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
        const body = await res.json() as MapResponse;
        setData(body);

        // Auto-trigger geocoding backfill if any places lack coordinates.
        // Only fire once per mount so navigating away and back doesn't re-trigger.
        if (
          body.placesWithoutCoordinates > 0 &&
          !backfillFiredRef.current
        ) {
          backfillFiredRef.current = true;
          setGeocodingInProgress(true);
          fetch(`/api/legacy/map/${primaryFamilyId}/places/geocode-missing`, {
            method: "POST",
            headers: authHeaders(),
          })
            .then(async (r) => {
              if (r.ok) {
                const result = await r.json() as { updated: number };
                if (result.updated > 0) {
                  // Re-fetch so newly geocoded places appear on the map
                  await refetchMap(primaryFamilyId);
                }
              }
            })
            .catch(() => {/* non-fatal */})
            .finally(() => setGeocodingInProgress(false));
        }
      } catch {
        setError("Failed to load map data.");
      } finally {
        setLoading(false);
      }
    })();
  }, [currentUser, refetchMap]);

  const addPlace = useCallback(async (input: { label: string; placeType?: string; country?: string; region?: string; notes?: string; useCurrentLocation: boolean }) => {
    if (!familyId) throw new Error("No family selected");

    let lat: number | undefined;
    let lng: number | undefined;

    if (input.useCurrentLocation && "geolocation" in navigator) {
      try {
        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 });
        });
        lat = position.coords.latitude;
        lng = position.coords.longitude;
      } catch {
        // Location denied/unavailable — still save the place without coordinates.
      }
    }

    const res = await fetch(`/api/legacy/map/${familyId}/places`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        label: input.label,
        placeType: input.placeType,
        country: input.country,
        region: input.region,
        notes: input.notes,
        lat,
        lng,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(body.error || `HTTP ${res.status}`);
    }

    setError(null);
    await refetchMap(familyId);
  }, [familyId, refetchMap]);

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
                ? { ...p, discovered: true, discoveredAt: body.discoveredAt ?? new Date().toISOString(), discoveredBy: body.discoveredBy ?? p.discoveredBy }
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
        <button onClick={() => navigate("/legacy")} className="text-amber-500 text-xs underline">Back to map</button>
      </div>
    );
  }

  if (!data || data.places.length === 0) {
    return (
      <div className="min-h-screen bg-[#1A0F08] flex flex-col items-center justify-center gap-4 p-6">
        <p className="text-amber-400 text-sm text-center">No family places yet. Tag your first landmark to start building your world map.</p>
        <button
          onClick={() => setShowAddPlace(true)}
          className="flex items-center gap-2 rounded-lg bg-amber-600 text-white text-sm font-bold px-4 py-2.5 active:bg-amber-700"
        >
          <Plus className="w-4 h-4" />
          Tag a Landmark
        </button>
        <button onClick={() => navigate("/legacy")} className="text-amber-500 text-xs underline">Back to map</button>
        {showAddPlace && (
          <AddPlaceModal onClose={() => setShowAddPlace(false)} onSubmit={addPlace} />
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#1A0F08] flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-amber-900/30">
        <button onClick={() => navigate("/legacy")} className="flex items-center gap-1 text-amber-500 text-xs font-semibold">
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <div className="text-center">
          <h1 className="text-sm font-black text-amber-100 uppercase tracking-widest">Family World Map</h1>
          <p className="text-xs text-amber-700">Your family's real places, in the order they were lived</p>
        </div>
        <div className="flex-shrink-0 flex items-center gap-2">
          {data.places.length > 0 && (
            <div className="text-right">
              <p className="text-sm font-black text-amber-400">{data.placesDiscovered}/{data.places.length}</p>
              <p className="text-[10px] text-amber-800 uppercase tracking-wide">Discovered</p>
            </div>
          )}
          <button
            onClick={() => setShowAddPlace(true)}
            className="p-2 rounded-lg bg-amber-900/40 active:bg-amber-900/60"
            aria-label="Tag a landmark"
          >
            <Plus className="w-4 h-4 text-amber-400" />
          </button>
        </div>
      </div>

      {showAddPlace && (
        <AddPlaceModal onClose={() => setShowAddPlace(false)} onSubmit={addPlace} />
      )}

      {/* Journey Progress sidebar */}
      <div className="px-4 py-3 bg-[#1A0F08] border-b border-amber-900/20">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <Compass className="w-3.5 h-3.5 text-amber-500" />
            <span className="text-[10px] text-amber-700 uppercase tracking-wide">Places</span>
            <span className="text-xs font-bold text-amber-400">{data.placesDiscovered}/{data.places.length}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <BookOpen className="w-3.5 h-3.5 text-amber-500" />
            <span className="text-[10px] text-amber-700 uppercase tracking-wide">Stories</span>
            <span className="text-xs font-bold text-amber-400">{data.places.filter(p => p.discovered).length}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Camera className="w-3.5 h-3.5 text-amber-500" />
            <span className="text-[10px] text-amber-700 uppercase tracking-wide">Memories</span>
            <span className="text-xs font-bold text-amber-400">{data.places.filter(p => p.discovered && p.chapterNumbers.length > 0).length}</span>
          </div>
          {geocodingInProgress && (
            <div className="flex items-center gap-1.5 ml-auto animate-pulse">
              <Loader2 className="w-3 h-3 text-amber-600 animate-spin" />
              <span className="text-[10px] text-amber-700 uppercase tracking-wide">Locating places…</span>
            </div>
          )}
          {data.route.length > 0 && !geocodingInProgress && (
            <div className="flex items-center gap-1.5 ml-auto">
              <Navigation className="w-3.5 h-3.5 text-amber-500" />
              <span className="text-[10px] text-amber-700 uppercase tracking-wide">Route</span>
              <span className="text-xs font-bold text-amber-400">{data.route.length} stops</span>
            </div>
          )}
        </div>
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
                  coordinates: (data?.route && data.route.length > 0 ? data.route : placedPlaces.map(p => [p.lng!, p.lat!] as [number, number])) as [number, number][],
                },
              }}>
                <Layer id="route-line" type="line" layout={{ "line-join": "round", "line-cap": "round" }} paint={{ "line-color": "#f59e0b", "line-width": 2, "line-opacity": 0.5 }} />
                <Layer id="route-dots" type="circle" paint={{ "circle-radius": 3, "circle-color": "#f59e0b", "circle-opacity": 0.7 }} />
              </Source>
            )}

            {/* Year labels on migration route stops */}
            {placedPlaces.length > 1 && placedPlaces.map((p, i) => {
              if (!p.lng || !p.lat || !p.year) return null;
              return (
                <Marker key={`year-${p.id}`} longitude={p.lng} latitude={p.lat + 0.5} anchor="bottom">
                  <div className="text-[9px] text-amber-400/80 font-bold bg-[#1A0F08]/80 px-1.5 py-0.5 rounded whitespace-nowrap">
                    {p.year}
                  </div>
                </Marker>
              );
            })}
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
                          <p className="text-xs text-amber-800 mt-1 italic">
                            {geocodingInProgress ? "Locating…" : "Coordinates pending"}
                          </p>
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
