import { useState, useEffect, useRef, useCallback } from "react";
import { useRoute, useLocation } from "wouter";
import Map, { Marker, Source, Layer } from "react-map-gl/mapbox";
import type { MapRef } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import { useAppContext } from "@/lib/AppContext";
import { useGetRequest, useGetRoute, getGetRequestQueryKey, getGetRouteQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Navigation2, Clock, CheckCircle2, Phone, MessageCircle, AlertTriangle, Share2, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { useWebSocket } from "@/lib/useWebSocket";
import { toast } from "@/hooks/use-toast";
import { InAppChat } from "@/components/InAppChat";

function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function parseEtaSeconds(etaText: string): number {
  const minMatch = etaText.match(/(\d+)\s*min/i);
  const hrMatch = etaText.match(/(\d+)\s*hr/i);
  let s = 0;
  if (hrMatch) s += parseInt(hrMatch[1]) * 3600;
  if (minMatch) s += parseInt(minMatch[1]) * 60;
  return s || 0;
}

const STATUS_STEPS = [
  { key: "open",      label: "Posted",      icon: MapPin },
  { key: "claimed",   label: "Matched",     icon: CheckCircle2 },
  { key: "en_route",  label: "On the way",  icon: Navigation2 },
  { key: "arrived",   label: "Arrived",     icon: CheckCircle2 },
  { key: "completed", label: "Completed",   icon: CheckCircle2 },
];

const STATUS_ORDER = ["open", "claimed", "en_route", "arrived", "completed"];

export default function RequesterTrackingScreen() {
  const [, params] = useRoute("/request/:id/track");
  const [, setLocation] = useLocation();
  const { currentUser } = useAppContext();
  const queryClient = useQueryClient();
  const requestId = parseInt(params?.id || "0", 10);
  const mapRef = useRef<MapRef>(null);

  const [helperLocation, setHelperLocation] = useState<{ lat: number; lng: number; heading?: number } | null>(null);
  const [etaCountdown, setEtaCountdown] = useState(0);
  const [showChat, setShowChat] = useState(false);
  const [mapError, setMapError] = useState(false);

  const { data: request, isLoading } = useGetRequest(requestId, {
    query: {
      enabled: !!requestId,
      queryKey: getGetRequestQueryKey(requestId),
      refetchInterval: 10000,
    }
  });

  const routeParams = {
    start_lat: helperLocation?.lat || 0,
    start_lng: helperLocation?.lng || 0,
    end_lat: request?.lat || 0,
    end_lng: request?.lng || 0,
  };

  const { data: routeData } = useGetRoute(routeParams, {
    query: {
      enabled: !!(helperLocation && request && request.status === "en_route"),
      refetchInterval: 15000,
      queryKey: getGetRouteQueryKey(routeParams),
    }
  });

  // ETA countdown
  useEffect(() => {
    if (routeData?.eta_text) setEtaCountdown(parseEtaSeconds(routeData.eta_text));
  }, [routeData?.eta_text]);

  useEffect(() => {
    if (etaCountdown <= 0) return;
    const id = setInterval(() => setEtaCountdown(p => Math.max(0, p - 1)), 1000);
    return () => clearInterval(id);
  }, [etaCountdown > 0]);

  // Auto-zoom to show both helper and requester
  useEffect(() => {
    if (!mapRef.current || !helperLocation || !request) return;
    const lngs = [helperLocation.lng, request.lng];
    const lats = [helperLocation.lat, request.lat];
    mapRef.current.fitBounds(
      [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
      { padding: 100, duration: 1000, maxZoom: 16 }
    );
  }, [helperLocation, request?.lat]);

  // WebSocket — live helper location + request status updates
  useWebSocket(useCallback((event) => {
    if (event.type === "helper_location") {
      const loc = event.payload as { id: number; lat: number; lng: number; heading?: number };
      if (request?.helper_id && loc.id === request.helper_id) {
        setHelperLocation({ lat: loc.lat, lng: loc.lng, heading: loc.heading });
      }
    } else if (event.type === "HELPER_MOVING" || event.type === "request_updated" || event.type === "HELPER_ARRIVED" || event.type === "REQUEST_COMPLETED") {
      const req = event.payload as { id: number };
      if (req.id === requestId) {
        queryClient.invalidateQueries({ queryKey: getGetRequestQueryKey(requestId) });
      }
    } else if (event.type === "REQUEST_COMPLETED" || event.type === "request_updated") {
      const req = event.payload as { id: number; status?: string };
      if (req.id === requestId && req.status === "completed") {
        toast({ title: "✅ Your request is complete!", description: "Your helper finished. Time to pay it forward." });
      }
    }
  }, [requestId, request?.helper_id, queryClient]));

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      await navigator.share({ title: "Track my helper", url }).catch(() => {});
    } else {
      await navigator.clipboard.writeText(url).catch(() => {});
      toast({ title: "Link copied!" });
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!request) {
    return (
      <div className="min-h-[100dvh] bg-background flex flex-col items-center justify-center gap-3 px-6">
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-2">
          <MapPin className="w-8 h-8 text-muted-foreground" />
        </div>
        <p className="font-bold text-lg">Request not found</p>
        <Button variant="outline" onClick={() => setLocation("/")}>Back to map</Button>
      </div>
    );
  }

  const currentStatusIdx = STATUS_ORDER.indexOf(request.status);
  const isCompleted = request.status === "completed";
  const isArrived = request.status === "arrived" || request.status === "completed";
  const hasHelper = !!request.helper_id;
  const etaMin = etaCountdown > 0 ? Math.ceil(etaCountdown / 60) : null;
  const distToHelper = helperLocation
    ? (distanceMeters(helperLocation.lat, helperLocation.lng, request.lat, request.lng) / 1609.34).toFixed(1)
    : null;

  return (
    <div className="relative w-full h-[100dvh] overflow-hidden bg-background">

      {/* Back + share header */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between p-4 pt-safe">
        <Button
          variant="ghost" size="icon"
          onClick={() => setLocation("/")}
          className="rounded-full bg-card/80 backdrop-blur-sm border border-border"
        >
          <ChevronLeft className="w-6 h-6" />
        </Button>

        <div className="flex items-center gap-2">
          {/* ETA pill */}
          {etaMin !== null && !isArrived && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center gap-1.5 bg-primary/20 backdrop-blur-md border border-primary/40 px-3 py-1.5 rounded-full shadow-lg"
            >
              <Navigation2 className="w-3 h-3 text-primary" />
              <span className="text-xs font-black text-primary">{etaMin} min away</span>
            </motion.div>
          )}

          {/* Arrived pill */}
          {isArrived && !isCompleted && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center gap-1.5 bg-green-500/20 backdrop-blur-md border border-green-500/40 px-3 py-1.5 rounded-full shadow-lg"
            >
              <CheckCircle2 className="w-3 h-3 text-green-400" />
              <span className="text-xs font-black text-green-400">Helper arrived!</span>
            </motion.div>
          )}

          <Button
            variant="ghost" size="icon"
            onClick={handleShare}
            className="rounded-full bg-card/80 backdrop-blur-sm border border-border"
          >
            <Share2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Map */}
      {!mapError ? (
        <Map
          mapboxAccessToken={import.meta.env.VITE_MAPBOX_TOKEN}
          initialViewState={{
            longitude: request.lng,
            latitude: request.lat,
            zoom: 14,
          }}
          style={{ width: "100%", height: "100%" }}
          mapStyle="mapbox://styles/mapbox/dark-v11"
          attributionControl={false}
          onError={() => setMapError(true)}
          ref={mapRef}
        >
          {/* My location (requester) */}
          <Marker longitude={request.lng} latitude={request.lat} anchor="center">
            <div className="relative flex items-center justify-center w-10 h-10">
              <div className="absolute w-10 h-10 bg-primary rounded-full opacity-15 animate-ping" style={{ animationDuration: "2.5s" }} />
              <div className="w-4 h-4 bg-primary rounded-full shadow-[0_0_12px_rgba(0,212,255,0.9)] border-2 border-background" />
              <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap">
                <span className="text-[10px] font-bold text-primary bg-card/90 px-1.5 py-0.5 rounded-full border border-primary/30">You</span>
              </div>
            </div>
          </Marker>

          {/* Helper location */}
          {helperLocation && (
            <Marker longitude={helperLocation.lng} latitude={helperLocation.lat} anchor="center">
              <motion.div
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="relative flex items-center justify-center w-12 h-12"
              >
                <div className="absolute w-12 h-12 bg-green-500/20 rounded-full border border-green-500/40" />
                <div className="w-8 h-8 rounded-full overflow-hidden border-2 border-green-400 shadow-[0_0_12px_rgba(34,197,94,0.5)]">
                  {request.helper_name ? (
                    <div className="w-full h-full bg-green-500/20 flex items-center justify-center text-xs font-bold text-green-400">
                      {request.helper_name[0]}
                    </div>
                  ) : (
                    <div className="w-full h-full bg-muted flex items-center justify-center">
                      <Navigation2 className="w-4 h-4 text-green-400" />
                    </div>
                  )}
                </div>
                <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap">
                  <span className="text-[10px] font-bold text-green-400 bg-card/90 px-1.5 py-0.5 rounded-full border border-green-400/30">
                    {request.helper_name ?? "Helper"}
                  </span>
                </div>
              </motion.div>
            </Marker>
          )}

          {/* Route line */}
          {routeData?.geometry && (
            <Source id="helper-route" type="geojson" data={routeData.geometry as unknown as GeoJSON.FeatureCollection}>
              <Layer
                id="route-casing"
                type="line"
                paint={{ "line-color": "#000", "line-width": 8, "line-opacity": 0.3 }}
                layout={{ "line-cap": "round", "line-join": "round" }}
              />
              <Layer
                id="route-line"
                type="line"
                paint={{ "line-color": "#22c55e", "line-width": 4, "line-opacity": 0.8, "line-dasharray": [2, 1] }}
                layout={{ "line-cap": "round", "line-join": "round" }}
              />
            </Source>
          )}
        </Map>
      ) : (
        <div className="absolute inset-0 bg-background flex items-center justify-center">
          <div className="text-center px-6">
            <MapPin className="w-12 h-12 text-primary mx-auto mb-3" />
            <p className="font-bold">Map needs WebGL</p>
            <p className="text-sm text-muted-foreground mt-1">Open in Chrome or Firefox for live tracking</p>
          </div>
        </div>
      )}

      {/* No helper yet — waiting state */}
      {!hasHelper && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-none">
          <div className="bg-card/90 backdrop-blur-md border border-border rounded-2xl px-6 py-4 text-center shadow-2xl">
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse mx-auto mb-2" />
            <p className="font-bold text-sm">Finding a helper nearby…</p>
            <p className="text-xs text-muted-foreground mt-1">You'll be notified when someone accepts</p>
          </div>
        </div>
      )}

      {/* Bottom card */}
      <div className="absolute bottom-0 left-0 right-0 z-20 bg-card border-t border-border rounded-t-3xl shadow-[0_-20px_50px_rgba(0,0,0,0.5)]"
        style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
      >
        {/* Status progress bar */}
        <div className="px-5 pt-4 pb-3 border-b border-border">
          <div className="flex items-center justify-between">
            {STATUS_STEPS.map((step, i) => {
              const done = i <= currentStatusIdx;
              const active = i === currentStatusIdx;
              return (
                <div key={step.key} className="flex flex-col items-center gap-1 flex-1">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center border-2 transition-all ${
                    done
                      ? "bg-primary border-primary"
                      : "bg-muted border-border"
                  } ${active ? "shadow-[0_0_10px_rgba(0,212,255,0.5)]" : ""}`}>
                    <step.icon className={`w-3 h-3 ${done ? "text-primary-foreground" : "text-muted-foreground"}`} />
                  </div>
                  <span className={`text-[10px] font-bold text-center leading-tight ${done ? "text-primary" : "text-muted-foreground"}`}>
                    {step.label}
                  </span>
                  {i < STATUS_STEPS.length - 1 && (
                    <div className={`absolute h-0.5 transition-all ${done ? "bg-primary" : "bg-border"}`}
                      style={{ width: "calc(20% - 24px)", left: `calc(${i * 20 + 10}% + 12px)`, top: "22px" }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="px-5 py-4 space-y-3">
          {/* Helper info */}
          {hasHelper && (
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-green-500/20 border-2 border-green-400/50 flex items-center justify-center shrink-0">
                <span className="text-base font-black text-green-400">
                  {request.helper_name?.[0] ?? "H"}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-black text-sm">{request.helper_name ?? "Helper"}</div>
                <div className="text-xs text-muted-foreground">
                  {request.status === "en_route" ? "On their way to you" :
                   request.status === "arrived" ? "Has arrived" :
                   request.status === "completed" ? "Completed your request" :
                   "Accepted your request"}
                </div>
              </div>
              {distToHelper && !isArrived && (
                <div className="text-right shrink-0">
                  <div className="text-xs font-black text-primary">{distToHelper} mi</div>
                  <div className="text-[10px] text-muted-foreground">away</div>
                </div>
              )}
            </div>
          )}

          {/* Request title */}
          <div className="bg-muted/50 rounded-xl px-3 py-2.5">
            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-0.5">Your Request</div>
            <div className="font-bold text-sm truncate">{request.title}</div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2">
            {hasHelper && !isCompleted && (
              <Button
                variant="outline"
                className="flex-1 h-11 gap-2 text-sm"
                onClick={() => setShowChat(p => !p)}
              >
                <MessageCircle className="w-4 h-4" />
                Chat
              </Button>
            )}
            {isCompleted && (
              <Button
                className="flex-1 h-11 font-black"
                onClick={() => setLocation("/wallet")}
              >
                💙 Pay It Forward
              </Button>
            )}
            {!hasHelper && (
              <Button
                variant="outline"
                className="flex-1 h-11 text-sm"
                onClick={() => setLocation("/")}
              >
                Back to Map
              </Button>
            )}
          </div>

          {/* Chat panel */}
          <AnimatePresence>
            {showChat && hasHelper && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ type: "spring", damping: 25, stiffness: 200 }}
                className="overflow-hidden"
              >
                <InAppChat
                  requestId={requestId}
                  helperName={request.helper_name ?? "Helper"}
                  requesterName={currentUser?.name ?? "You"}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
