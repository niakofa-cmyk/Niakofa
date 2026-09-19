import { useEffect, useMemo, useState } from "react";
import Map, { Layer, Marker, Source } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import { Clock3, MapPinned, Navigation2, Radio } from "lucide-react";
import { authHeaders } from "@/lib/auth";
import { useAppContext } from "@/lib/AppContext";
import { wsSubscribe, type WsEvent } from "@/lib/wsClient";

type RequestContext = {
  id: number;
  title: string;
  status: string;
  requester_id: number;
  helper_id: number | null;
  requester_name?: string | null;
  helper_name?: string | null;
  lat: number;
  lng: number;
};

type LocationPoint = { lat: number; lng: number; heading?: number | null };

type RouteData = {
  geometry?: { type: string; coordinates: number[][] };
  distance_text?: string;
  eta_text?: string;
  duration_seconds?: number;
};

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;

export function RequestLiveMapCard({
  request,
  currentUserId,
}: {
  request: RequestContext;
  currentUserId: number;
}) {
  const { myLocation } = useAppContext();
  const isHelper = request.helper_id === currentUserId;
  const [helperLocation, setHelperLocation] = useState<LocationPoint | null>(null);
  const [route, setRoute] = useState<RouteData | null>(null);
  const [loadingRoute, setLoadingRoute] = useState(false);

  const start = isHelper
    ? (myLocation ? { lat: myLocation.lat, lng: myLocation.lng } : null)
    : helperLocation;

  useEffect(() => {
    if (isHelper || !request.helper_id) return;
    const unsubscribe = wsSubscribe((event: WsEvent) => {
      if (event.type !== "helper_location") return;
      const payload = event.payload as { id?: number; lat?: number; lng?: number; heading?: number } | null;
      if (payload?.id !== request.helper_id || typeof payload.lat !== "number" || typeof payload.lng !== "number") return;
      setHelperLocation({ lat: payload.lat, lng: payload.lng, heading: payload.heading });
    });
    return unsubscribe;
  }, [isHelper, request.helper_id]);

  useEffect(() => {
    let cancelled = false;
    if (!start || !Number.isFinite(request.lat) || !Number.isFinite(request.lng)) {
      setRoute(null);
      return;
    }

    const controller = new AbortController();
    setLoadingRoute(true);
    const params = new URLSearchParams({
      start_lat: String(start.lat),
      start_lng: String(start.lng),
      end_lat: String(request.lat),
      end_lng: String(request.lng),
      profile: "driving",
    });

    void fetch(`/api/navigation/route?${params.toString()}`, {
      headers: authHeaders(),
      signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) throw new Error("Route unavailable");
      const data = await response.json() as RouteData;
      if (!cancelled) setRoute(data);
    }).catch(() => {
      if (!cancelled) setRoute(null);
    }).finally(() => {
      if (!cancelled) setLoadingRoute(false);
    });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [request.lat, request.lng, start?.lat, start?.lng]);

  const center = start ?? { lat: request.lat, lng: request.lng };
  const routeGeometry = useMemo(() => route?.geometry ?? null, [route?.geometry]);

  if (!MAPBOX_TOKEN) {
    return (
      <div className="mb-4 rounded-3xl border border-primary/20 bg-primary/5 p-4">
        <div className="flex items-center gap-2 text-xs font-black text-primary"><MapPinned className="h-4 w-4" /> Live Request Map</div>
        <p className="mt-2 text-xs text-muted-foreground">Map preview is unavailable because the Mapbox browser token is not configured.</p>
      </div>
    );
  }

  return (
    <div className="mb-4 overflow-hidden rounded-3xl border border-primary/20 bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">Live Request Map</p>
          <p className="mt-1 text-sm font-black">{isHelper ? "Your route to the requester" : "Your helper's live route"}</p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/5 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-primary">
          <Radio className="h-3 w-3" /> Live
        </span>
      </div>
      <div className="relative h-56 sm:h-64">
        <Map
          mapboxAccessToken={MAPBOX_TOKEN}
          initialViewState={{ longitude: center.lng, latitude: center.lat, zoom: 14 }}
          longitude={center.lng}
          latitude={center.lat}
          zoom={14}
          style={{ width: "100%", height: "100%" }}
          mapStyle="mapbox://styles/mapbox/dark-v11"
          attributionControl={false}
        >
          {start && <Marker longitude={start.lng} latitude={start.lat} anchor="center"><div className="h-4 w-4 rounded-full border-2 border-white bg-primary shadow-[0_0_14px_rgba(0,212,255,0.9)]" /></Marker>}
          <Marker longitude={request.lng} latitude={request.lat} anchor="bottom"><MapPinned className="h-8 w-8 fill-primary text-primary drop-shadow-[0_0_10px_rgba(0,212,255,0.8)]" /></Marker>
          {routeGeometry && (
            <Source id={`request-route-${request.id}`} type="geojson" data={routeGeometry as unknown as GeoJSON.Feature<GeoJSON.LineString>}>
              <Layer id={`request-route-line-${request.id}`} type="line" paint={{ "line-color": "#00d4ff", "line-width": 5, "line-opacity": 0.9 }} layout={{ "line-cap": "round", "line-join": "round" }} />
            </Source>
          )}
        </Map>
        {loadingRoute && <div className="absolute left-3 top-3 rounded-full border border-border bg-card/90 px-2.5 py-1.5 text-[10px] font-black backdrop-blur">Updating route…</div>}
      </div>
      <div className="grid grid-cols-2 gap-3 border-t border-border px-4 py-3">
        <div><p className="text-[9px] font-black uppercase tracking-wider text-muted-foreground">ETA</p><p className="mt-1 flex items-center gap-1 text-sm font-black"><Clock3 className="h-3.5 w-3.5 text-primary" />{route?.eta_text || "Calculating…"}</p></div>
        <div><p className="text-[9px] font-black uppercase tracking-wider text-muted-foreground">Distance</p><p className="mt-1 flex items-center gap-1 text-sm font-black"><Navigation2 className="h-3.5 w-3.5 text-primary" />{route?.distance_text || "Updating…"}</p></div>
      </div>
    </div>
  );
}
